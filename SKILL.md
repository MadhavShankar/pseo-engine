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

## HARD RULE — Template Styling Must Come From The User's Site

**This is the most important rule in this file. It applies before any other step.**

When the user provides a URL or file, the generated pages must look identical
to the original site — same fonts, same colors, same layout, same nav, same
footer. The ONLY differences are the copy inside the `{{slot}}` areas.

### What this means in practice

If the input is a **URL**:
1. Fetch the page with WebFetch before creating any template file
2. Extract verbatim: every `<style>` block, every `<link rel="stylesheet">`,
   every `<link rel="preconnect">`, the full `<nav>` / sidebar HTML,
   the full `<footer>` HTML, and any inline `style=` attributes
3. Paste all of it into the template exactly as-is — no rewrites, no cleanup
4. Only then add `{{slot}}` placeholders in the content areas

If the input is a **local file**:
1. Read the file before creating any template
2. Use it as the direct base — copy the entire file, then add slots
3. Never replace the file's existing CSS with your own

### What is never allowed

- Writing custom CSS for a template — even one line
- Recreating nav or footer HTML from memory or from a text description
- Using a "similar" color scheme — only the exact values from the source
- Skipping the WebFetch step because you "already know" the site's design
- Using a generic base template and adjusting colors to match

### The test

Before saving the template file, ask: "If I opened the original site and this
generated page side by side, would a user notice any visual difference outside
the content slots?" If the answer is yes, the template is wrong. Fetch the
real CSS and redo it.

---

## What the Engine Changes (and Nothing Else)

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
The default `template-only` provider needs **no API key, ever** — combined
with enrichment data it is a complete, free production setup. Never ask the
user for an API key and never switch the provider on their behalf.

If the user has no enrichment data and explicitly wants LLM-written copy,
they can opt into `contentProvider: "claude"` or `"openai"` — mention it as
an option once, note it requires their own API key and costs money, and move on.

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

- **Do not write custom CSS for a template** — fetch the real CSS from the source page
- **Do not recreate nav or footer from scratch** — copy the exact HTML from the source page
- Do not modify the user's original page file directly
- Do not ask for a `pseo.config.json` — `start` creates it
- Do not run `init` or `keywords` separately — `start` replaces both
- Do not invent slot names — the detect step finds them automatically
- Do not run a full build without a dry-run first on a new setup
- Do not tell the user to add `{{slot}}` tags manually — detect does this

