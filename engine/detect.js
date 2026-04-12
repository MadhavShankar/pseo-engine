import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, basename, dirname, extname } from 'path';

/**
 * PageDetector — scans an existing HTML/JSX/Astro/Vue page and:
 * 1. Identifies likely slot locations (H1, meta, body paragraphs, etc.)
 * 2. Inserts {{slot}} markers at those locations
 * 3. Writes a draft .manifest.json based on what it found
 * 4. Backs up the original file before touching it
 *
 * This is non-destructive: original is always backed up to .original extension.
 */
export class PageDetector {

  /**
   * Detect and slot-tag an existing page file.
   * @param {string} pagePath - path to the existing page file
   * @param {object} options - { siteType, frameworkAdapter, dryRun, outputPath }
   * @returns {{ slottedHtml, manifest, detectedSlots, warnings }}
   */
  async detect(pagePath, options = {}) {
    let raw;

    // Support URL input — fetch the page HTML directly
    if (pagePath.startsWith('http://') || pagePath.startsWith('https://')) {
      console.log(`  Fetching URL: ${pagePath}`);
      try {
        const res = await fetch(pagePath, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pseo-engine/1.0)' },
          signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${pagePath}`);
        raw = await res.text();
        // Save fetched HTML to a temp file so the rest of the pipeline works
        const tmpPath = resolve('./pseo-fetched-page.html');
        writeFileSync(tmpPath, raw);
        pagePath = tmpPath;
        console.log(`  Saved to: ${tmpPath}`);
      } catch (err) {
        throw new Error(`Could not fetch URL: ${err.message}`);
      }
    } else {
      const absPath = resolve(pagePath);
      if (!existsSync(absPath)) {
        throw new Error(`File not found: ${absPath}\nMake sure the path is correct, or pass a URL starting with https://`);
      }
      raw = readFileSync(absPath, 'utf8');
    }
    const { siteType = 'saas-landing', frameworkAdapter = 'html', dryRun = false } = options;

    // Strip JSX/Vue/Astro wrapper syntax to get workable HTML for analysis
    const html = this._normaliseToHtml(raw);

    const detectedSlots = [];
    const warnings = [];
    let slotted = html;

    // ─── Detection passes ──────────────────────────────────────────────────

    // 1. Meta title
    const metaTitleResult = this._detectMetaTitle(slotted);
    if (metaTitleResult.found) {
      slotted = metaTitleResult.html;
      detectedSlots.push({ slot: 'meta_title', confidence: 'high', location: 'head' });
    } else {
      warnings.push('Could not detect <title> tag — add {{meta_title}} manually in your <head>');
    }

    // 2. Meta description
    const metaDescResult = this._detectMetaDescription(slotted);
    if (metaDescResult.found) {
      slotted = metaDescResult.html;
      detectedSlots.push({ slot: 'meta_description', confidence: 'high', location: 'head' });
    } else {
      warnings.push('Could not detect meta description — add {{meta_description}} manually');
    }

    // 3. H1 — highest confidence heading detection
    const h1Result = this._detectH1(slotted);
    if (h1Result.found) {
      slotted = h1Result.html;
      detectedSlots.push({ slot: 'h1', confidence: 'high', location: 'body' });
    } else {
      warnings.push('No <h1> found — add {{h1}} to your main heading manually');
    }

    // 4. Hero subtext — first <p> after H1 or in hero section
    const heroResult = this._detectHeroSubtext(slotted);
    if (heroResult.found) {
      slotted = heroResult.html;
      detectedSlots.push({ slot: 'hero_subtext', confidence: heroResult.confidence, location: 'body' });
    }

    // 5. Main body content — largest text block in the page
    const bodyResult = this._detectBodyContent(slotted);
    if (bodyResult.found) {
      slotted = bodyResult.html;
      detectedSlots.push({ slot: 'body_content', confidence: bodyResult.confidence, location: 'body' });
    } else {
      warnings.push('Could not detect main body content — add {{{body_content}}} to your main content area manually');
    }

    // 6. FAQ section — look for common FAQ patterns
    const faqResult = this._detectFaqSection(slotted);
    if (faqResult.found) {
      slotted = faqResult.html;
      detectedSlots.push({ slot: 'faq_block', confidence: 'medium', location: 'body' });
    } else {
      // Insert FAQ placeholder comment where it should go
      slotted = this._insertFaqPlaceholder(slotted);
      warnings.push('No FAQ section detected — added a placeholder comment. Uncomment and position {{{faq_block}}} where you want FAQs to appear.');
    }

    // 7. CTA button text — look for button or link with action-oriented text
    const ctaResult = this._detectCta(slotted);
    if (ctaResult.found) {
      slotted = ctaResult.html;
      detectedSlots.push({ slot: 'cta_text', confidence: ctaResult.confidence, location: 'body' });
    }

    // 8. Inject internal links and breadcrumbs placeholders
    slotted = this._injectInternalLinksPlaceholder(slotted);
    slotted = this._injectBreadcrumbsPlaceholder(slotted);
    detectedSlots.push({ slot: 'internal_links', confidence: 'injected', location: 'body' });
    detectedSlots.push({ slot: 'breadcrumbs', confidence: 'injected', location: 'body' });

    // ─── Build manifest ────────────────────────────────────────────────────
    const manifest = this._buildManifest(detectedSlots, siteType, frameworkAdapter, pagePath);

    // ─── Write output ──────────────────────────────────────────────────────
    if (!dryRun) {
      const outputPath = options.outputPath || absPath.replace(/(\.[^.]+)$/, '.pseo$1');
      const manifestPath = outputPath.replace(/(\.[^.]+)$/, '.manifest.json');
      const backupPath = absPath.replace(/(\.[^.]+)$/, '.original$1');

      // Always back up the original
      if (!existsSync(backupPath)) {
        copyFileSync(absPath, backupPath);
        console.log(`  📦  Original backed up to: ${basename(backupPath)}`);
      }

      writeFileSync(outputPath, slotted, 'utf8');
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      console.log(`  ✅  Slot-tagged template: ${basename(outputPath)}`);
      console.log(`  ✅  Manifest: ${basename(manifestPath)}`);
    }

    return { slottedHtml: slotted, manifest, detectedSlots, warnings };
  }

