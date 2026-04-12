#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load config ─────────────────────────────────────────────────────────────

function loadConfig(configPath) {
  const absPath = resolve(configPath);
  if (!existsSync(absPath)) {
    throw new Error(`Config file not found: ${absPath}\nRun "npx pseo-engine init" to create one.`);
  }
  const config = JSON.parse(readFileSync(absPath, 'utf8'));
  config._configDir = dirname(absPath);
  config.outputDir = config.outputDir || './output';
  return config;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdStart() {
  const { runOnboarding } = await import('./onboard.js');
  await runOnboarding();
}

async function cmdKeywords() {
  const { KeywordWizard } = await import('./keywords.js');
  const wizard = new KeywordWizard();
  await wizard.run();
}

async function cmdInit() {
  let inquirer;
  try { inquirer = (await import('inquirer')).default; } catch {
    throw new Error('inquirer not installed. Run: npm install');
  }

  console.log('\n🚀  pseo-engine Init\n');

  const answers = await inquirer.prompt([
    { type: 'input', name: 'name', message: 'Site name:', validate: v => !!v || 'Required' },
    { type: 'input', name: 'baseUrl', message: 'Base URL (e.g. https://mysite.com):', validate: v => v.startsWith('http') || 'Must start with http' },
    {
      type: 'list', name: 'siteType', message: 'Site type:',
      choices: [
        { name: 'SaaS Landing Page', value: 'saas-landing' },
        { name: 'Blog', value: 'blog' },
        { name: 'E-Commerce', value: 'ecom' },
        { name: 'Local Business', value: 'local-business' },
        { name: 'App Download', value: 'app-download' },
        { name: 'Directory', value: 'directory' },
        { name: 'News / Media', value: 'news' },
        { name: 'Portfolio', value: 'portfolio' }
      ]
    },
    {
      type: 'list', name: 'frameworkAdapter', message: 'Framework:',
      choices: ['nextjs', 'astro', 'nuxt', 'html']
    },
    {
      type: 'list', name: 'contentProvider', message: 'Content provider:',
      choices: [
        { name: 'Template only (free, no API key)', value: 'template-only' },
        { name: 'Claude (Anthropic API)', value: 'claude' },
        { name: 'OpenAI (GPT-4o)', value: 'openai' },
        { name: 'Local LLM (Ollama)', value: 'local-llm' }
      ]
    },
    { type: 'input', name: 'brandVoice', message: 'Brand voice (one sentence):', default: 'Professional, direct, and helpful.' }
  ]);

  const config = {
    site: {
      name: answers.name,
      baseUrl: answers.baseUrl.replace(/\/$/, ''),
      defaultLocale: 'en',
      frameworkAdapter: answers.frameworkAdapter,
      siteType: answers.siteType,
      brandVoice: answers.brandVoice,
      defaultOgImage: '/og-image.png'
    },
    contentProvider: answers.contentProvider,
    contentProviderConfig: { maxConcurrent: 5, cacheTtlHours: 168 },
    templates: [
      { id: 'main-template', file: './templates/page.html', cluster: 'cluster-id' }
    ],
    dataSource: { type: 'keywords-md', path: './data/keywords.md' },
    internalLinking: { maxLinksPerPage: 8, linkingStrategy: 'topical' },
    sitemapConfig: { segmentByCluster: true, maxUrlsPerSitemap: 10000, changefreq: 'monthly' },
    crawlGuards: { minUniqueWordCount: 200, maxDuplicationRatio: 0.6, noindexThreshold: 150 }
  };

  const configPath = './pseo.config.json';
  if (existsSync(configPath)) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm', name: 'overwrite',
      message: 'pseo.config.json already exists. Overwrite?', default: false
    }]);
    if (!overwrite) { console.log('Init cancelled.'); return; }
  }

  mkdirSync('./data', { recursive: true });
  mkdirSync('./templates', { recursive: true });
  mkdirSync('./output', { recursive: true });

  writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Copy starter template if none exists
  const templateDest = './templates/page.html';
  if (!existsSync(templateDest)) {
    const starterTemplate = resolve(__dirname, '..', 'templates', 'base.html');
    if (existsSync(starterTemplate)) {
      writeFileSync(templateDest, readFileSync(starterTemplate, 'utf8'));
    }
  }

  // Write example keywords.md stub
  if (!existsSync('./data/keywords.md')) {
    writeFileSync('./data/keywords.md', `# Keyword Library
<!-- Run "npx pseo-engine keywords" to generate keywords -->
`);
  }

  console.log('\n✅  pseo-engine initialised!');
  console.log('  1. Edit pseo.config.json to configure your templates');
  console.log('  2. Run "npx pseo-engine keywords" to generate your keyword library');
  console.log('  3. Run "npx pseo-engine build" to generate pages\n');
}

