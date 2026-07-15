# pseo-engine

**One command. Any site. Hundreds of keyword-targeted landing pages — free, no API key, design untouched.**

pseo-engine is an open-source programmatic SEO engine. You give it one existing page and a list of keywords; it generates a complete, Google-ready landing page for every keyword — each with its own title, meta description, content, FAQ, structured data, internal links, and sitemap entry. Your design, CSS, and navigation are never modified.

Built for non-technical users: one guided command handles the entire setup.

---

## Why Use This

- **Rank for long-tail keywords at scale.** "hire react developers in bangalore", "laptops under 30000", "plumber in leeds" — search queries like these are individually small but collectively huge. Manually writing a page for each is impossible; pseo-engine generates them all from one template.
- **Zero cost, zero API keys.** The default content engine is rule-based and runs fully offline. You never need an OpenAI or Anthropic account. (LLM providers exist as an *optional* paid upgrade — see [Content Providers](#content-providers).)
- **Google-compliant by design.** Built-in guards against the things that get programmatic SEO sites penalized: thin pages are automatically `noindex`ed and excluded from sitemaps, keyword density is capped, near-duplicate pages are flagged, and every page gets valid structured data, a canonical URL, and inbound internal links. See [Staying on Google's Good Side](#staying-on-googles-good-side).
- **Your design is sacred.** The engine only fills `{{slot}}` placeholders. Every other byte of your template — CSS, nav, footer, scripts — passes through unchanged.

## What It Does *Not* Do

Honesty matters more than marketing:

- It does **not** guarantee rankings. It gives every page the technical foundation to rank; whether it ranks depends on your content quality, domain authority, and competition.
- It does **not** invent facts about your business. Unique, valuable content comes from **your data** (the enrichment system below) — without it, pages are grammatically clean but similar to each other, and the validator will tell you so.
- It is **not** a spam tool. Publishing 10,000 near-identical pages will hurt your site. The engine warns you, noindexes the worst offenders, and the docs show you how to roll out gradually.

---

## Prerequisites

- **Node.js 18 or newer** ([download](https://nodejs.org)) — check with `node --version`
- **npm** (comes with Node.js)
- A website — live URL or local files — and a rough idea of the keywords you want to rank for

That's the whole list. No API keys, no accounts, no database.

---

## Get Started (3 steps)

```bash
# 1. Get the code and install
git clone https://github.com/MadhavShankar/pseo-engine
cd pseo-engine && npm install

# 2. Guided setup — paste your page URL/file and your keywords when asked
node engine/cli.js start

# 3. Preview, then build
node engine/cli.js build --dry-run
node engine/cli.js build
```

`start` asks for exactly two things — your page and your keywords — then auto-detects your framework and site type, writes the config and keyword library, and tells you what to run next. Generated pages land in `/output`, along with sitemaps, `robots.txt`, and quality reports.

**Deploy:** upload `/output` alongside your existing site, then submit `https://yourdomain.com/sitemap-index.xml` in [Google Search Console](https://search.google.com/search-console) once.

---

## The Keyword Library — Your Control Panel

Everything is driven by `data/keywords.md`, a plain text file you own and edit:

```markdown
## [Cluster ID: location-role] Hire by Location and Role
**Hub URL:** /hire-developers
**Schema:** Service
**Intent:** transactional

| Keyword                              | URL Slug                              | Primary Modifier | Priority | Notes |
|--------------------------------------|---------------------------------------|-----------------|----------|-------|
| hire software engineers in bangalore | hire-software-engineers-in-bangalore  | bangalore        | 1        | avg_salary:18-45LPA \| talent_pool:92000 \| top_cos:Flipkart,Swiggy |
```

- **Add pages:** add rows. **Remove pages:** delete rows. **Rebuild:** `node engine/cli.js build`.
- **The Notes column is your ranking superpower.** Pipe-separated `key:value` facts (salaries, counts, brands, prices — whatever is true for that keyword) are woven into the page copy, making each page genuinely unique and useful. Pages with enrichment data pass the duplication guard; pages without it get flagged.

---

## Staying on Google's Good Side

Programmatic SEO gets sites penalized when it produces thin, duplicated, over-optimized pages. pseo-engine ships with guards for each failure mode:

| Risk | Built-in protection |
|---|---|
| Thin content | Pages under the word threshold get `noindex,nofollow` and are excluded from sitemaps |
| Duplicate content | Jaccard-similarity check flags near-duplicate pages in the build report |
| Keyword stuffing | Density above 3% is flagged; templates are written to stay well under it |
| Orphan pages | Hub-and-spoke internal linking guarantees every page has inbound links; the build fails the audit if any page is orphaned |
| Missing signals | Every page gets a canonical URL, JSON-LD structured data (Service, Product, Article, FAQPage, BreadcrumbList…), and OG/Twitter tags |
| Crawl budget waste | Sitemaps are segmented per cluster with priority weighting; `robots.txt` is generated |

**Recommended rollout:** build one cluster first (`build --cluster <id>`), deploy it, watch Google Search Console for 2–4 weeks, then expand. Realistic expectations: first pages indexed in 2–6 weeks; meaningful impression growth compounds over 3–6 months. Anyone promising faster is selling something.

Run `node engine/cli.js report` after every build — it summarizes pass/warn/fail counts, orphans, and duplication warnings so you know exactly what to fix before deploying.

---

## Content Providers

| Provider | Cost | API Key | When to use |
|---|---|---|---|
| `template-only` *(default)* | Free | **None** | Always start here. With enrichment data in the Notes column, this is a complete production setup. |
| `claude` | ~$15–25 per 1,000 pages | `ANTHROPIC_API_KEY` | Optional: LLM-written prose when you have no enrichment data |
| `openai` | ~$10–20 per 1,000 pages | `OPENAI_API_KEY` | Optional: same, if you already use OpenAI |
| `local-llm` | Free (your hardware) | None (needs [Ollama](https://ollama.ai)) | Optional: LLM prose with full privacy |

You will never be asked for an API key unless you explicitly switch providers in `pseo.config.json`.

---

## Ongoing Use — the Loop

pseo-engine is designed to be re-run, not run once:

1. **Add keywords** — new rows in `data/keywords.md` (or re-run `node engine/cli.js keywords`)
2. **Enrich** — add real data to the Notes column for pages you want indexed
3. **Rebuild** — `node engine/cli.js build` (unchanged pages regenerate deterministically)
4. **Check** — `node engine/cli.js report`; fix warnings before deploying
5. **Deploy** — replace `/output` on your host; sitemaps update automatically
6. **Measure** — Google Search Console → Performance, filtered by cluster URL prefix
7. Repeat. Prune pages with zero impressions after ~3 months; double down on clusters that get traction.

---

## All Commands

```bash
node engine/cli.js start              # Guided setup — start here
node engine/cli.js build              # Generate all pages into /output
node engine/cli.js build --dry-run    # Preview page count, write nothing
node engine/cli.js build --cluster X  # Build one cluster (phased rollout)
node engine/cli.js validate           # Re-run quality checks on /output
node engine/cli.js report             # Print build summary + link audit
node engine/cli.js detect <page>      # Scan a page, auto-insert {{slot}} tags
node engine/cli.js keywords           # Interactive keyword wizard
node engine/cli.js clean --confirm    # Delete /output
```

---

## Frameworks & Site Types

**Output formats:** plain HTML (`/output/<slug>/index.html`), Next.js (`.jsx` with `next/head` SEO tags), Astro (`.astro`), Nuxt (`.vue`).

**Site types with tuned defaults:** `saas-landing` · `blog` · `ecom` · `local-business` · `app-download` · `directory` · `news` · `portfolio`

---

## Runnable Examples

Three complete reference implementations are included — all build with zero errors and zero orphan pages:

```bash
npm run build:saas   # 161 pages (158 keywords + 3 hub pages), 3 clusters
npm run build:blog   # 52 pages — how-to guides and comparisons
npm run build:ecom   # 82 pages — category and price-range pages
```

---

## For AI Agents (Claude Code, Cursor, Copilot)

This repo includes [SKILL.md](./SKILL.md) — instructions for AI coding assistants. Tell your agent:

> "Read SKILL.md and help me set up pseo-engine for my site."

The skill enforces the important rules: your site's real CSS is always fetched (never recreated), a dry-run happens before every full build, and **no API key is ever required or requested**.

---

## Documentation, License, Contributing

- **Full reference:** [DOCUMENTATION.md](./DOCUMENTATION.md) — config schema, template manifests, cluster design, crawl budget management, GSC measurement guide
- **License:** [MIT](./LICENSE)
- **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md) — how to add site types, framework adapters, and content providers

Built by [Madhav Shankar](https://madhavshankar.com).
