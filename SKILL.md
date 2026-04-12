---
name: pseo-engine
description: >
  Programmatic SEO engine. Generates hundreds to thousands of keyword-targeted
  landing pages from any existing site without touching its design or CSS.
  Use this skill whenever the user wants to: add programmatic SEO, generate
  landing pages at scale, rank for many keyword variations, create city/role/
  category pages automatically, set up sitemaps and structured data, or mentions
  pSEO, keyword pages, or long-tail landing pages.
triggers:
  - "add programmatic SEO"
  - "generate landing pages"
  - "create pages for every city"
  - "rank for many keywords"
  - "set up SEO for my site"
  - "build landing pages from my template"
  - "pSEO"
  - "keyword pages at scale"
always_run_first: true
---

# pseo-engine Skill

**Read this entire file before running a single command.**
**Always run this skill first. Never skip it.**

---

## What This Is

pseo-engine takes two inputs from the user and generates hundreds of SEO-ready
landing pages from them:

1. **Their existing page** — a URL (`https://...`) or a local file path
2. **Their keywords** — seed terms and what to combine them with

That is all they need to provide. The engine figures out the rest.

---

## Your First Message — Always Ask These Two Things

Before touching any file or running any command, ask the user:

> "To set up pseo-engine I need two things from you:
>
> **1. Your page** — paste either:
>    - A live URL (e.g. `https://yoursite.com/hire`)
>    - A local file path (e.g. `./pages/hire.jsx` or `./src/pages/landing.astro`)
>
> **2. Your keywords** — tell me:
>    - What is your site about? (one sentence)
>    - What are your 3–10 seed keywords?
>    - What should they be combined with? For example:
>      cities, job roles, personas, price ranges, seniority levels, technologies
>
> Once I have those two things I'll handle the setup automatically."

Do not proceed until you have both. Do not guess. Do not assume a URL from
context. Ask explicitly.

---

## Setup — One Command Does Everything

Once you have the two inputs, run:

```bash
node engine/cli.js start
```

This single command:
- Fetches the page (URL) or reads the file
- Auto-detects site type, framework, and content slots
- Runs the keyword wizard interactively
- Writes `pseo.config.json`, `data/keywords.md`, and the slotted template
- Tells the user exactly what to do next

Never manually wire configs or write keywords.md by hand.
Never run `init`, `keywords`, and `detect` separately.
`start` does all of it.

---

## After Setup — Three Commands to Go Live

```bash
# 1. Preview what will be built — no files written
node engine/cli.js build --dry-run

# 2. Build all pages
node engine/cli.js build

# 3. Check output quality
node engine/cli.js report
```

Output lands in `/output`. The user deploys it and submits
`/sitemap-index.xml` to Google Search Console once.

---

## The Only Things That Change in the User's Template

The engine ONLY fills `{{slot}}` placeholders in the template's `<body>`.
It never touches:
- CSS or stylesheets
- `<link>`, `<script>`, `<meta charset>`, `<meta viewport>`, favicon
- Navigation, footer, or any component outside the declared slots
- Any original file — originals are never modified

In `<head>` it only replaces: `<title>`, meta description, canonical,
robots meta, OG tags, Twitter card tags, and JSON-LD structured data.
Everything else in `<head>` is preserved byte-for-byte.

---

## Content Quality — The One Thing That Determines Rankings

Pages with only keyword variations will be suppressed by Google.
Pages with real, specific data per page will rank.

Tell the user to add enrichment data to the `Notes` column in `keywords.md`:

```
| hire react devs in bangalore | ... | 1 | avg_salary:18-45LPA | talent_pool:92000 | top_cos:Flipkart,Swiggy |
```

The engine uses this to generate genuinely differentiated content per page.
Without it, use `contentProvider: "claude"` or `"openai"` — LLM providers
generate varied content without requiring data in the notes column.
`template-only` is for testing only, not production indexing.

---

## Common Scenarios

**User has a live site:**
```
"Here's my page: https://mysite.com/hire"
→ node engine/cli.js start
→ paste the URL when prompted
```

**User has a local file:**
```
"Here's my template: ./pages/hire.jsx"
→ node engine/cli.js start
→ paste the file path when prompted
```

**User wants to target many cities:**
```
Seed keywords: "plumber, electrician, locksmith"
Dimension: Location
Values: london, manchester, birmingham, leeds, bristol
→ Generates 15 pages (3 services × 5 cities)
```

**User wants to target many roles:**
```
Seed keywords: "hire developers"
Dimension: Role
Values: react developer, python engineer, data scientist, devops engineer
→ Generates 4 pages
```

**User wants to rebuild after adding keywords:**
```
→ Edit data/keywords.md (add/remove rows)
→ node engine/cli.js build
→ Deploy /output
```

---

## Error Handling

| Error | What to do |
|-------|-----------|
| `File not found` | Check path — use `./` prefix for relative paths |
| `HTTP 403 / 404` from URL | Try the local file instead; some sites block scrapers |
| `No template for cluster` | Check `pseo.config.json` — `cluster` must match a `[Cluster ID:]` in keywords.md |
| `0 pages generated` | Check that `data/keywords.md` has keyword rows (not just headers) |
| `inquirer not installed` | Run `npm install` in the pseo-engine directory |
| Build errors in log | Check `output/build-errors.log` — one page failure never stops the build |

---

## What Not to Do

- Do not modify the user's original page file directly
- Do not ask for a `pseo.config.json` — `start` creates it
- Do not run `init` or `keywords` separately — `start` replaces both
- Do not invent slot names — the detect step finds them automatically
- Do not run a full build without a dry-run first on a new setup
- Do not tell the user to add `{{slot}}` tags manually — detect does this

