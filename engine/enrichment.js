import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * EnrichmentEngine
 *
 * Responsible for loading and merging page-specific data that makes each
 * generated page genuinely unique and useful. This is the primary defence
 * against Google's thin/duplicate content classifiers.
 *
 * Data comes from two sources, merged in order (page-level overrides cluster-level):
 *
 * 1. NOTES COLUMN in keywords.md — pipe-delimited key:value pairs per keyword row:
 *    avg_salary:28-42LPA | talent_pool:4800 | top_cos:Flipkart,Swiggy | demand:high
 *
 * 2. ENRICHMENT FILE — a CSV or JSON file keyed by modifier values (city, role, etc.)
 *    configured via enrichmentSource in pseo.config.json
 *
 * The merged result is a `pageData` object available in the content context,
 * used by both the LLM providers and the template-only provider.
 */
export class EnrichmentEngine {
  constructor(config = {}) {
    this.config = config;
    this.enrichmentSource = config.enrichmentSource || null;
    this._cache = new Map();
    this._externalData = null;
  }

  /**
   * Initialise — loads the external enrichment file if configured.
   */
  async init() {
    if (this.enrichmentSource?.path) {
      this._externalData = await this._loadExternalSource(this.enrichmentSource);
    }
    return this;
  }

  /**
   * Build pageData for a single page.
   * Merges external enrichment data + notes column data.
   *
   * @param {object} page - KeywordRecord from ingest
   * @returns {object} pageData - structured data map for this page
   */
  buildPageData(page) {
    const cacheKey = page.urlSlug;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    // Start with any external data matching this page's modifiers
    const external = this._lookupExternal(page);

    // Parse the notes column (page-level, highest priority)
    const notesData = this._parseNotes(page.notes || '');

    // Merge: external base + notes override
    const pageData = { ...external, ...notesData };

    // Add computed fields
    pageData._hasEnrichment = Object.keys(pageData).length > 0;
    pageData._enrichmentScore = this._scoreEnrichment(pageData);

    this._cache.set(cacheKey, pageData);
    return pageData;
  }

  /**
   * Parse the notes column pipe-delimited key:value string.
   *
   * Format: key1:value1 | key2:value2 | key3:value3
   * Example: avg_salary:28-42LPA | talent_pool:4800 | top_cos:Flipkart,Swiggy | demand:high
   *
   * Values can contain commas (treated as lists), but not pipes.
   */
  _parseNotes(notes) {
    if (!notes || !notes.trim()) return {};

    const result = {};
    const pairs = notes.split('|').map(s => s.trim()).filter(Boolean);

    for (const pair of pairs) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;

      const key = pair.slice(0, colonIdx).trim().replace(/\s+/g, '_').toLowerCase();
      const rawValue = pair.slice(colonIdx + 1).trim();

      // If value contains commas, treat as array
      if (rawValue.includes(',')) {
        result[key] = rawValue.split(',').map(v => v.trim()).filter(Boolean);
      } else {
        result[key] = rawValue;
      }
    }

