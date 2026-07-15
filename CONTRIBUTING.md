# Contributing to pseo-engine

Thanks for your interest in improving pseo-engine. This project aims to make
programmatic SEO accessible to everyone — including people who don't write
code — so clarity and safety matter more than cleverness.

## Getting set up

```bash
git clone https://github.com/MadhavShankar/pseo-engine
cd pseo-engine
npm install
```

Verify your setup by running the reference builds — all three must finish with
zero errors and zero orphan pages:

```bash
npm run build:saas
npm run build:blog
npm run build:ecom
```

## Ways to contribute

### Add a site type
1. Create a JSON profile in `engine/site-types/` (copy `blog.json` as a starting point).
2. Register the ID in `engine/site-types/registry.js`.
3. Add sensible defaults: schema type, content length, linking pattern.

### Add a framework adapter
1. Create a file in `engine/adapters/` following the `write(slug, html, outputDir)` signature.
2. Add a case to `_writeOutput()` in `engine/generate.js`.
3. The adapter must preserve every SEO tag from the generated `<head>` —
   title, meta description, canonical, robots, OG/Twitter tags, and JSON-LD.

### Add a content provider
1. Implement the interface in `engine/content-providers/provider.interface.js`.
2. Add a case to `_createProvider()` in `engine/content.js`.
3. Providers that need credentials must fail gracefully in `healthCheck()` —
   the engine falls back to `template-only` and the build must still succeed.

## Ground rules

These are the project's hard constraints. PRs that break them will not be merged:

- **The engine never modifies files outside `/output` and `/data/keywords.md`.**
- **Template design is never touched.** Only `{{slot}}` content changes.
- **`template-only` must always work with zero API keys.** Never make an API
  key a requirement for the default path, in code or in docs.
- **One page failure never kills a build.** Wrap page-level work in try/catch.
- **Generated pages must stay Google-compliant.** Thin pages get `noindex`,
  sitemaps exclude noindexed pages, and keyword density stays under 3%.
- **Generated copy must read as natural English.** If a template can produce
  "Laptops In Bangalore in Bangalore", it's a bug.

## Submitting changes

1. Fork, branch from `main`, make your change.
2. Run all three example builds and `node engine/cli.js validate` — include the
   before/after validation summary in your PR description.
3. Keep PRs focused: one fix or feature per PR.

## Reporting issues

Open a GitHub issue with: the command you ran, your `pseo.config.json`
(redact your domain if you prefer), and the full terminal output. If the build
produced `output/build-errors.log`, attach it.