async function cmdDetect(argv) {
  const pagePath = argv._[0] || argv.page;
  if (!pagePath) {
    console.error('Usage: node engine/cli.js detect <path-to-your-page>');
    console.error('Example: node engine/cli.js detect pages/hire.jsx');
    console.error('Example: node engine/cli.js detect src/pages/hire.astro');
    process.exit(1);
  }

  let inquirer;
  try { inquirer = (await import('inquirer')).default; } catch {
    throw new Error('inquirer not installed. Run: npm install');
  }

  console.log(`\n🔍  pseo-engine Detect\n`);
  console.log(`  Scanning: ${pagePath}\n`);

  const answers = await inquirer.prompt([
    {
      type: 'list', name: 'siteType', message: 'What type of site is this?',
      choices: [
        { name: 'SaaS Landing Page', value: 'saas-landing' },
        { name: 'Blog', value: 'blog' },
        { name: 'E-Commerce', value: 'ecom' },
        { name: 'Local Business', value: 'local-business' },
        { name: 'App Download', value: 'app-download' },
        { name: 'Directory', value: 'directory' },
        { name: 'News / Media', value: 'news' },
        { name: 'Portfolio', value: 'portfolio' }
      ]
    },
    {
      type: 'list', name: 'frameworkAdapter', message: 'Which framework is this page from?',
      choices: ['nextjs', 'astro', 'nuxt', 'html']
    },
    {
      type: 'confirm', name: 'dryRun',
      message: 'Dry run? (preview slot detections without writing files)',
      default: false
    }
  ]);

  const { PageDetector } = await import('./detect.js');
  const detector = new PageDetector();

  let result;
  try {
    result = await detector.detect(pagePath, {
      siteType: answers.siteType,
      frameworkAdapter: answers.frameworkAdapter,
      dryRun: answers.dryRun
    });
  } catch (err) {
    console.error(`\n❌  Detection failed: ${err.message}\n`);
    process.exit(1);
  }

  const { detectedSlots, warnings, manifest } = result;

  console.log(`\n📋  Detection Report`);
  console.log(`  Slots found     : ${detectedSlots.length}`);

  const highConf = detectedSlots.filter(s => s.confidence === 'high').length;
  const medConf  = detectedSlots.filter(s => s.confidence === 'medium').length;
  const lowConf  = detectedSlots.filter(s => s.confidence === 'low').length;
  const injected = detectedSlots.filter(s => s.confidence === 'injected').length;

  if (highConf)  console.log(`  ✅ High confidence : ${detectedSlots.filter(s => s.confidence === 'high').map(s => s.slot).join(', ')}`);
  if (medConf)   console.log(`  ⚠️  Medium confidence: ${detectedSlots.filter(s => s.confidence === 'medium').map(s => s.slot).join(', ')}`);
  if (lowConf)   console.log(`  ⚠️  Low confidence  : ${detectedSlots.filter(s => s.confidence === 'low').map(s => s.slot).join(', ')}`);
  if (injected)  console.log(`  ➕ Auto-injected   : ${detectedSlots.filter(s => s.confidence === 'injected').map(s => s.slot).join(', ')}`);

  if (warnings.length > 0) {
    console.log(`\n⚠️  Action needed:`);
    warnings.forEach(w => console.log(`  → ${w}`));
  }

  if (!answers.dryRun) {
    const ext = pagePath.match(/\.([^.]+)$/)?.[1] || 'html';
    const slottedPath = pagePath.replace(/\.[^.]+$/, `.pseo.${ext}`);
    const manifestPath = pagePath.replace(/\.[^.]+$/, '.manifest.json');
    console.log(`\n📁  Files written:`);
    console.log(`  Template : ${slottedPath}`);
    console.log(`  Manifest : ${manifestPath}`);
    console.log(`  Original : ${pagePath.replace(/\.[^.]+$/, '.original.' + ext)} (backup)`);
    console.log(`\nNext steps:`);
    console.log(`  1. Review ${slottedPath} — check each slot is in the right place`);
    console.log(`  2. Update pseo.config.json to point "file" at ${slottedPath}`);
    console.log(`  3. Run: node engine/cli.js keywords`);
    console.log(`  4. Run: node engine/cli.js build\n`);
  } else {
    console.log(`\nDry run complete. No files written.\n`);
  }
}