    return result;
  }

  /**
   * Look up external enrichment data for a page's modifiers.
   * Tries to match on primaryModifier, secondaryModifier, or both combined.
   */
  _lookupExternal(page) {
    if (!this._externalData) return {};

    const { primaryModifier = '', secondaryModifier = '' } = page;
    const combined = `${primaryModifier}+${secondaryModifier}`.toLowerCase();
    const mod1 = primaryModifier.toLowerCase();
    const mod2 = secondaryModifier.toLowerCase();

    return (
      this._externalData[combined] ||
      this._externalData[`${mod1}+${mod2}`] ||
      this._externalData[mod1] ||
      this._externalData[mod2] ||
      {}
    );
  }

  /**
   * Load and index an external enrichment CSV or JSON file.
   * The file must have a 'key' column whose values match modifier names.
   *
   * CSV format: key, field1, field2, ...
   * JSON format: { "bangalore": { "avg_salary": "...", ... }, ... }
   */
  async _loadExternalSource(source) {
    const filePath = resolve(source.path);

    if (!existsSync(filePath)) {
      console.warn(`[enrichment] Enrichment file not found: ${filePath}. Continuing without external data.`);
      return null;
    }

    const ext = filePath.split('.').pop().toLowerCase();

    if (ext === 'json') {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      // Normalise keys to lowercase
      return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k.toLowerCase(), v])
      );
    }

    if (ext === 'csv') {
      let parse;
      try {
        parse = (await import('csv-parse/sync')).parse;
      } catch {
        console.warn('[enrichment] csv-parse not installed. Run: npm install csv-parse');
        return null;
      }

      const raw = readFileSync(filePath, 'utf8');
      const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

      const keyCol = source.keyColumn || 'key';
      const indexed = {};
      for (const row of records) {
        const key = (row[keyCol] || '').toLowerCase();
        if (!key) continue;
        const { [keyCol]: _, ...fields } = row;
        indexed[key] = fields;
      }
      return indexed;
    }

    console.warn(`[enrichment] Unsupported enrichment file format: .${ext}. Use .json or .csv`);
    return null;
  }

  /**
   * Score how much useful enrichment data a page has.
   * Used by the validator to warn about thin pages.
   * Score 0 = no data, 1-3 = minimal, 4+ = well-enriched
   */
  _scoreEnrichment(pageData) {
    const meaningfulFields = Object.keys(pageData).filter(k =>
      !k.startsWith('_') && pageData[k] && String(pageData[k]).length > 0
    );
    return meaningfulFields.length;
  }

  /**
   * Generate a human-readable summary of pageData for use in prompts.
   * Formats the data clearly so LLM providers can incorporate it naturally.
   */
  static formatForPrompt(pageData) {
    if (!pageData || !pageData._hasEnrichment) return '';

    const lines = [];
    const fieldLabels = {
      avg_salary: 'Average salary range',
      salary_range: 'Salary range',
      talent_pool: 'Talent pool size',
      talent_pool_size: 'Available candidates',
      top_cos: 'Top hiring companies',
      top_companies: 'Top hiring companies',
      demand: 'Market demand',
      demand_level: 'Demand level',
      growth_rate: 'YoY growth',
      top_skills: 'Most in-demand skills',
      in_demand_skills: 'Key skills required',
      median_experience: 'Typical experience level',
      remote_ratio: 'Remote work availability',
      avg_time_to_hire: 'Average time to hire',
      open_roles: 'Current open roles',
      notable_employers: 'Notable employers',
      market_notes: 'Market context',
      avg_rating: 'Average rating',
      review_count: 'Number of reviews',
      price_range: 'Price range',
      delivery_time: 'Typical delivery time',
      category_size: 'Category size',
      top_brands: 'Top brands',
      avg_views: 'Average monthly views',
      competition: 'Competition level',
      seasonality: 'Seasonal trends'
    };

    for (const [key, value] of Object.entries(pageData)) {
      if (key.startsWith('_')) continue;
      const label = fieldLabels[key] || key.replace(/_/g, ' ');
      const displayValue = Array.isArray(value) ? value.join(', ') : value;
      lines.push(`${label}: ${displayValue}`);
    }

    return lines.length > 0
      ? `Page-specific data (USE THIS to make the content specific and factual):\n${lines.join('\n')}`
      : '';
  }

  /**
   * Returns a warning if a page has insufficient enrichment for safe indexing.
   */
  static getEnrichmentWarning(pageData, siteType) {
    const score = pageData?._enrichmentScore || 0;
    const thresholds = {
      'saas-landing': 2,
      'local-business': 3,
      'ecom': 2,
      'blog': 1,
      'directory': 3,
      'news': 1,
      'app-download': 2,
      'portfolio': 1
    };
    const required = thresholds[siteType] || 2;

    if (score < required) {
      return `Low enrichment score (${score}/${required} fields). This page may generate near-duplicate content. Add data to the notes column in keywords.md or configure an enrichment file.`;
    }
    return null;
  }
}
