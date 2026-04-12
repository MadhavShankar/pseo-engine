import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { KeywordLibraryParser } from './keywords.js';

/**
 * DataIngestor — reads keyword data from any supported source type
 * and normalises to a standard KeywordRecord format.
 */
export class DataIngestor {
  constructor(config = {}) {
    this.config = config;
    this.skipped = [];
    this.stats = { total: 0, valid: 0, skipped: 0 };
  }

  /**
   * Load and normalise all keyword records.
   * @returns {Promise<{ clusters: object[], totalKeywords: number, stats: object }>}
   */
  async load() {
    const { type = 'keywords-md', path, apiEndpoint, columnMap } = this.config.dataSource || {};

    let raw;
    switch (type) {
      case 'keywords-md':
        return this._loadKeywordsMd(path || './data/keywords.md');
      case 'csv':
        raw = await this._loadCsv(path, columnMap);
        break;
      case 'json':
        raw = this._loadJson(path);
        break;
      case 'api':
        raw = await this._loadApi(this.config.dataSource);
        break;
      default:
        throw new Error(`Unknown data source type: "${type}". Valid types: keywords-md, csv, json, api`);
    }

    // For non-keywords-md sources, wrap records into a single cluster
    const normalised = this._normalise(raw);
    return {
      clusters: [{
        id: 'imported',
        name: 'Imported Keywords',
        hubUrl: '/hub',
        hubTitle: 'Hub',
        schema: 'Service',
        intent: 'transactional',
        priority: 'MEDIUM',
        keywords: normalised
      }],
      totalKeywords: normalised.length,
      stats: this.stats
    };
  }

  _loadKeywordsMd(path) {
    const parser = new KeywordLibraryParser();
    const library = parser.parse(path);
    this.stats.total = library.totalKeywords;
    this.stats.valid = library.totalKeywords;
    return library;
  }

  async _loadCsv(path, columnMap = {}) {
    if (!path || !existsSync(path)) {
      throw new Error(`CSV file not found: ${resolve(path || '')}`);
    }

    let parse;
    try {
      parse = (await import('csv-parse/sync')).parse;
    } catch {
      throw new Error('csv-parse not installed. Run: npm install csv-parse');
    }

    const raw = readFileSync(path, 'utf8');
    const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

    const keyCol = columnMap.keyword || 'keyword';
    const slugCol = columnMap.slug || 'slug';
    const mod1Col = columnMap.modifier1 || 'modifier1';
    const mod2Col = columnMap.modifier2 || 'modifier2';

    if (!records[0]?.[keyCol]) {
      throw new Error(`CSV column "${keyCol}" not found. Available columns: ${Object.keys(records[0] || {}).join(', ')}`);
    }

    return records.map(r => ({
      keyword: r[keyCol] || '',
      urlSlug: r[slugCol] || this._toSlug(r[keyCol] || ''),
      primaryModifier: r[mod1Col] || '',
      secondaryModifier: r[mod2Col] || '',
      priority: parseInt(r.priority) || 2,
      notes: r.notes || ''
    }));
  }

  _loadJson(path) {
    if (!path || !existsSync(path)) {
      throw new Error(`JSON file not found: ${resolve(path || '')}`);
    }
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(data)) {
      throw new Error(`JSON data source must be an array of keyword records.`);
    }
    return data;
  }

  async _loadApi({ apiEndpoint, apiMethod = 'GET', apiAuthEnvVar }) {
    const cacheFile = './output/.api-cache.json';
    const cacheTtl = 24 * 60 * 60 * 1000;

    if (existsSync(cacheFile)) {
      try {
        const { ts, data } = JSON.parse(readFileSync(cacheFile, 'utf8'));
        if (Date.now() - ts < cacheTtl) {
          console.log('[ingest] Using cached API response (< 24h old)');
          return data;
        }
      } catch {}
    }

    const headers = { 'Content-Type': 'application/json' };
    if (apiAuthEnvVar && process.env[apiAuthEnvVar]) {
      headers['Authorization'] = `Bearer ${process.env[apiAuthEnvVar]}`;
    }

    const res = await fetch(apiEndpoint, { method: apiMethod, headers });
    if (!res.ok) throw new Error(`API request failed: HTTP ${res.status} from ${apiEndpoint}`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('API must return a JSON array');

    mkdirSync('./output', { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ ts: Date.now(), data }));

    return data;
  }

  _normalise(records) {
    const seen = new Set();
    const normalised = [];

    for (const r of records) {
      if (!r.keyword) {
        this._skip(r, 'missing keyword');
        continue;
      }
      const slug = r.urlSlug || this._toSlug(r.keyword);
      if (seen.has(slug)) {
        this._skip(r, `duplicate slug: ${slug}`);
        continue;
      }
      seen.add(slug);

      normalised.push({
        keyword: r.keyword,
        urlSlug: slug,
        primaryModifier: r.primaryModifier || r.modifier1 || '',
        secondaryModifier: r.secondaryModifier || r.modifier2 || '',
        priority: parseInt(r.priority) || 2,
        notes: r.notes || '',
        metadata: r
      });

      this.stats.valid++;
    }

    this.stats.total = records.length;
    this.stats.skipped = this.skipped.length;
    return normalised;
  }

  _skip(record, reason) {
    this.skipped.push({ record, reason });
    this.stats.skipped++;
  }

  _toSlug(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  getSkipped() {
    return this.skipped;
  }
}