  // ─── Detection methods ────────────────────────────────────────────────────

  _detectMetaTitle(html) {
    // Match <title>Anything here</title>
    const pattern = /<title[^>]*>([^<]+)<\/title>/i;
    const match = html.match(pattern);
    if (!match) return { found: false, html };

    const replaced = html.replace(pattern, '<title>{{meta_title}}</title>');
    return { found: true, html: replaced, original: match[1].trim() };
  }

  _detectMetaDescription(html) {
    // Match meta description in both attribute orderings
    const patterns = [
      /<meta([^>]+)name="description"([^>]+)>/i,
      /<meta([^>]+)name='description'([^>]+)>/i
    ];

    for (const p of patterns) {
      const match = html.match(p);
      if (!match) continue;
      // Replace content="..." value with slot
      const replaced = html.replace(p, (full) =>
        full.replace(/content="[^"]*"/, 'content="{{meta_description}}"')
            .replace(/content='[^']*'/, "content='{{meta_description}}'")
      );
      return { found: true, html: replaced };
    }
    return { found: false, html };
  }

  _detectH1(html) {
    // Find the first <h1> in the body — most reliable signal
    const pattern = /<h1([^>]*)>[\s\S]*?<\/h1>/i;
    const match = html.match(pattern);
    if (!match) return { found: false, html };

    const attrs = match[1] || '';
    const replaced = html.replace(pattern, `<h1${attrs}>{{h1}}</h1>`);
    return { found: true, html: replaced };
  }

