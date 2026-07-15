import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { EnrichmentEngine } from './enrichment.js';
import { join } from 'path';

/**
 * PageValidator — quality guard that runs after generation.
 * Produces ValidationReport.json with per-page check results.
 */
export class PageValidator {
  constructor(config = {}) {
    this.config = config;
    this.outputDir = config.outputDir || './output';
    this.guards = config.crawlGuards || {};
    this.minWordCount = this.guards.minUniqueWordCount || 200;
    this.maxDuplication = this.guards.maxDuplicationRatio || 0.6;
    this.noindexThreshold = this.guards.noindexThreshold || 150;
  }

  /**
   * Run all validation checks on generated pages.
   * @param {object} clusterMap - from ClusterBuilder
   * @param {Map} slugToHtml - map of urlSlug -> generated HTML
   * @returns {object} ValidationReport
   */
  async run(slugToHtml) {
    const results = [];
    const contents = new Map(); // slug -> clean text

    // Extract text content from HTML
    for (const [slug, html] of slugToHtml) {
      contents.set(slug, this._extractText(html));
    }

    // Run per-page checks
    for (const [slug, html] of slugToHtml) {
      const checks = [];
      const text = contents.get(slug) || '';
      const words = text.split(/\s+/).filter(Boolean);

      // Word count check
      checks.push(this._checkWordCount(words.length));

      // Keyword density check
      const keyword = this._extractKeywordFromTitle(html);
      if (keyword) {
        checks.push(this._checkKeywordDensity(text, keyword, words.length));
      }

      // Meta title length
      checks.push(this._checkMetaTitle(html));

      // Meta description length
      checks.push(this._checkMetaDescription(html));

      // Canonical URL present
      checks.push(this._checkCanonical(html));

      // JSON-LD present
      checks.push(this._checkJsonLd(html));

      // Empty H1
      checks.push(this._checkH1(html));

      const hasError = checks.some(c => c.status === 'error');
      const hasFail = checks.some(c => c.status === 'fail');
      const hasWarn = checks.some(c => c.status === 'warn');
      const status = hasError ? 'error' : hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';

      results.push({ slug, status, checks });
    }

    // Duplication check across pages
    this._addDuplicationChecks(results, contents);

    // Enrichment score check — warn on pages likely to be thin
    this._addEnrichmentChecks(results, slugToHtml);

    const totals = {
      pass: results.filter(r => r.status === 'pass').length,
      warn: results.filter(r => r.status === 'warn').length,
      fail: results.filter(r => r.status === 'fail').length,
      error: results.filter(r => r.status === 'error').length,
      skipped: 0
    };

    const report = {
      buildDate: new Date().toISOString(),
      totalPages: results.length,
      totals,
      pages: results
    };

    writeFileSync(join(this.outputDir, 'ValidationReport.json'), JSON.stringify(report, null, 2));
    return report;
  }

  _checkWordCount(count) {
    if (count < this.noindexThreshold) {
      return { name: 'word_count', status: 'fail', detail: `${count} words — below noindex threshold of ${this.noindexThreshold}` };
    }
    if (count < this.minWordCount) {
      return { name: 'word_count', status: 'warn', detail: `${count} words — below recommended minimum of ${this.minWordCount}` };
    }
    return { name: 'word_count', status: 'pass', detail: `${count} words` };
  }

  _checkKeywordDensity(text, keyword, totalWords) {
    if (totalWords === 0) return { name: 'keyword_density', status: 'warn', detail: 'No content' };
    const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const kwCount = (text.toLowerCase().match(new RegExp(escaped, 'g')) || []).length;
    const density = kwCount / totalWords;
    if (density > 0.03) {
      return { name: 'keyword_density', status: 'warn', detail: `${(density * 100).toFixed(1)}% density — above 3% threshold (over-optimisation risk)` };
    }
    return { name: 'keyword_density', status: 'pass', detail: `${(density * 100).toFixed(1)}%` };
  }

  _checkMetaTitle(html) {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (!match) return { name: 'meta_title', status: 'error', detail: 'No <title> tag found' };
    const len = match[1].trim().length;
    if (len > 60) return { name: 'meta_title', status: 'warn', detail: `${len} chars — over 60 char limit` };
    if (len < 20) return { name: 'meta_title', status: 'warn', detail: `${len} chars — may be too short` };
    return { name: 'meta_title', status: 'pass', detail: `${len} chars` };
  }

