# pseo-engine Documentation

---

## 1. What is pseo-engine

Programmatic SEO is the practice of generating large numbers of keyword-targeted landing pages from structured data and templates, rather than writing each page manually. A site with 10 hand-written pages can have 5,000 indexed, high-intent pages with the right infrastructure. The traffic impact compounds over months as Google discovers, crawls, and ranks the generated pages.

The problem most pSEO implementations run into is not content — it is architecture. Duplicate content penalties, thin page noindexing, crawl budget exhaustion on orphan pages, and broken internal link graphs kill indexation before a single page ranks. `pseo-engine` solves these structural problems first. Content generation is the last 20%.

`pseo-engine` is an open-source, CLI-driven engine that generates static landing pages for any site type without touching the site's design. It is driven by a single `keywords.md` file that contains every keyword, cluster, and URL the engine will generate. A keyword wizard creates this file from your seed keywords and dimension inputs. You edit it before the build, then run the build. Output lands in `/output` and is ready to deploy.

---

## 2. How It Works

```
[keywords.md] ──► [Ingest] ──► [Cluster] ──► [Generate + Content Engine]
                                                         │
                                              [SEO Layer + JSON-LD]
                                                         │
                                              [Internal Linker]
                                                         │
                                              [Validator]
                                                         │
                                              [Sitemap Generator]
                                                         │
                                               [/output]
```

**Ingest** reads `keywords.md` (or CSV/JSON/API), validates every record, deduplicates on URL slug, and normalises to a standard `KeywordRecord` format.

**Cluster** builds a directed ClusterMap graph from the keyword library. Hub pages point to all spokes. Spokes point back to the hub and to related spokes by topical similarity. Cross-cluster links connect pages that share a modifier value (e.g. "bangalore" pages across different clusters).

**Generate + Content Engine** reads each record, loads the template and its manifest, builds a context object, calls the configured content provider to fill all declared slots, and writes the output file via the framework adapter.

**SEO Layer** generates the complete `<head>` block (title, meta description, canonical, Open Graph, Twitter card, hreflang) and all JSON-LD structured data blocks for the page.

**Internal Linker** generates `{{internal_links}}` HTML blocks for each page based on the ClusterMap edge graph. Hub pages link to all spokes. Spokes link to hub and 3–5 related spokes.

**Validator** checks every generated page for: word count, keyword density, duplication ratio against cluster peers, meta tag lengths, canonical presence, JSON-LD validity, and orphan status.

**Sitemap Generator** writes one XML sitemap per cluster, a sitemap index, and `robots.txt`. Noindexed pages are excluded.

---

## 3. Quick Start

Two inputs. Your existing page and your keywords. That is all you need to provide.

```bash
# 1. Clone and install
git clone https://github.com/your-username/pseo-engine
cd pseo-engine && npm install

# 2. Run setup — give it your page + keywords, it handles everything else
node engine/cli.js start
```

What `start` asks for (interactive prompts):
- Your page — a live URL (`https://yoursite.com/hire`) or file path (`./pages/hire.jsx`)
- One sentence about your site
- Seed keywords (e.g. `hire react developers, hire python engineers`)
- Dimensions (location, role, persona, price range, seniority, technology)
- Dimension values for each selected dimension
- Site name, base URL, content provider preference

What `start` writes automatically:
- `pseo.config.json` — full config, inferred from your page
- `data/keywords.md` — keyword library from your inputs
- `templates/your-page.html` — your page with `{{slot}}` tags injected
- `templates/your-page.manifest.json` — slot contract

```bash
# 3. Preview (no files written)
node engine/cli.js build --dry-run

# 4. Build all pages
node engine/cli.js build

# 5. Validate quality
node engine/cli.js validate

# 6. Check summary
node engine/cli.js report
```

Expected output from `npx pseo-engine build`:
```
🔧  pseo-engine Build

✓ Loaded 158 keywords across 3 clusters
✓ Cluster graph built — 161 pages
✓ Link graph built — 948 links
✓ Generated 161 pages (0 errors, 0 skipped)
✓ Validation complete

📊  Validation Report
  Total pages : 161
  ✅ Pass     : 53
  ⚠️  Warn     : 108
  ❌ Fail     : 0
  🔴 Error    : 0

✓ Generated 3 sitemaps + sitemap-index.xml + robots.txt

✅  Build complete
  Pages generated : 161
  Sitemaps        : 3
  Orphan pages    : 0
  Output dir      : ./output
```

