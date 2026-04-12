# pseo-engine

**One command. Any site. Thousands of keyword-targeted landing pages.**

Open source. Framework-agnostic. Vibe-code friendly. Your design stays 100% intact.

---

## Start Here

```bash
git clone https://github.com/MadhavShankar/pseo-engine
cd pseo-engine && npm install
node engine/cli.js start
```

That's it. `start` walks you through everything — keywords, config, template setup, and first build — in one guided flow. No manual config editing required.

---

## What It Does

You have a site. You want to rank for hundreds of location, role, category, or persona-based keywords. Writing each page manually is not an option.

pseo-engine generates one landing page per keyword from a single template. Every page gets:
- Correct `<title>` and meta description
- Keyword-specific H1, hero text, body content, and FAQ
- JSON-LD structured data (Service, Product, Article, LocalBusiness, etc.)
- Canonical URL, breadcrumbs, and internal links
- Segmented XML sitemaps ready for Google Search Console

Your CSS, design, navigation, and component structure stay exactly as they are. The engine only fills `{{slot}}` placeholders you mark in one template file. Every other byte passes through unchanged.

---

## All You Need to Give It

Just two things:

1. **Your page** — a live URL (`https://yoursite.com/hire`) or a local file (`./pages/hire.jsx`)
2. **Your keywords** — seed terms and what to combine them with (cities, roles, personas, price ranges)

`start` asks for both, auto-detects your framework and site type, writes the config, builds the keyword library, and tells you exactly what to run next.

```bash
node engine/cli.js start
# → Paste URL or file path when asked
# → Enter your keywords and dimensions
# → Done. Run: node engine/cli.js build
```

---

## The Keyword Library

pseo-engine is driven by `data/keywords.md` — a plain text file you own and edit. The guided `start` command builds it from your answers. Here is what it looks like:

```markdown
## [Cluster ID: location-role] Hire by Location and Role
**Hub URL:** /hire-developers
**Schema:** Service
**Intent:** transactional

| Keyword                              | URL Slug                              | Primary Modifier | Priority |
|--------------------------------------|---------------------------------------|-----------------|----------|
| hire software engineers in bangalore | hire-software-engineers-in-bangalore  | bangalore        | 1        |
| hire data scientists in mumbai       | hire-data-scientists-in-mumbai        | mumbai           | 1        |
```

To add more pages: add rows. To remove pages: delete rows. To rebuild: run `node engine/cli.js build`.

---

## What Gets Generated

After a build, your `/output` folder contains:

```
output/
  hire-software-engineers-in-bangalore/
    index.html          ← complete page, valid HTML, JSON-LD, meta tags
  hire-data-scientists-in-mumbai/
    index.html
  ...
  sitemap-location-role.xml
  sitemap-index.xml     ← submit this one to Google Search Console
  robots.txt
```

Deploy this folder alongside your existing site. Submit `sitemap-index.xml` to Google Search Console once. Done.

---

## All Commands

```bash
node engine/cli.js start              # Guided setup — start here
node engine/cli.js detect <page>      # Scan existing page, auto-insert {{slot}} tags
node engine/cli.js keywords           # Rebuild keyword library interactively
node engine/cli.js build              # Generate all pages
node engine/cli.js build --dry-run    # Preview without writing files
node engine/cli.js build --cluster X  # Build one cluster only (good for testing)
node engine/cli.js validate           # Quality check generated pages
node engine/cli.js report             # Print build summary
node engine/cli.js clean --confirm    # Delete /output
```

---

## Frameworks Supported

| Framework | Output | Deploy step |
|---|---|---|
| Next.js | `/output/pages/*.jsx` | `cp -r output/pages/* pages/ && next build` |
| Plain HTML | `/output/[slug]/index.html` | Upload `/output` to your host |
| Astro | `/output/src/pages/*.astro` | `cp -r output/src/pages/* src/pages/ && astro build` |
| Nuxt | `/output/pages/*.vue` | `cp -r output/pages/* pages/` |

---

## Content Providers

| Provider | Cost | API Key | Quality |
|---|---|---|---|
| `template-only` | Free | None | Good baseline |
| `claude` | ~$2–5 per 1000 pages | `ANTHROPIC_API_KEY` | Excellent |
| `openai` | ~$3–7 per 1000 pages | `OPENAI_API_KEY` | Excellent |
| `local-llm` | Free | None (Ollama) | Variable |

Default is `template-only`. Change in `pseo.config.json` when you're ready.

---

## Site Types Supported

`saas-landing` · `blog` · `ecom` · `local-business` · `app-download` · `directory` · `news` · `portfolio`

Each type has built-in defaults for schema type, crawl strategy, content length, and internal linking pattern.

---

## Reference Implementations

Three complete, runnable examples are included:

```bash
# SaaS example — 158 pages across 3 clusters
node engine/cli.js build --config examples/saas-example/pseo.config.json

# Blog — 50 how-to and comparison pages
node engine/cli.js build --config examples/blog-example/pseo.config.json

# E-commerce — 80 category and price-range pages
node engine/cli.js build --config examples/ecom-example/pseo.config.json
```

---

## For AI Agents (Claude Code, Cursor, Copilot)

This repo includes `SKILL.md` — a complete instruction file for AI agents. If you are using an AI coding assistant, tell it:

> "Read SKILL.md and help me set up pseo-engine for my site."

The skill file tells the agent to always collect your keyword strategy first, detect your existing page structure, run a dry-run before the full build, and validate output quality.

---

## After First Build — Google Search Console

1. Deploy `/output` to your hosting
2. Go to [search.google.com/search-console](https://search.google.com/search-console)
3. Sitemaps → Submit → `https://yourdomain.com/sitemap-index.xml`
4. Done. Google discovers and crawls all pages from the index.

**What to expect:** First indexed pages in 2–4 weeks. Impression growth compounding from month 3.

---

## Documentation

Full reference: [DOCUMENTATION.md](./DOCUMENTATION.md)

Covers config schema, template manifests, keyword cluster design, framework integration, crawl budget management, and GSC measurement guide.

---

## Contributing

To add a site type: create a JSON in `engine/site-types/`, add the ID to `registry.js`.

To add a framework adapter: create a file in `engine/adapters/`, add a case to `generate.js`.

To add a content provider: implement the interface in `engine/content-providers/provider.interface.js`, add a case to `content.js`.

---

## License

MIT — built by [Madhav Shankar](https://madhavshankar.com)