  _checkMetaDescription(html) {
    const match = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)
      || html.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i);
    if (!match) return { name: 'meta_description', status: 'warn', detail: 'No meta description found' };
    const len = match[1].trim().length;
    if (len > 155) return { name: 'meta_description', status: 'warn', detail: `${len} chars — over 155 char limit` };
    return { name: 'meta_description', status: 'pass', detail: `${len} chars` };
  }

  _checkCanonical(html) {
    if (!html.includes('rel="canonical"')) {
      return { name: 'canonical', status: 'warn', detail: 'No canonical URL found' };
    }
    return { name: 'canonical', status: 'pass', detail: 'Present' };
  }

  _checkJsonLd(html) {
    if (!html.includes('application/ld+json')) {
      return { name: 'json_ld', status: 'warn', detail: 'No JSON-LD structured data found' };
    }
    // Validate JSON-LD is parseable
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (match) {
      try {
        JSON.parse(match[1]);
        return { name: 'json_ld', status: 'pass', detail: 'Valid JSON-LD present' };
      } catch {
        return { name: 'json_ld', status: 'warn', detail: 'JSON-LD present but not valid JSON' };
      }
    }
    return { name: 'json_ld', status: 'pass', detail: 'Present' };
  }

  _checkH1(html) {
    const match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
    if (!match || !match[1].trim()) {
      return { name: 'h1', status: 'error', detail: 'No H1 tag or empty H1' };
    }
    return { name: 'h1', status: 'pass', detail: `"${match[1].trim().slice(0, 50)}"` };
  }

  _addDuplicationChecks(results, contents) {
    const slugs = [...contents.keys()];
    const clusterGroups = new Map();

    // Group by cluster (rough: pages with similar slug prefixes)
    for (const slug of slugs) {
      const prefix = slug.split('-').slice(0, 3).join('-');
      if (!clusterGroups.has(prefix)) clusterGroups.set(prefix, []);
      clusterGroups.get(prefix).push(slug);
    }

    for (const [, group] of clusterGroups) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const sim = this._jaccardSimilarity(
            this._textToSet(contents.get(group[i]) || ''),
            this._textToSet(contents.get(group[j]) || '')
          );
          if (sim > this.maxDuplication) {
            const pageResult = results.find(r => r.slug === group[i]);
            if (pageResult) {
              pageResult.checks.push({
                name: 'duplication',
                status: 'warn',
                detail: `${(sim * 100).toFixed(0)}% similar to "${group[j]}" — may trigger duplicate content filter`
              });
              if (pageResult.status === 'pass') pageResult.status = 'warn';
            }
          }
        }
      }
    }
  }

  _addEnrichmentChecks(results, slugToHtml) {
    const siteType = this.config.site?.siteType || 'saas-landing';
    const contentProvider = this.config.contentProvider || 'template-only';

    // Only warn for template-only — LLM providers handle this at generation time
    if (contentProvider !== 'template-only') return;

    for (const pageResult of results) {
      if (pageResult.status === 'error') continue;

      const html = slugToHtml.get(pageResult.slug) || '';
      const hasEnrichmentData = html.includes('pseo-enriched') ||
        // Proxy: check if body content has numbers (salary, counts, etc.)
        (html.match(/\d{3,}/g) || []).length > 2;

      if (!hasEnrichmentData) {
        pageResult.checks.push({
          name: 'content_uniqueness',
          status: 'warn',
          detail: 'No page-specific data detected. Add enrichment data to keywords.md notes column to reduce thin content risk with Google.'
        });
        if (pageResult.status === 'pass') pageResult.status = 'warn';
      }
    }
  }

  _extractText(html) {
    return html.replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _extractKeywordFromTitle(html) {
    const match = html.match(/<title[^>]*>([^—<]+)/i);
    return match ? match[1].trim().toLowerCase() : null;
  }

  _textToSet(text) {
    return new Set(text.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  }

  _jaccardSimilarity(setA, setB) {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Print a summary of the ValidationReport to terminal.
   */
  static printSummary(report) {
    const { totals, totalPages } = report;
    console.log(`\n📊  Validation Report`);
    console.log(`  Total pages : ${totalPages}`);
    console.log(`  ✅ Pass     : ${totals.pass}`);
    console.log(`  ⚠️  Warn     : ${totals.warn}`);
    console.log(`  ❌ Fail     : ${totals.fail}`);
    console.log(`  🔴 Error    : ${totals.error}`);

    if (totals.error > 0 || totals.fail > 0) {
      console.log('\nIssues requiring attention:');
      report.pages
        .filter(p => p.status === 'error' || p.status === 'fail')
        .slice(0, 10)
        .forEach(p => {
          const issues = p.checks.filter(c => c.status === 'error' || c.status === 'fail');
          issues.forEach(c => console.log(`  /${p.slug}: [${c.status.toUpperCase()}] ${c.name} — ${c.detail}`));
        });
    }
    console.log('');
  }
}