A high warn count on a fresh setup is normal — most warnings are the
duplication guard flagging pages that don't have enrichment data yet.
Add data to the `Notes` column in `keywords.md` (or an enrichment file)
and the warnings disappear as pages become genuinely unique.

---

## 4. Config Reference

All config lives in `pseo.config.json`.

| Key | Type | Required | Default | Description |
|-----|------|----------|---------|-------------|
| `site.name` | string | yes | — | Site or product name |
| `site.baseUrl` | string | yes | — | Production base URL, no trailing slash |
| `site.defaultLocale` | string | no | `"en"` | Default locale code |
| `site.frameworkAdapter` | string | yes | — | `nextjs` / `astro` / `nuxt` / `html` |
| `site.siteType` | string | yes | — | See Site Type Reference below |
| `site.brandVoice` | string | no | — | One sentence describing tone, used in LLM prompts |
| `site.defaultOgImage` | string | no | `"/og-image.png"` | Default OG image path |
| `site.locales` | array | no | `[]` | Locale codes for hreflang generation |
| `contentProvider` | string | no | `"template-only"` | `template-only` / `claude` / `openai` / `local-llm` |
| `contentProviderConfig.maxConcurrent` | integer | no | `5` | Max parallel content generation calls |
| `contentProviderConfig.cacheTtlHours` | integer | no | `168` | Content cache TTL in hours |
| `contentProviderConfig.ollamaModel` | string | no | `"llama3.1"` | Model for local-llm provider |
| `contentProviderConfig.ollamaHost` | string | no | `"http://localhost:11434"` | Ollama host URL |
| `templates` | array | yes | — | Template definitions, one per cluster |
| `templates[].id` | string | yes | — | Unique template ID |
| `templates[].file` | string | yes | — | Path to template file (relative to config) |
| `templates[].cluster` | string | yes | — | Cluster ID from `keywords.md` |
| `dataSource.type` | string | yes | — | `keywords-md` / `csv` / `json` / `api` |
| `dataSource.path` | string | yes* | — | Path to data file (*not required for `api` type) |
| `dataSource.apiEndpoint` | string | no | — | API URL for `api` type |
| `dataSource.columnMap` | object | no | — | Column name mapping for `csv` type |
| `internalLinking.maxLinksPerPage` | integer | no | `8` | Max internal links per page |
| `internalLinking.linkingStrategy` | string | no | `"topical"` | `topical` / `sequential` / `hierarchical` |
| `sitemapConfig.segmentByCluster` | boolean | no | `true` | One sitemap per cluster |
| `sitemapConfig.maxUrlsPerSitemap` | integer | no | `10000` | Max URLs per sitemap file |
| `sitemapConfig.changefreq` | string | no | `"monthly"` | Sitemap changefreq value |
| `crawlGuards.minUniqueWordCount` | integer | no | `200` | Pages below this are flagged |
| `crawlGuards.maxDuplicationRatio` | float | no | `0.6` | Jaccard similarity threshold for duplicate warning |
| `crawlGuards.noindexThreshold` | integer | no | `150` | Pages below this word count are noindexed |

---

## 5. Site Type Reference

| ID | Display Name | Default Schema | Crawl Strategy | Best For |
|----|-------------|---------------|----------------|---------|
| `saas-landing` | SaaS Landing Page | Service, FAQPage | Cluster-first | B2B/B2C SaaS product pages |
| `blog` | Blog | Article, Author | Recency-weighted | Content sites, guides, tutorials |
| `ecom` | E-Commerce | Product, Offer | Facet-heavy | Product and category pages |
| `local-business` | Local Business | LocalBusiness, Service | Geo-cluster | Service area pages |
| `app-download` | App Download Page | SoftwareApplication | Platform-facet | Mobile/desktop app pages |
| `directory` | Directory | ItemList | Alphabetic+geo | Listing and directory sites |
| `news` | News / Media | NewsArticle | Date-priority | News and media sites |
| `portfolio` | Portfolio | CreativeWork | Project-cluster | Creative and professional portfolios |