  _detectHeroSubtext(html) {
    // Strategy 1: First <p> directly after the H1 or in a hero/banner section
    const heroSectionPattern = /(<(?:section|div)[^>]*(?:hero|banner|jumbotron|masthead)[^>]*>)([\s\S]*?)(<\/(?:section|div)>)/i;
    const heroMatch = html.match(heroSectionPattern);

    if (heroMatch) {
      const heroContent = heroMatch[2];
      const pPattern = /<p([^>]*)>([\s\S]*?)<\/p>/i;
      const pMatch = heroContent.match(pPattern);
      if (pMatch && pMatch[2].replace(/<[^>]+>/g, '').trim().length > 20) {
        const pAttrs = pMatch[1] || '';
        const replaced = html.replace(
          heroSectionPattern,
          (full, open, content, close) =>
            open + content.replace(pPattern, `<p${pAttrs}>{{hero_subtext}}</p>`) + close
        );
        return { found: true, html: replaced, confidence: 'high' };
      }
    }

    // Strategy 2: First <p> that comes after an <h1>
    const afterH1Pattern = /(<h1[^>]*>{{h1}}<\/h1>[\s\S]*?)(<p([^>]*)>([\s\S]*?)<\/p>)/i;
    const afterH1Match = html.match(afterH1Pattern);
    if (afterH1Match) {
      const pContent = afterH1Match[4].replace(/<[^>]+>/g, '').trim();
      if (pContent.length > 20 && pContent.length < 300) {
        const pAttrs = afterH1Match[3] || '';
        const replaced = html.replace(afterH1Pattern,
          (full, before, pTag) => before + `<p${pAttrs}>{{hero_subtext}}</p>`
        );
        return { found: true, html: replaced, confidence: 'medium' };
      }
    }

    return { found: false, html };
  }

  _detectBodyContent(html) {
    // Find the largest semantic content block that isn't navigation/header/footer
    const contentSelectors = [
      // Explicit content areas
      /<(?:main|article|section)[^>]*(?:content|body|main|article)[^>]*>([\s\S]*?)<\/(?:main|article|section)>/i,
      // Class-based detection
      /<(?:div|section)[^>]*class="[^"]*(?:content|body|article|post|description)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/i,
      // Data attribute detection
      /<(?:div|section)[^>]*data-section="(?:content|body|main)"[^>]*>([\s\S]*?)<\/(?:div|section)>/i,
    ];

    for (const selector of contentSelectors) {
      const match = html.match(selector);
      if (!match) continue;

      const innerText = match[1].replace(/<[^>]+>/g, '').trim();
      if (innerText.length < 100) continue; // Too short to be body content

      // Replace the inner content with the slot, preserve the wrapper element
      const replaced = html.replace(selector, (full, inner) =>
        full.replace(inner, '\n  {{{body_content}}}\n')
      );
      return { found: true, html: replaced, confidence: 'medium' };
    }

    // Fallback: find the largest <p> block cluster
    const paragraphBlocks = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    if (paragraphBlocks.length >= 2) {
      // Replace the first cluster of 2+ adjacent paragraphs
      const adjacentPattern = /(<p[^>]*>[\s\S]*?<\/p>\s*){2,}/i;
      const adjacentMatch = html.match(adjacentPattern);
      if (adjacentMatch) {
        const replaced = html.replace(adjacentPattern, '{{{body_content}}}\n');
        return { found: true, html: replaced, confidence: 'low' };
      }
    }

