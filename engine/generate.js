import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { SEOModule } from './seo.js';
import { ContentEngine } from './content.js';
import { EnrichmentEngine } from './enrichment.js';

/**
 * PageFactory — the engine core.
 * Reads templates, fills slots, writes output files.
 */
export class PageFactory {
  constructor(config = {}) {
    this.config = config;
    this.seo = new SEOModule(config.site);
    this.content = new ContentEngine(config);
    this.enrichment = new EnrichmentEngine(config);
    this.configDir = config._configDir || process.cwd();
    this.outputDir = config.outputDir || './output';
    this.stats = { generated: 0, skipped: 0, errors: 0, lowEnrichment: 0 };
    this.errors = [];
    this.manifests = new Map();
    this.noindexedSlugs = new Set();
  }

  async init() {
    await this.content.init();
    await this.enrichment.init();
    return this;
  }

  /**
   * Generate all pages for a ClusterMap.
   * Hub pages are generated first, then spokes.
   */
  async generateAll(clusterMap, linker) {
    mkdirSync(this.outputDir, { recursive: true });

    const templateMap = this._buildTemplateMap();
    const allPages = [...clusterMap.clusters.values()].flatMap(c => c.pages);

    // Hub pages first
    const hubPages = allPages.filter(p => p.isHub);
    const spokePages = allPages.filter(p => !p.isHub);

    console.log(`[generate] Building ${hubPages.length} hub pages...`);
    for (const page of hubPages) {
      await this._generatePage(page, clusterMap, templateMap, linker);
    }

    console.log(`[generate] Building ${spokePages.length} spoke pages...`);
    for (const page of spokePages) {
      await this._generatePage(page, clusterMap, templateMap, linker);
    }

    return this.stats;
  }

  async _generatePage(page, clusterMap, templateMap, linker) {
    try {
      const { urlSlug, clusterId } = page;
      const templateConfig = templateMap.get(clusterId);

      if (!templateConfig) {
        this._error(urlSlug, `No template configured for cluster "${clusterId}"`);
        return;
      }

      const { templateFile, manifest } = templateConfig;
      const templateHtml = readFileSync(templateFile, 'utf8');

      // Build context
      const context = this._buildContext(page, clusterMap, manifest);

      // Generate slot content
      const allSlots = [...(manifest.requiredSlots || []), ...(manifest.optionalSlots || [])];
      let slots;
      try {
        slots = await this.content.generatePage(allSlots, context, manifest.contentRules || {});
      } catch (err) {
        this._error(urlSlug, `Content generation failed: ${err.message}`);
        return;
      }

      // Inject internal links
      if (linker) {
        slots.internal_links = linker.getLinksHtml(urlSlug);
      }

      // Build breadcrumbs
      slots.breadcrumbs = this.seo._buildBreadcrumbHtml(context);

      // Check noindex threshold against the page's unique content
      // (body + FAQ — both are keyword-specific; nav/footer boilerplate is not)
      const wordCount = this._wordCount(`${slots.body_content || ''} ${slots.faq_block || ''}`);
      context.noindex = wordCount < (this.config.crawlGuards?.noindexThreshold || 150);
      if (context.noindex) this.noindexedSlugs.add(urlSlug);

      // Build SEO head and structured data
      const headContent = this.seo.buildHead(context, manifest, slots);
      const jsonLd = this.seo.buildStructuredData(context, manifest, slots);

      // Inject slots into template
      let html = templateHtml;
      html = this._injectHead(html, headContent, jsonLd);
      html = this._injectSlots(html, slots);

      // Write via adapter
      this._writeOutput(urlSlug, html, manifest.frameworkAdapter || this.config.site?.frameworkAdapter || 'html');
      this.stats.generated++;

    } catch (err) {
      this._error(page.urlSlug, err.message, err.stack);
    }
  }