Each site type defines defaults for: `suggestedSlots`, `contentStrategy.minWordCount`, `sitemapDefaults.changefreq`, `noindexThreshold`, and `keywordModifiers`. These are all overridable in your template manifest.

---

## 6. Template Manifest Reference

Every template file must have a sibling `.manifest.json` file with the same base name.

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `templateId` | string | yes | Unique template identifier |
| `version` | string | no | Semver version string |
| `siteType` | string | yes | Must match a valid site type ID |
| `frameworkAdapter` | string | yes | `nextjs` / `astro` / `nuxt` / `html` |
| `description` | string | no | Human-readable description |
| `requiredSlots` | array | yes | Slot names that must have content — build errors if empty |
| `optionalSlots` | array | no | Slot names that are generated if defined |
| `customSlots` | array | no | Custom slot names not in the site type's suggested list |
| `schemaType` | string | yes | JSON-LD schema type for this template |
| `canonicalStrategy` | string | no | `"self"` (default), `"parent"`, `"custom"` |
| `contentRules` | object | no | Per-slot validation rules (see below) |

**Content rule keys** (per slot):
| Rule | Type | Description |
|------|------|-------------|
| `minChars` | integer | Minimum character count |
| `maxChars` | integer | Maximum character count (hard enforced) |
| `minWords` | integer | Minimum word count |
| `maxWords` | integer | Maximum word count |
| `maxKeywordDensity` | float | Maximum keyword density (0.03 = 3%) |
| `mustContain` | string | `"primaryKeyword"` — fails if keyword not present |
| `minItems` | integer | For list slots like faq_block |
| `maxItems` | integer | For list slots like faq_block |

---

## 7. Keywords.md Guide

### How the wizard works

Run `npx pseo-engine keywords`. The wizard asks:

1. Site name and description (one sentence)
2. Target region
3. Seed keywords (3–10, comma-separated)
4. Dimension selection (multi-select: location, role, persona, category, etc.)
5. Dimension values (prompted per selected dimension)
6. Intent types (transactional, commercial, informational, navigational)
7. Exclusion patterns and minimum priority threshold
8. Optional: volume estimation via DataForSEO or Semrush API

After completion, the wizard builds the full Cartesian product of seeds × dimensions, scores each combination by a priority heuristic, groups into clusters, and writes `data/keywords.md`.

### Editing keywords.md manually

The file is designed for human editing. Before running `build`:

- **Delete rows** to remove pages you don't want
- **Change priority** (1/2/3) to control sitemap priority — 1 = highest
- **Add rows** manually for custom one-off pages (follow the table format exactly)
- **Add notes** in the Notes column to pass metadata to the content generator
- **Create new cluster sections** following the `## [Cluster ID: ...]` pattern exactly

The parser handles: extra spaces, trailing whitespace, blank rows between table rows. It does not handle: missing pipe characters, changed column order, missing header comment block.

---

## 8. Content Provider Guide

| Provider | API Key | Cost per 1000 pages | Quality | Use When |
|---------|---------|-------------------|---------|----------|
| `template-only` | None | Free | Good with enrichment data | Default — free, offline, production-ready when paired with enrichment data |
| `claude` | `ANTHROPIC_API_KEY` | ~$15–25 | Excellent | Optional upgrade for varied prose without enrichment data |
| `openai` | `OPENAI_API_KEY` | ~$10–20 | Excellent | If you already use OpenAI |
| `local-llm` | None | Free (compute) | Variable | Privacy requirements, self-hosted |

**Claude provider setup:**
```bash
export ANTHROPIC_API_KEY=your_key_here
# In pseo.config.json:
# "contentProvider": "claude"
```

**OpenAI provider setup:**
```bash
export OPENAI_API_KEY=your_key_here
# "contentProvider": "openai"
```

**Local LLM setup:**
```bash
# Install Ollama: https://ollama.ai
ollama pull llama3.1
# "contentProvider": "local-llm"
# "contentProviderConfig": { "ollamaModel": "llama3.1" }
```

Content is cached in `/output/.content-cache/` by default (TTL: 168 hours). A rebuild does not regenerate content for unchanged pages unless you clear the cache with `npx pseo-engine clean --confirm`.

