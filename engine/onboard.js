import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { resolve, basename } from 'path';

/**
 * runOnboarding — two-input setup.
 * Input 1: page URL or local file path
 * Input 2: seed keywords + dimensions
 * Everything else is auto-detected.
 */
export async function runOnboarding() {
  let inquirer;
  try {
    inquirer = (await import('inquirer')).default;
  } catch {
    throw new Error('inquirer not installed. Run: npm install');
  }

  console.log(`
╔════════════════════════════════════════════════════════╗
║           pseo-engine — Quick Setup                    ║
║  Two inputs. Hundreds of landing pages. That's it.    ║
╚════════════════════════════════════════════════════════╝

You need to give us two things:
  1. Your existing page — a URL or a local file path
  2. Your keywords — what you want to rank for
`);

  // ─── INPUT 1: PAGE ────────────────────────────────────────────────────────

  console.log(`━━━ Input 1 of 2 — Your Page ━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const { pageInput } = await inquirer.prompt([{
    type: 'input',
    name: 'pageInput',
    message: `Paste your page URL or local file path:
  Examples:
    https://yoursite.com/hire
    ./pages/hire.jsx
    ./src/pages/landing.astro
    ./public/index.html
>`,
    validate: v => {
      const t = v.trim();
      if (!t) return 'Required';
      if (t.startsWith('http')) return true;
      if (existsSync(resolve(t))) return true;
      return `File not found: ${resolve(t)}`;
    }
  }]);

  const page = pageInput.trim();
  const isUrl = page.startsWith('http');

  // ─── INPUT 2: KEYWORDS ───────────────────────────────────────────────────

  console.log(`\n━━━ Input 2 of 2 — Keywords ━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const keywordAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'siteDescription',
      message: 'What does your site do? (one sentence):',
      validate: v => v.trim().length > 3 || 'Required'
    },
    {
      type: 'input',
      name: 'seedKeywords',
      message: `Seed keywords (comma-separated):
  e.g. "hire react developers, hire python engineers"
  or   "buy laptops online, buy smartphones online"
>`,
      validate: v => v.split(',').filter(s => s.trim()).length >= 1 || 'Enter at least one keyword'
    },
    {
      type: 'checkbox',
      name: 'dimensions',
      message: `Combine these keywords with: (Space to select)`,
      choices: [
        { name: 'Location — city, region  (e.g. "hire devs in Bangalore")', value: 'location' },
        { name: 'Role or category  (e.g. "hire backend developers")', value: 'role' },
        { name: 'Persona  (e.g. "platform for startups")', value: 'persona' },
        { name: 'Price range  (e.g. "laptops under 30000")', value: 'price' },
        { name: 'Seniority  (e.g. "hire senior engineers")', value: 'seniority' },
        { name: 'Technology  (e.g. "React developers")', value: 'platform' },
        { name: 'Use case  (e.g. "platform for bulk operations")', value: 'feature' },
      ],
      validate: v => v.length > 0 || 'Pick at least one'
    }
  ]);

  // ─── AUTO-DETECT PAGE ────────────────────────────────────────────────────

  console.log(`\n🔍  Analysing your page...\n`);

  const { PageDetector } = await import('./detect.js');
  const detector = new PageDetector();

  let detectResult;
  try {
    detectResult = await detector.detect(page, { dryRun: false });
  } catch (err) {
    console.error(`\n❌  Could not read page: ${err.message}\n`);
    process.exit(1);
  }

  const { detectedSlots, manifest: detectedManifest, siteType, frameworkAdapter } = detectResult;

  console.log(`  ✅ Site type: ${siteType}`);
  console.log(`  ✅ Framework: ${frameworkAdapter}`);
  console.log(`  ✅ Slots detected: ${detectedSlots.map(s => s.slot).join(', ')}\n`);

  // ─── DIMENSION VALUES ─────────────────────────────────────────────────────

  const defaults = {
    location: 'bangalore, mumbai, delhi, hyderabad, pune',
    role: 'software engineer, data scientist, product manager, frontend developer',
    persona: 'startups, enterprises, small teams, freelancers',
    price: 'under 10000, under 20000, under 30000, under 50000',
    seniority: 'junior, mid-level, senior, lead',
    platform: 'react, python, nodejs, java, aws',
    feature: 'bulk operations, remote access, team collaboration'
  };

  const dimensionValues = {};
  for (const dim of keywordAnswers.dimensions) {
    const { values } = await inquirer.prompt([{
      type: 'input',
      name: 'values',
      message: `Values for "${dim}" (comma-separated):`,
      default: defaults[dim] || '',
      validate: v => v.split(',').filter(s => s.trim()).length >= 1 || 'Enter at least one value'
    }]);
    dimensionValues[dim] = values.split(',').map(s => s.trim()).filter(Boolean);
  }

  // ─── SITE INFO ───────────────────────────────────────────────────────────

  const siteAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'siteName',
      message: 'Site name:',
      validate: v => v.trim().length > 0 || 'Required'
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Live site URL:',
      default: isUrl ? new URL(page).origin : 'https://yoursite.com',
      validate: v => v.startsWith('http') || 'Must start with https://'
    },
    {
      type: 'list',
      name: 'contentProvider',
      message: 'Content generation:',
      choices: [
        { name: 'Template only — free, no API key (good for testing)', value: 'template-only' },
        { name: 'Claude (Anthropic) — best quality, needs ANTHROPIC_API_KEY', value: 'claude' },
        { name: 'OpenAI (GPT-4o) — needs OPENAI_API_KEY', value: 'openai' },
        { name: 'Local LLM (Ollama) — free, needs Ollama running', value: 'local-llm' }
      ]
    }
  ]);

  // ─── WRITE FILES ─────────────────────────────────────────────────────────

  const seeds = keywordAnswers.seedKeywords.split(',').map(s => s.trim()).filter(Boolean);
  const clusters = _buildClusters(seeds, dimensionValues, siteAnswers.siteName);
  const totalKeywords = clusters.reduce((sum, c) => sum + c.keywords.length, 0);

  mkdirSync('./data', { recursive: true });
  mkdirSync('./templates', { recursive: true });
  mkdirSync('./output', { recursive: true });

  // keywords.md
  writeFileSync('./data/keywords.md', _renderKeywordsMd(clusters, siteAnswers.siteName));

  // template + manifest
  const templateSrc = isUrl ? './pseo-fetched-page.html' : page;
  const templateDest = `./templates/${basename(templateSrc).replace(/\.(jsx|astro|vue)$/, '.html')}`;
  if (resolve(templateSrc) !== resolve(templateDest)) {
    try { writeFileSync(templateDest, readFileSync(resolve(templateSrc), 'utf8')); } catch {}
  }
  const manifestPath = templateDest.replace(/\.[^.]+$/, '.manifest.json');
  writeFileSync(manifestPath, JSON.stringify(detectedManifest, null, 2));

  // pseo.config.json
  const config = {
    site: {
      name: siteAnswers.siteName,
      baseUrl: siteAnswers.baseUrl.replace(/\/$/, ''),
      defaultLocale: 'en',
      frameworkAdapter,
      siteType,
      brandVoice: `${keywordAnswers.siteDescription} Keep content specific, direct, and useful.`,
      defaultOgImage: '/og-image.png'
    },
    contentProvider: siteAnswers.contentProvider,
    contentProviderConfig: { maxConcurrent: 5, cacheTtlHours: 168 },
    templates: clusters.map(c => ({
      id: `${c.id}-template`,
      file: templateDest,
      cluster: c.id
    })),
    dataSource: { type: 'keywords-md', path: './data/keywords.md' },
    internalLinking: { maxLinksPerPage: 8, linkingStrategy: 'topical' },
    sitemapConfig: { segmentByCluster: true, maxUrlsPerSitemap: 10000, changefreq: 'monthly' },
    crawlGuards: { minUniqueWordCount: 200, maxDuplicationRatio: 0.6, noindexThreshold: 150 }
  };
  writeFileSync('./pseo.config.json', JSON.stringify(config, null, 2));

  // ─── DONE ─────────────────────────────────────────────────────────────────

  console.log(`
╔════════════════════════════════════════════════════════╗
║  ✅  Setup complete                                     ║
╚════════════════════════════════════════════════════════╝

  Keywords ready   : ${totalKeywords} keywords across ${clusters.length} clusters
  Template         : ${templateDest}
  Config           : ./pseo.config.json
  Keyword library  : ./data/keywords.md

━━━ Next steps ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Open data/keywords.md and review the keyword list.
     Delete rows you don't want.
     Add enrichment data to the Notes column for better Google rankings:
     avg_salary:25-40LPA | talent_pool:5000 | top_cos:Google,Meta

  2. Dry run to preview:
     node engine/cli.js build --dry-run

  3. Build all pages:
     node engine/cli.js build

  4. Deploy /output — submit /sitemap-index.xml to Google Search Console.
`);

  if (siteAnswers.contentProvider !== 'template-only') {
    const envVar = { claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' }[siteAnswers.contentProvider];
    if (envVar) console.log(`  ⚠️  Set your API key first: export ${envVar}=your_key\n`);
  }

  return { config, clusters, totalKeywords };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _buildClusters(seeds, dimensionValues, siteName) {
  const clusters = [];
  const dims = Object.entries(dimensionValues);
  if (!dims.length) return clusters;

  for (const seed of seeds) {
    const [dim1Name, dim1Values] = dims[0];
    const keywords = dim1Values.map(val => ({
      keyword: `${seed} ${val}`,
      urlSlug: _toSlug(`${seed}-${val}`),
      primaryModifier: val,
      secondaryModifier: '',
      priority: _score(val),
      notes: ''
    }));
    if (keywords.length) {
      clusters.push({
        id: _toSlug(`${seed}-${dim1Name}`),
        name: `${_tc(seed)} by ${_tc(dim1Name)}`,
        hubUrl: `/${_toSlug(seed)}`,
        hubTitle: `${_tc(seed)} — ${siteName}`,
        schema: 'Service', intent: 'transactional', priority: 'HIGH', keywords
      });
    }
    if (dims[1]) {
      const [dim2Name, dim2Values] = dims[1];
      const kws2 = dim2Values.map(val => ({
        keyword: `${seed} for ${val}`, urlSlug: _toSlug(`${seed}-for-${val}`),
        primaryModifier: val, secondaryModifier: '', priority: 2, notes: ''
      }));
      if (kws2.length) {
        clusters.push({
          id: _toSlug(`${seed}-${dim2Name}`),
          name: `${_tc(seed)} for ${_tc(dim2Name)}`,
          hubUrl: `/${_toSlug(seed)}-hub`,
          hubTitle: `${_tc(seed)} Hub — ${siteName}`,
          schema: 'Service', intent: 'commercial', priority: 'MEDIUM', keywords: kws2
        });
      }
    }
  }
  return clusters;
}

function _renderKeywordsMd(clusters, siteName) {
  const total = clusters.reduce((s, c) => s + c.keywords.length, 0);
  const lines = [
    `# Keyword Library`,
    `<!-- DO NOT EDIT THIS HEADER BLOCK -->`,
    `<!-- site: ${siteName} -->`,
    `<!-- generated: ${new Date().toISOString()} -->`,
    `<!-- totalKeywords: ${total} -->`,
    `<!-- totalClusters: ${clusters.length} -->`,
    `<!-- lastBuildHash: generated -->`,
    ``,
    `# TIP: Add enrichment data to Notes column to improve Google rankings:`,
    `# Format: avg_salary:18-45LPA | talent_pool:92000 | top_cos:Google,Meta | demand:high`,
    ``,
    `---`, ``
  ];
  for (const c of clusters) {
    lines.push(`## [Cluster ID: ${c.id}] ${c.name}`);
    lines.push(`**Hub URL:** ${c.hubUrl}`);
    lines.push(`**Hub Page Title:** ${c.hubTitle}`);
    lines.push(`**Schema:** ${c.schema}`);
    lines.push(`**Intent:** ${c.intent}`);
    lines.push(`**Priority:** ${c.priority}`);
    lines.push(`**Page Count:** ${c.keywords.length}`);
    lines.push(``);
    lines.push(`| Keyword | URL Slug | Primary Modifier | Secondary Modifier | Priority | Notes |`);
    lines.push(`|---------|----------|-----------------|-------------------|----------|-------|`);
    for (const kw of c.keywords) {
      lines.push(`| ${kw.keyword} | ${kw.urlSlug} | ${kw.primaryModifier} | ${kw.secondaryModifier} | ${kw.priority} | ${kw.notes} |`);
    }
    lines.push(``, `---`, ``);
  }
  return lines.join('\n');
}

function _toSlug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function _tc(s) { return s.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); }
function _score(m) {
  return ['bangalore','mumbai','delhi','startup','senior','react','python'].some(h => m.toLowerCase().includes(h)) ? 1 : 2;
}