  _injectHead(html, headContent, jsonLd) {
    // ─── SURGICAL INJECTION STRATEGY ─────────────────────────────────────────
    // The engine NEVER replaces the entire <head> block.
    // It only touches the specific SEO tags it owns.
    // Every other tag in <head> — charset, viewport, fonts, icons,
    // preconnects, stylesheets, scripts — is left exactly as-is.
    // ─────────────────────────────────────────────────────────────────────────

    const headPattern = /(<head[^>]*>)([\s\S]*?)(<\/head>)/i;
    const match = html.match(headPattern);

    if (!match) {
      // No <head> found at all — safe to prepend a new one
      return `<head>\n${headContent}\n${jsonLd}\n</head>\n${html}`;
    }

    let headBlock = match[2]; // original head content — preserve entirely

    // 1. Replace <title> if it exists, otherwise insert after <head>
    if (/<title[^>]*>/i.test(headBlock)) {
      headBlock = headBlock.replace(/<title[^>]*>[\s\S]*?<\/title>/i,
        this._extractTag(headContent, 'title'));
    } else {
      headBlock = this._extractTag(headContent, 'title') + '\n' + headBlock;
    }

    // 2. Replace or insert meta description
    if (/<meta[^>]+name="description"/i.test(headBlock)) {
      headBlock = headBlock.replace(/<meta[^>]+name="description"[^>]*>/i,
        this._extractMetaByName(headContent, 'description'));
    } else {
      headBlock += '\n' + this._extractMetaByName(headContent, 'description');
    }

    // 3. Replace or insert canonical
    if (/<link[^>]+rel="canonical"/i.test(headBlock)) {
      headBlock = headBlock.replace(/<link[^>]+rel="canonical"[^>]*>/i,
        this._extractLinkByRel(headContent, 'canonical'));
    } else {
      headBlock += '\n' + this._extractLinkByRel(headContent, 'canonical');
    }

    // 4. Replace or insert robots meta
    if (/<meta[^>]+name="robots"/i.test(headBlock)) {
      headBlock = headBlock.replace(/<meta[^>]+name="robots"[^>]*>/i,
        this._extractMetaByName(headContent, 'robots'));
    } else {
      headBlock += '\n' + this._extractMetaByName(headContent, 'robots');
    }

    // 5. Remove any existing OG/Twitter/hreflang tags (engine owns these entirely)
    headBlock = headBlock.replace(/<meta[^>]+property="og:[^"]*"[^>]*>/gi, '');
    headBlock = headBlock.replace(/<meta[^>]+name="twitter:[^"]*"[^>]*>/gi, '');
    headBlock = headBlock.replace(/<link[^>]+rel="alternate"[^>]+hreflang[^>]*>/gi, '');

    // 6. Append OG tags, Twitter tags, hreflang, and JSON-LD at end of head
    const ogBlock = this._extractBlockByComment(headContent, 'Open Graph');
    const twitterBlock = this._extractBlockByComment(headContent, 'Twitter Card');
    headBlock += `\n${ogBlock}\n${twitterBlock}\n`;

    // 7. Remove any existing JSON-LD blocks (engine regenerates these)
    headBlock = headBlock.replace(/<script[^>]+type="application\/ld\+json"[\s\S]*?<\/script>/gi, '');

    // 8. Append fresh JSON-LD before closing head
    headBlock += `\n${jsonLd}\n`;

    // 9. Reconstruct: opening tag + modified head content + closing tag
    //    Everything else in the document is byte-for-byte identical
    return html.replace(headPattern, `${match[1]}${headBlock}${match[3]}`);
  }

  // ─── Head tag extraction helpers ───────────────────────────────────────────