async function cmdBuild(argv) {
  const configPath = argv.config || './pseo.config.json';
  const dryRun = argv['dry-run'] || false;
  const targetCluster = argv.cluster || null;

  let ora;
  try { ora = (await import('ora')).default; } catch { ora = () => ({ start() { return this; }, succeed(m) { console.log('✓', m); }, fail(m) { console.error('✗', m); } }); }

  console.log(`\n🔧  pseo-engine Build${dryRun ? ' (dry run)' : ''}\n`);

  const config = loadConfig(configPath);

  // 1. Ingest
  const ingestSpinner = ora('Loading keyword library...').start();
  const { DataIngestor } = await import('./ingest.js');
  const ingestor = new DataIngestor(config);
  let library;
  try {
    library = await ingestor.load();
    ingestSpinner.succeed(`Loaded ${library.totalKeywords} keywords across ${library.clusters.length} clusters`);
  } catch (err) {
    ingestSpinner.fail(`Ingest failed: ${err.message}`);
    process.exit(1);
  }

  // Filter by cluster if --cluster flag used
  if (targetCluster) {
    library.clusters = library.clusters.filter(c => c.id === targetCluster);
    if (library.clusters.length === 0) {
      console.error(`Cluster "${targetCluster}" not found in keywords.md`);
      process.exit(1);
    }
    console.log(`  Building cluster: ${targetCluster}`);
  }

  // 2. Cluster
  const clusterSpinner = ora('Building cluster graph...').start();
  const { ClusterBuilder } = await import('./cluster.js');
  const builder = new ClusterBuilder(config);
  const clusterMap = builder.build(library);
  clusterSpinner.succeed(`Cluster graph built — ${clusterMap.allPages.length} pages`);

  if (dryRun) {
    console.log('\n📋  Dry run complete. No files written.');
    console.log(`  Would generate: ${clusterMap.allPages.length} pages`);
    console.log(`  Clusters: ${[...clusterMap.clusters.keys()].join(', ')}`);
    return;
  }

  // 3. Linker (pre-build)
  const linkerSpinner = ora('Building internal link graph...').start();
  const { InternalLinker } = await import('./linker.js');
  const linker = new InternalLinker(config);
  linker.build(clusterMap);
  linkerSpinner.succeed(`Link graph built — ${linker.audit.totalLinks} links`);

  // 4. Generate
  const genSpinner = ora(`Generating ${clusterMap.allPages.length} pages...`).start();
  const { PageFactory } = await import('./generate.js');
  const factory = new PageFactory(config);
  await factory.init();

  const slugToHtml = new Map();
  // Monkey-patch factory to capture HTML for validation
  const origWrite = factory._writeOutput.bind(factory);
  factory._writeOutput = (slug, html, adapter) => {
    slugToHtml.set(slug, html);
    origWrite(slug, html, adapter);
  };

  const genStats = await factory.generateAll(clusterMap, linker);
  genSpinner.succeed(`Generated ${genStats.generated} pages (${genStats.errors} errors, ${genStats.skipped} skipped)`);

  // 5. Validate
  const validateSpinner = ora('Running quality validation...').start();
  const { PageValidator } = await import('./validate.js');
  const validator = new PageValidator(config);
  const report = await validator.run(slugToHtml);
  validateSpinner.succeed(`Validation complete`);
  PageValidator.printSummary(report);

  // 6. Sitemap
  const sitemapSpinner = ora('Generating sitemaps...').start();
  const { SitemapGenerator } = await import('./sitemap.js');
  const noindexSlugs = new Set(
    report.pages.filter(p => p.status === 'fail').map(p => p.slug)
  );
  const sitemapGen = new SitemapGenerator(config);
  const sitemapFiles = sitemapGen.generate(clusterMap, noindexSlugs);
  sitemapSpinner.succeed(`Generated ${sitemapFiles.length} sitemaps + sitemap-index.xml + robots.txt`);

  // 7. Link audit
  linker.writeAudit();

  // Summary
  console.log(`\n✅  Build complete`);
  console.log(`  Pages generated : ${genStats.generated}`);
  console.log(`  Sitemaps        : ${sitemapFiles.length}`);
  console.log(`  Orphan pages    : ${clusterMap.orphans?.length || 0}`);
  console.log(`  Output dir      : ${config.outputDir || './output'}\n`);

  if (report.totals.error > 0) process.exit(1);
}