---

## 9. Keyword Cluster Design

**Dimension sizing.** A cluster is the Cartesian product of your dimensions. 10 roles × 10 locations = 100 pages. That is healthy. 50 roles × 50 locations = 2,500 pages in one cluster — only pursue this if you have strong data confirming search volume across all combinations.

**Warning signs of over-generation:**
- Cluster Jaccard similarity average above 0.6 (pages too similar to each other)
- Word count falling below 200 for most pages (thin content)
- More than 3 dimensions in a single cluster (content differentiation breaks down)

**Recommended cluster sizes by site type:**
- SaaS: 50–500 pages per cluster
- Local business: 50–200 (city × service)
- Ecom: 200–2000 (category × facet)
- Blog: 20–100 (topic × modifier)

**Phased rollout.** Do not launch all clusters at once on a new domain. Start with your highest-priority cluster (Priority: HIGH in keywords.md). Monitor Google Search Console for 4 weeks: check the Coverage report (Indexed vs Discovered), impressions by URL prefix, and crawl rate. Add the next cluster only after the first shows indexation above 70%.

Use `npx pseo-engine build --cluster location-role` to build one cluster at a time.

---

## 10. Framework Integration Guide

This section covers how to add pseo-engine to a site you have already built. The engine does not require you to rebuild or restructure anything. It reads one of your existing pages as a template, fills the variable text with keyword-specific content, and writes new pages to `/output`. Your original page is never modified.

### The two things you always do regardless of framework

**1. Copy one existing page as the template**

Pick the page you want to generate variations of — a hire page, a product category page, a location landing page. Copy it into `pseo-engine/templates/`.

**2. Run `detect` to auto-insert slot markers**

```bash
node engine/cli.js detect path/to/your-page.html
```

The `detect` command reads your page, identifies the H1, meta title, meta description, hero subtext, body content, FAQ sections, and CTA text, and inserts `{{slot}}` markers at those positions automatically. It writes three files:

- `your-page.pseo.html` — your page with slot tags inserted
- `your-page.manifest.json` — the slot contract, auto-generated
- `your-page.original.html` — your original page, untouched backup

It prints a detection report showing confidence levels for each slot:

```
📋  Detection Report
  ✅ High confidence : meta_title, meta_description, h1
  ⚠️  Medium confidence: hero_subtext, body_content, cta_text
  ➕ Auto-injected   : internal_links, breadcrumbs
⚠️  Action needed:
  → No FAQ section detected — added a placeholder comment
```

Review the output file. Check each slot is in the right position. For any slot flagged as low confidence or not found, add the marker manually:

```html
<!-- Only the variable text gets slot tags -->
<h1>{{h1}}</h1>           <!-- text slot — HTML-escaped -->
<p>{{hero_subtext}}</p>

<!-- For HTML slots (raw HTML injected) use triple braces -->
{{{body_content}}}
{{{faq_block}}}
{{{internal_links}}}
```

Your CSS classes, component structure, navbar, footer, images, inline styles — all untouched. The engine physically cannot touch them because it only operates on named `{{slot}}` placeholders.

---

### Next.js

**Files land in:** `/output/pages/[slug].jsx`

Steps:
1. Copy your page: `cp pages/your-page.jsx pseo-engine/templates/your-page.html`
2. Add `{{slot}}` tags to variable text only
3. Create `pseo-engine/templates/your-page.manifest.json` declaring your slots
4. Run `node engine/cli.js build`
5. Copy output: `cp -r output/pages/* pages/`
6. Run `next build` — it picks up all new pages automatically

Your original `pages/your-page.jsx` is untouched throughout.

---

### Plain HTML / Static hosting

**Files land in:** `/output/[slug]/index.html`

Steps:
1. Copy your page: `cp your-page.html pseo-engine/templates/your-page.html`
2. Add `{{slot}}` tags to variable text only
3. Set `"frameworkAdapter": "html"` in `pseo.config.json`
4. Run `node engine/cli.js build`
5. Upload the entire `/output` folder to your server, S3 bucket, or Netlify alongside your existing files

Each slug becomes a directory with an `index.html`. No build step required — they are complete standalone pages.