  _extractTag(html, tagName) {
    const match = html.match(new RegExp(`<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'i'));
    return match ? match[0] : '';
  }

  _extractMetaByName(html, name) {
    const patterns = [
      new RegExp(`<meta[^>]+name="${name}"[^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content="[^"]*"[^>]+name="${name}"[^>]*>`, 'i')
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return m[0];
    }
    return '';
  }

  _extractLinkByRel(html, rel) {
    const match = html.match(new RegExp(`<link[^>]+rel="${rel}"[^>]*>`, 'i'));
    return match ? match[0] : '';
  }

  _extractBlockByComment(html, commentLabel) {
    // Extracts everything between <!-- Label --> and the next blank line or comment
    const pattern = new RegExp(`<!-- ${commentLabel} -->([\\s\\S]*?)(?=\\n\\s*\\n|<!-- |$)`, 'i');
    const match = html.match(pattern);
    return match ? `<!-- ${commentLabel} -->${match[1]}` : '';
  }

  _injectSlots(html, slots) {
    let result = html;

    // Separate <body> from <head> so slot injection ONLY operates on body content.
    // This prevents any accidental match inside <head> tags, JSON-LD, or script blocks.
    const bodyPattern = /(<body[^>]*>)([\s\S]*)(<\/body>)/i;
    const bodyMatch = result.match(bodyPattern);

    if (!bodyMatch) {
      // No <body> tag — apply to full document (unlikely but safe fallback)
      return this._replaceSlots(result, slots);
    }

    const beforeBody = result.slice(0, result.indexOf(bodyMatch[0]));
    const bodyOpen = bodyMatch[1];
    let bodyContent = bodyMatch[2];
    const bodyClose = bodyMatch[3];

    // Only inject slots inside <body> — never touches <head>, scripts, or styles
    bodyContent = this._replaceSlots(bodyContent, slots);

    return beforeBody + bodyOpen + bodyContent + bodyClose;
  }

  _replaceSlots(html, slots) {
    let result = html;

    for (const [name, value] of Object.entries(slots)) {
      if (value === undefined || value === null) continue;

      // {{{slot_name}}} — raw HTML slot (unescaped), e.g. body_content, faq_block
      // Must be checked FIRST before the double-brace pattern
      result = result.replace(
        new RegExp(`\\{\\{\\{\\s*${name}\\s*\\}\\}\\}`, 'g'),
        () => String(value)
      );

      // {{slot_name}} — text slot (HTML-escaped), e.g. meta_title, h1, cta_text
      const escaped = String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      result = result.replace(
        new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'),
        () => escaped
      );
    }

    return result;
  }

  _writeOutput(urlSlug, html, adapter) {
    switch (adapter) {
      case 'nextjs': {
        const dir = join(this.outputDir, 'pages');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${urlSlug}.jsx`), this._wrapNextJs(urlSlug, html));
        break;
      }
      case 'astro': {
        const dir = join(this.outputDir, 'src', 'pages');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${urlSlug}.astro`), this._wrapAstro(urlSlug, html));
        break;
      }
      case 'nuxt': {
        const dir = join(this.outputDir, 'pages');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${urlSlug}.vue`), this._wrapNuxt(urlSlug, html));
        break;
      }
      case 'html':
      default: {
        const dir = join(this.outputDir, urlSlug);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), html);
        break;
      }
    }
  }

  _wrapNextJs(slug, html) {
    // Extract just the <body> content — the Next.js component renders inside
    // your existing layout, so we only pass the body content as a prop.
    // Your existing _app.js / layout.js wraps it — we never touch those.
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1].trim() : html;

    // Carry the SEO tags into a next/head block so the shipped page keeps its
    // title, meta description, canonical, robots, OG/Twitter tags, and JSON-LD.
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const headInner = headMatch ? headMatch[1] : '';
    const title = (headInner.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
    const seoTags = [...headInner.matchAll(/<(?:meta|link)\b[^>]*>/gi)]
      .map(m => m[0])
      .filter(t => /name="(?:description|robots|twitter:[^"]*)"|property="og:|rel="(?:canonical|alternate)"/i.test(t))
      .map(t => t.replace(/\s*\/?\s*>$/, ' />'));
    const jsonLdBlocks = [...headInner.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
      .map(m => m[1].trim());

    const headLines = [
      `<title>{${JSON.stringify(title)}}</title>`,
      ...seoTags,
      ...jsonLdBlocks.map(b =>
        `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ${JSON.stringify(b)} }} />`)
    ].join('\n        ');

    return `// AUTO-GENERATED BY PSEO-ENGINE — DO NOT EDIT
// Regenerate: npx pseo-engine build
// Slug: ${slug}
//
// INTEGRATION: Import your existing page component and pass pageData as props.
// Replace the default export below with:
//   import YourPageComponent from '../../components/YourPageTemplate';
//   export default function Page({ pageData }) { return <YourPageComponent {...pageData} />; }

import Head from 'next/head';

export default function Page() {
  // Renders only the body content — your _app.js / layout provides the shell.
  return (
    <>
      <Head>
        ${headLines}
      </Head>
      <main dangerouslySetInnerHTML={{ __html: ${JSON.stringify(bodyContent)} }} />
    </>
  );
}

export async function getStaticProps() {
  return { props: {} };
}
`;
  }

  _wrapAstro(slug, html) {
    return `---
// AUTO-GENERATED BY PSEO-ENGINE — DO NOT EDIT
// Slug: ${slug}
---
${html}
`;
  }

  _wrapNuxt(slug, html) {
    return `<!-- AUTO-GENERATED BY PSEO-ENGINE — DO NOT EDIT -->
<!-- Slug: ${slug} -->
<template>
  <div v-html="content" />
</template>
<script setup>
const content = ${JSON.stringify(html)}
</script>
`;
  }

  _buildTemplateMap() {
    const map = new Map();

    for (const tmpl of (this.config.templates || [])) {
      const filePath = resolve(this.configDir, tmpl.file);

      if (!existsSync(filePath)) {
        console.warn(`[generate] Template file not found: ${filePath}`);
        continue;
      }

      const manifestPath = filePath.replace(/\.[^.]+$/, '.manifest.json');
      let manifest;

      if (existsSync(manifestPath)) {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      } else {
        // Default manifest if none exists
        manifest = {
          templateId: tmpl.id,
          siteType: this.config.site?.siteType || 'saas-landing',
          frameworkAdapter: this.config.site?.frameworkAdapter || 'html',
          requiredSlots: ['meta_title', 'meta_description', 'h1', 'hero_subtext', 'body_content'],
          optionalSlots: ['faq_block', 'cta_text', 'internal_links', 'breadcrumbs'],
          customSlots: [],
          schemaType: 'Service',
          canonicalStrategy: 'self',
          contentRules: {
            meta_title: { minChars: 40, maxChars: 60, mustContain: 'primaryKeyword' },
            meta_description: { minChars: 120, maxChars: 155 },
            h1: { minChars: 20, maxChars: 70 },
            body_content: { minWords: 250, maxWords: 600, maxKeywordDensity: 0.03 },
            faq_block: { minItems: 3, maxItems: 6 }
          }
        };
        console.warn(`[generate] No manifest found for ${tmpl.file} — using defaults.`);
      }

      map.set(tmpl.cluster, { templateFile: filePath, manifest });
    }

    return map;
  }

  _buildContext(page, clusterMap, manifest) {
    const cluster = clusterMap.clusters.get(page.clusterId);

    // Build page-specific enrichment data from notes column + external source
    const pageData = this.enrichment.buildPageData(page);

    // Warn on low enrichment when using template-only provider
    const provider = this.config.contentProvider || 'template-only';
    if (provider === 'template-only' && !page.isHub) {
      const warning = EnrichmentEngine.getEnrichmentWarning(
        pageData,
        this.config.site?.siteType || 'saas-landing'
      );
      if (warning) {
        this.stats.lowEnrichment++;
        // Only log first 5 to avoid terminal flood
        if (this.stats.lowEnrichment <= 5) {
          console.warn(`[generate] THIN CONTENT RISK on "/${page.urlSlug}": ${warning}`);
        } else if (this.stats.lowEnrichment === 6) {
          console.warn(`[generate] ...further thin content warnings suppressed. Check ValidationReport.json`);
        }
      }
    }

    return {
      primaryKeyword: page.keyword,
      urlSlug: page.urlSlug,
      primaryModifier: page.primaryModifier,
      secondaryModifier: page.secondaryModifier,
      // notes is raw text — separate from targetPersona
      notes: page.notes || '',
      // pageData is the parsed, structured enrichment object
      pageData,
      // targetPersona comes from config, not notes
      targetPersona: this.config.site?.targetPersona || page.notes || '',
      siteType: this.config.site?.siteType || 'saas-landing',
      siteDescription: this.config.site?.description || this.config.site?.name || '',
      siteName: this.config.site?.name || '',
      baseUrl: this.config.site?.baseUrl || '',
      brandVoice: this.config.site?.brandVoice || 'professional and direct',
      clusterIntent: cluster?.intent || 'transactional',
      isHub: page.isHub || false
    };
  }

  _wordCount(html) {
    return (html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  }

  _error(slug, message, stack) {
    this.stats.errors++;
    this.errors.push({ slug, message, stack });
    console.error(`[generate] ERROR on "${slug}": ${message}`);

    const logPath = join(this.outputDir, 'build-errors.log');
    const entry = `[${new Date().toISOString()}] ${slug}: ${message}\n${stack || ''}\n\n`;
    try {
      const existing = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
      writeFileSync(logPath, existing + entry);
    } catch {}
  }
}