    return { found: false, html };
  }

  _detectFaqSection(html) {
    // Look for FAQ patterns: accordion, dl/dt/dd, or sections with FAQ in class/id
    const faqPatterns = [
      /<(?:section|div)[^>]*(?:faq|accordion|questions)[^>]*>([\s\S]*?)<\/(?:section|div)>/i,
      /<dl[^>]*(?:faq|questions)[^>]*>([\s\S]*?)<\/dl>/i,
    ];

    for (const p of faqPatterns) {
      const match = html.match(p);
      if (!match) continue;
      const replaced = html.replace(p, (full, inner) =>
        full.replace(inner, '\n  {{{faq_block}}}\n')
      );
      return { found: true, html: replaced };
    }
    return { found: false, html };
  }

  _detectCta(html) {
    // Find buttons or prominent links with action text
    const actionWords = ['get started', 'sign up', 'try', 'start', 'book', 'hire', 'find', 'search', 'register', 'join'];
    const buttonPattern = /<(?:button|a)[^>]*(?:btn|button|cta)[^>]*>([\s\S]*?)<\/(?:button|a)>/gi;

    let match;
    while ((match = buttonPattern.exec(html)) !== null) {
      const btnText = match[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
      const isAction = actionWords.some(w => btnText.includes(w));
      if (isAction && btnText.length < 60) {
        const replaced = html.replace(match[0],
          match[0].replace(match[1], '{{cta_text}}')
        );
        return { found: true, html: replaced, confidence: 'medium' };
      }
    }
    return { found: false, html };
  }

  _insertFaqPlaceholder(html) {
    // Insert a comment before </main>, </article>, or </body> as a guide
    const insertBefore = html.lastIndexOf('</main>') !== -1 ? '</main>'
      : html.lastIndexOf('</article>') !== -1 ? '</article>'
      : '</body>';

    const placeholder = `
<!-- FAQ SLOT: Uncomment the line below and position it where FAQs should appear -->
<!-- {{{faq_block}}} -->
`;
    return html.replace(insertBefore, placeholder + insertBefore);
  }

  _injectInternalLinksPlaceholder(html) {
    // Add internal links slot just before </body> if not already present
    if (html.includes('{{internal_links}}') || html.includes('{{{internal_links}}}')) {
      return html;
    }
    const insertBefore = html.lastIndexOf('</footer>') !== -1 ? '</footer>'
      : html.lastIndexOf('</body>') !== -1 ? '</body>'
      : null;

    if (!insertBefore) return html;

    const slot = `
<section class="pseo-related-pages">
  {{{internal_links}}}
</section>
`;
    return html.replace(insertBefore, slot + insertBefore);
  }

  _injectBreadcrumbsPlaceholder(html) {
    if (html.includes('{{breadcrumbs}}') || html.includes('{{{breadcrumbs}}}')) {
      return html;
    }
    // Inject after <body> opening or after <header>
    const afterHeader = /<\/header>/i;
    if (afterHeader.test(html)) {
      return html.replace(afterHeader, `</header>\n<div class="pseo-breadcrumbs">{{{breadcrumbs}}}</div>`);
    }
    const bodyOpen = /<body[^>]*>/i;
    if (bodyOpen.test(html)) {
      return html.replace(bodyOpen, (tag) => `${tag}\n<div class="pseo-breadcrumbs">{{{breadcrumbs}}}</div>`);
    }
    return html;
  }

  // ─── Manifest builder ─────────────────────────────────────────────────────

  _buildManifest(detectedSlots, siteType, frameworkAdapter, pagePath) {
    const required = detectedSlots
      .filter(s => ['meta_title', 'meta_description', 'h1', 'hero_subtext', 'body_content'].includes(s.slot))
      .map(s => s.slot);

    const optional = detectedSlots
      .filter(s => !required.includes(s.slot))
      .map(s => s.slot);

    const templateId = basename(pagePath).replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]/gi, '-');

    const schemaMap = {
      'saas-landing': 'Service',
      'blog': 'Article',
      'ecom': 'Product',
      'local-business': 'LocalBusiness',
      'app-download': 'SoftwareApplication',
      'directory': 'ItemList',
      'news': 'NewsArticle',
      'portfolio': 'CreativeWork'
    };

    return {
      templateId,
      version: '1.0.0',
      siteType,
      frameworkAdapter,
      description: `Auto-detected from ${basename(pagePath)} by pseo-engine detect`,
      requiredSlots: required.length > 0 ? required : ['meta_title', 'meta_description', 'h1', 'body_content'],
      optionalSlots: optional,
      customSlots: [],
      schemaType: schemaMap[siteType] || 'Service',
      canonicalStrategy: 'self',
      contentRules: {
        meta_title: { minChars: 40, maxChars: 60, mustContain: 'primaryKeyword' },
        meta_description: { minChars: 120, maxChars: 155 },
        h1: { minChars: 20, maxChars: 70 },
        body_content: { minWords: 250, maxWords: 600, maxKeywordDensity: 0.03 },
        faq_block: { minItems: 3, maxItems: 6 }
      },
      _detectionReport: {
        generatedBy: 'pseo-engine detect',
        detectedAt: new Date().toISOString(),
        slots: detectedSlots
      }
    };
  }

  // ─── Framework normalisation ──────────────────────────────────────────────

  _normaliseToHtml(raw) {
    // Strip JSX import/export statements for analysis only
    // The original file is not modified — this is just for detection logic
    return raw
      .replace(/^import\s+.*$/gm, '')
      .replace(/^export\s+default\s+function.*?\{/gm, '')
      .replace(/^export\s+async\s+function.*?\{/gm, '')
      .replace(/^\s*return\s*\(\s*$/gm, '')
      .replace(/^\s*\)\s*;\s*$/gm, '')
      .replace(/^\s*\}\s*$/gm, '');
  }
}