async function cmdValidate(argv) {
  const configPath = argv.config || './pseo.config.json';
  const config = existsSync(configPath) ? loadConfig(configPath) : { outputDir: './output' };

  const { PageValidator } = await import('./validate.js');
  const { readdirSync, readFileSync } = await import('fs');
  const { join } = await import('path');

  const outputDir = config.outputDir || './output';
  const slugToHtml = new Map();

  // Load all generated HTML files
  function walkDir(dir) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walkDir(join(dir, entry.name));
        else if (entry.name === 'index.html') {
          const slug = dir.replace(outputDir, '').replace(/^\//, '');
          slugToHtml.set(slug || 'index', readFileSync(join(dir, entry.name), 'utf8'));
        }
      }
    } catch {}
  }
  walkDir(outputDir);

  if (slugToHtml.size === 0) {
    console.error('No generated pages found. Run "npx pseo-engine build" first.');
    process.exit(1);
  }

  const validator = new PageValidator(config);
  const report = await validator.run(slugToHtml);
  PageValidator.printSummary(report);

  if (report.totals.error > 0) process.exit(1);
}

async function cmdReport(argv) {
  const { existsSync, readFileSync } = await import('fs');
  const { join } = await import('path');
  const outputDir = './output';

  const reportPath = join(outputDir, 'ValidationReport.json');
  const auditPath = join(outputDir, 'LinkAudit.json');

  if (!existsSync(reportPath)) {
    console.error('No ValidationReport.json found. Run "npx pseo-engine build" first.');
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const audit = existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, 'utf8')) : null;

  console.log(`\n📊  pseo-engine Report`);
  console.log(`  Build date     : ${report.buildDate}`);
  console.log(`  Total pages    : ${report.totalPages}`);
  console.log(`  ✅ Pass        : ${report.totals.pass}`);
  console.log(`  ⚠️  Warn        : ${report.totals.warn}`);
  console.log(`  ❌ Fail        : ${report.totals.fail}`);
  console.log(`  🔴 Error       : ${report.totals.error}`);

  if (audit) {
    console.log(`\n🔗  Link Audit`);
    console.log(`  Total links    : ${audit.totalLinks}`);
    console.log(`  Avg per page   : ${audit.averageLinksPerPage}`);
    console.log(`  Orphan pages   : ${audit.orphanCount}`);
    if (audit.orphanPages?.length > 0) {
      console.log(`  Orphans        : ${audit.orphanPages.slice(0, 5).join(', ')}${audit.orphanPages.length > 5 ? '...' : ''}`);
    }
  }

  const warns = report.pages.filter(p => p.status === 'warn').slice(0, 5);
  if (warns.length > 0) {
    console.log(`\n⚠️  Top warnings:`);
    warns.forEach(p => {
      const w = p.checks.find(c => c.status === 'warn');
      if (w) console.log(`  /${p.slug}: ${w.name} — ${w.detail}`);
    });
  }
  console.log('');
}

async function cmdClean(argv) {
  if (!argv.confirm) {
    console.error('Add --confirm flag to delete the output directory.');
    process.exit(1);
  }
  const { rmSync } = await import('fs');
  rmSync('./output', { recursive: true, force: true });
  console.log('✅  Output directory deleted.');
}

// ─── CLI Router ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Simple argv parser
  const argv = { _: [] };
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      argv[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else {
      argv._.push(args[i]);
    }
  }

  try {
    switch (command) {
      case 'keywords': await cmdKeywords(); break;
      case 'start':    await cmdStart(); break;
      case 'detect':   await cmdDetect(argv); break;
      case 'init':     await cmdInit(); break;
      case 'build':    await cmdBuild(argv); break;
      case 'validate': await cmdValidate(argv); break;
      case 'report':   await cmdReport(argv); break;
      case 'clean':    await cmdClean(argv); break;
      default:
        console.log(`
pseo-engine — Programmatic SEO Engine

━━━ Start here (two inputs: your page + your keywords) ━━━

  start       Interactive setup. Give it your page URL or file path and
              your keywords. It detects everything else and writes the config.
              This is the only command you need to run first.

━━━ Build ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  build       Generate all pages from keywords.md
              --dry-run       Preview page count, write nothing
              --cluster <id>  Build one cluster only
              --config <path> Use a different config file

  validate    Quality check — flags thin content and SEO issues
  report      Print summary: page count, orphans, warnings
  clean       Delete /output (requires --confirm)

━━━ Advanced ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  detect      Scan a page file or URL and inject {{slot}} tags automatically
  keywords    Run keyword wizard separately
  init        Scaffold config manually

━━━ Typical workflow ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  node engine/cli.js start               # give page + keywords → setup done
  node engine/cli.js build --dry-run     # preview
  node engine/cli.js build               # generate pages into /output
  # deploy /output, submit /sitemap-index.xml to Google Search Console
`);
    }
  } catch (err) {
    console.error(`\n❌  Error: ${err.message}\n`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