---

### Astro

**Files land in:** `/output/src/pages/[slug].astro`

Steps:
1. Copy your page: `cp src/pages/your-page.astro pseo-engine/templates/your-page.html`
2. Add `{{slot}}` tags to variable text only
3. Set `"frameworkAdapter": "astro"` in config
4. Run `node engine/cli.js build`
5. Copy: `cp -r output/src/pages/* src/pages/`
6. Run `astro build`

---

### Nuxt

**Files land in:** `/output/pages/[slug].vue`

Steps:
1. Copy your page: `cp pages/your-page.vue pseo-engine/templates/your-page.html`
2. Add `{{slot}}` tags to variable text only
3. Set `"frameworkAdapter": "nuxt"` in config
4. Run `node engine/cli.js build`
5. Copy: `cp -r output/pages/* pages/`

---

### WordPress / CMS

No native adapter. Build with `"frameworkAdapter": "html"`. Then either:

- Host `/output` pages in a subdirectory (e.g. `yoursite.com/hire/`) served as static files
- Use WP2Static or Simply Static to serve generated HTML from the same domain

---

### Updating after first build

```bash
# Edit keywords.md — add rows, remove rows, change priorities
node engine/cli.js build
# Deploy /output
```

Two commands. Content for unchanged pages is served from cache. Only new or edited keyword rows get regenerated.

---

## 11. Crawl Budget Management

**When to use noindex.** Pages below the `noindexThreshold` word count (default 150) are automatically marked `noindex,nofollow` by the engine. Do not fight this — thin pages waste crawl budget and can trigger quality filters. Fix the content or remove the page.

**Sitemap segmentation.** With `segmentByCluster: true`, each cluster gets its own sitemap. This lets you monitor indexation per cluster in Google Search Console (filter Coverage by URL prefix). It also means you can submit one cluster at a time via GSC's sitemap submission.

**Phased rollouts.** Use the `--cluster` flag to build and deploy one cluster at a time. Deploy the hub page first, then the spokes. Google needs to find the hub via your main navigation before it follows internal links to spokes.

**What to watch in GSC:**
- Coverage → Indexed count by week (should grow linearly for healthy crawl)
- Coverage → Discovered / Not Indexed (means Google found the URL but hasn't crawled it — crawl budget issue)
- Performance → filter by URL contains `/[your-cluster-path]/` to see impressions growing

---

## 12. Measuring Success

**Timeline expectations:**
- Week 1–2: Google discovers hub pages via sitemap
- Week 2–4: First spoke pages start appearing in Coverage as "Crawled, not indexed"
- Week 4–8: Spokes begin moving to "Indexed"
- Month 3–6: Impression curve starts compounding as pages accumulate ranking history

**GSC metrics to track by cluster:**

| Metric | What it tells you |
|--------|-----------------|
| Indexed URLs | Raw health — is Google accepting your pages? |
| Impressions by URL prefix | Are pages appearing in search results at all? |
| Average position | Where are you ranking? Under 20 = visible, under 10 = competitive |
| CTR by cluster | Is your meta title/description compelling? Under 2% = fix copy |
| Crawl rate | Is Googlebot keeping up with new pages? |

**The 100x benchmark.** A site going from 50 hand-written pages to 5,000 indexed pSEO pages should see 50–100x impression growth within 6 months, assuming: pages pass the noindex threshold, internal linking is complete, sitemaps are submitted, and the hub pages have at least some organic authority.

---

## 13. Contributing

**Add a site type:** Create `engine/site-types/[your-type].json` using the existing JSON structure as a template. Add the ID to the `VALID_SITE_TYPES` array in `engine/site-types/registry.js`. Submit a PR with an example config using the new type.

**Add a framework adapter:** Create `engine/adapters/[framework].js`. The module must export a function `write(slug, html, outputDir)` that handles the output format for that framework. Add a case to the switch statement in `engine/generate.js`.

**Add a content provider:** Implement the interface in `engine/content-providers/provider.interface.js`. Add a case to `engine/content.js`. Document the required environment variables and estimated cost in Section 8 of this file.

**PR requirements:** All PRs must include a working example config and a dry-run passing the existing SaaS example build test.
