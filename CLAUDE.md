# CLAUDE.md — Working on pseo-engine

Guidance for AI agents and contributors working **on this repo**. If you want to
*use* pseo-engine to generate pages for a site, read [SKILL.md](./SKILL.md) instead —
this file is for changing the engine itself.

## What This Is

An open-source programmatic SEO engine. It reads a keyword library
(`data/keywords.md`), fills `{{slot}}` placeholders in one user-supplied template,
and writes hundreds of SEO-complete static pages (title, meta, canonical, JSON-LD,
internal links, segmented sitemaps) to `/output`. The engine is fully built and
released — do not scaffold or rebuild modules from scratch.

## Commands

```bash
npm install          # only dependency step; no API keys needed
npm test             # builds all three examples — must pass 0 errors / 0 orphans
npm run build:saas   # 161 pages   npm run build:blog  # 52   npm run build:ecom  # 82
node engine/cli.js start    # guided end-user setup (URL/file + keywords)
node engine/cli.js report   # validation + link-audit summary for /output
```

Verify any engine change by running `npm test` and `node engine/cli.js report`.

## Architecture (one line per module)

- `engine/cli.js` — command router; wires ingest → cluster → link → generate → validate → sitemap
- `engine/onboard.js` / `detect.js` / `keywords.js` — setup wizard, slot auto-detection, keyword wizard/parser
- `engine/ingest.js` — loads keywords.md / CSV / JSON / API into KeywordRecords
- `engine/cluster.js` — hub-and-spoke graph; hubs link to ALL spokes
- `engine/linker.js` — renders internal-link blocks; audits orphans
- `engine/generate.js` — PageFactory: injects slots + head, writes via adapter, tracks `noindexedSlugs`
- `engine/seo.js` — head tags + JSON-LD (schema by site type, BreadcrumbList always)
- `engine/validate.js` — word count, duplication (Jaccard), density, collisions → ValidationReport.json
- `engine/sitemap.js` — per-cluster sitemaps + index + robots.txt, excludes noindexed slugs
- `engine/enrichment.js` — merges Notes-column + enrichment-file data into page context
- `engine/content-providers/` — template-only (default, zero-key), claude, openai, local-llm
- `engine/site-types/` — 8 JSON profiles, identical structure; register new ones in registry.js
- `engine/adapters/` — html, nextjs (must keep next/head SEO block), astro, nuxt

## Hard Constraints (violating any of these is a rejected change)

1. The engine never modifies files outside `/output` and `/data/keywords.md`.
2. Template design is never touched — only `{{slot}}` (escaped) / `{{{slot}}}` (raw) content changes.
3. `template-only` must always work with **zero API keys**; never make a key a
   requirement in code, docs, or agent instructions, and never ask users for one.
4. One page failure never kills a build (per-page try/catch, log to build-errors.log).
5. Noindexed pages are excluded from sitemaps (cli.js merges `factory.noindexedSlugs`
   with validation failures). Zero orphan pages: hubs link to all spokes —
   `maxLinksPerPage` applies to spokes only.
6. Generated copy must read as natural English: never append a modifier the keyword
   already contains (`_modIfAbsent`), and keep verb-phrase vs noun-phrase template
   branches (`_isVerbPhrase`) intact. Keyword density stays under 3%.
7. Claims in README/DOCUMENTATION must match measured build output — no invented
   numbers, no ranking guarantees.

## Format Specs

The keywords.md format (header comment block + `## [Cluster ID: ...]` sections +
pipe tables), template manifest schema, and pseo.config.json reference are all
documented in [DOCUMENTATION.md](./DOCUMENTATION.md). The parser depends on those
exact formats — change parser and docs together or not at all.
