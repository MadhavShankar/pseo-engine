import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const KEYWORDS_PATH = './data/keywords.md';

// ─── Parser ──────────────────────────────────────────────────────────────────

export class KeywordLibraryParser {
  parse(filePath = KEYWORDS_PATH) {
    if (!existsSync(filePath)) {
      throw new Error(`keywords.md not found at ${resolve(filePath)}. Run "npx pseo-engine keywords" to generate it.`);
    }

    const raw = readFileSync(filePath, 'utf8');
    const meta = this._parseMeta(raw);
    const clusters = this._parseClusters(raw);
    const allSlugs = clusters.flatMap(c => c.keywords.map(k => k.urlSlug));
    this._validateSlugs(allSlugs);

    const currentHash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
    if (meta.lastBuildHash && meta.lastBuildHash !== currentHash) {
      console.warn('[keywords] keywords.md has been manually edited since last build. This is expected — proceeding.');
    }

    return { meta, clusters, totalKeywords: allSlugs.length };
  }

  _parseMeta(raw) {
    const meta = {};
    const commentBlock = raw.match(/<!--([\s\S]*?)-->/);
    if (!commentBlock) return meta;

    const lines = commentBlock[1].split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z]+):\s*(.+)$/);
      if (match) meta[match[1].trim()] = match[2].trim();
    }
    return meta;
  }

  _parseClusters(raw) {
    const clusters = [];
    const clusterPattern = /##\s+\[Cluster ID:\s*([^\]]+)\]\s*(.+)\n([\s\S]*?)(?=\n##\s+\[Cluster ID:|$)/g;

    let match;
    while ((match = clusterPattern.exec(raw)) !== null) {
      const [, id, name, body] = match;
      const cluster = {
        id: id.trim(),
        name: name.trim(),
        hubUrl: this._extractField(body, 'Hub URL'),
        hubTitle: this._extractField(body, 'Hub Page Title'),
        schema: this._extractField(body, 'Schema') || 'Service',
        intent: this._extractField(body, 'Intent') || 'transactional',
        priority: this._extractField(body, 'Priority') || 'MEDIUM',
        keywords: this._parseTable(body)
      };
      clusters.push(cluster);
    }

    return clusters;
  }

  _extractField(body, fieldName) {
    const match = body.match(new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`));
    return match ? match[1].trim() : null;
  }

  _parseTable(body) {
    const rows = body.split('\n').filter(l => l.trim().startsWith('|'));
    if (rows.length < 2) return [];

    const dataRows = rows.slice(2); // skip header and separator
    return dataRows
      .map(row => {
        const cells = row.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
        if (cells.length < 2 || !cells[0]) return null;
        return {
          keyword: cells[0] || '',
          urlSlug: cells[1] || this._toSlug(cells[0]),
          primaryModifier: cells[2] || '',
          secondaryModifier: cells[3] || '',
          priority: parseInt(cells[4]) || 2,
          notes: cells[5] || ''
        };
      })
      .filter(Boolean);
  }

  _validateSlugs(slugs) {
    const seen = new Set();
    for (const slug of slugs) {
      if (/[A-Z\s\/\\]/.test(slug)) {
        throw new Error(`Invalid URL slug: "${slug}" — slugs must be lowercase with hyphens only.`);
      }
      if (seen.has(slug)) {
        throw new Error(`Duplicate URL slug detected: "${slug}" — each page must have a unique slug.`);
      }
      seen.add(slug);
    }
  }

  _toSlug(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}

// ─── Keyword Wizard ──────────────────────────────────────────────────────────

export class KeywordWizard {
  /**
   * Run the interactive wizard and write keywords.md.
   * Requires inquirer to be available.
   */
  async run() {
    let inquirer;
    try {
      inquirer = (await import('inquirer')).default;
    } catch {
      throw new Error('inquirer package not found. Run: npm install inquirer');
    }

    console.log('\n🔑  pseo-engine Keyword Wizard\n');
    console.log('This wizard generates your keywords.md — the source of truth for all pages.\n');

    // Step 1: Site context
    const siteAnswers = await inquirer.prompt([
      { type: 'input', name: 'siteName', message: 'What is your site or product name?', validate: v => !!v || 'Required' },
      { type: 'input', name: 'siteDescription', message: 'Describe your site in one sentence:', validate: v => !!v || 'Required' },
      { type: 'input', name: 'targetRegion', message: 'Primary country or region you are targeting:', default: 'India' }
    ]);

    // Step 2: Seed keywords
    const { seedInput } = await inquirer.prompt([{
      type: 'input',
      name: 'seedInput',
      message: 'Enter 3-10 seed keywords (comma-separated):',
      validate: v => v.split(',').map(s => s.trim()).filter(Boolean).length >= 1 || 'Enter at least one keyword'
    }]);
    const seeds = seedInput.split(',').map(s => s.trim()).filter(Boolean);

    // Step 3: Dimensions
    const { selectedDimensions } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedDimensions',
      message: 'Which dimensions should your keywords be combined with?',
      choices: [
        { name: 'Location / City / Region', value: 'location' },
        { name: 'Job Role / Profession', value: 'role' },
        { name: 'Product Category', value: 'category' },
        { name: 'Price Range', value: 'price' },
        { name: 'Platform / Technology', value: 'platform' },
        { name: 'Persona / Audience Segment', value: 'persona' },
        { name: 'Feature / Use Case', value: 'feature' },
        { name: 'Seniority Level', value: 'seniority' },
        { name: 'Industry / Vertical', value: 'industry' },
        { name: 'Custom (define your own)', value: 'custom' }
      ],
      validate: v => v.length > 0 || 'Select at least one dimension'
    }]);

    // Step 4: Dimension values
    const dimensionValues = {};
    for (const dim of selectedDimensions) {
      const { values } = await inquirer.prompt([{
        type: 'input',
        name: 'values',
        message: `Enter values for "${dim}" dimension (comma-separated):`,
        validate: v => v.split(',').filter(Boolean).length >= 1 || 'Enter at least one value'
      }]);
      dimensionValues[dim] = values.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Step 5: Intent
    const { intents } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'intents',
      message: 'Which search intents should this site target?',
      choices: [
        { name: 'Transactional (hire X, buy X, get X)', value: 'transactional', checked: true },
        { name: 'Commercial (best X, X pricing, X vs Y)', value: 'commercial', checked: true },
        { name: 'Informational (how to X, what is X)', value: 'informational' },
        { name: 'Navigational (X login, X alternatives)', value: 'navigational' }
      ]
    }]);

    // Step 6: Exclusions
    const { exclusions, minPriority } = await inquirer.prompt([
      { type: 'input', name: 'exclusions', message: 'Patterns to exclude (comma-separated, leave blank for none):' },
      { type: 'list', name: 'minPriority', message: 'Minimum priority to include:', choices: ['1 (highest only)', '2 (high + medium)', '3 (all)'], default: '2 (high + medium)' }
    ]);

    const minPriorityNum = parseInt(minPriority);
    const excludePatterns = exclusions ? exclusions.split(',').map(s => s.trim()).filter(Boolean) : [];

    // Build keyword library
    const clusters = this._buildClusters(seeds, dimensionValues, intents, siteAnswers.siteName, excludePatterns, minPriorityNum);

    // Write keywords.md
    const md = this._renderMarkdown(clusters, siteAnswers);
    writeFileSync(KEYWORDS_PATH, md, 'utf8');

    const totalKeywords = clusters.reduce((sum, c) => sum + c.keywords.length, 0);
    console.log(`\n✅  Keywords generated: ${totalKeywords} across ${clusters.length} clusters`);
    console.log(`📄  Written to: ${KEYWORDS_PATH}`);
    console.log('\nReview and edit keywords.md before running "npx pseo-engine build".\n');

    return { clusters, totalKeywords };
  }

  _buildClusters(seeds, dimensionValues, intents, siteName, excludePatterns, minPriority) {
    const clusters = [];
    const dims = Object.entries(dimensionValues);

    if (dims.length === 0) {
      // No dimensions — one cluster per seed
      const keywords = seeds.map((seed, i) => ({
        keyword: seed,
        urlSlug: this._toSlug(seed),
        primaryModifier: '',
        secondaryModifier: '',
        priority: 1,
        notes: ''
      }));
      clusters.push({
        id: 'seed-keywords',
        name: 'Seed Keywords',
        hubUrl: `/${this._toSlug(seeds[0])}`,
        hubTitle: `${seeds[0]} — ${siteName}`,
        schema: 'Service',
        intent: intents[0] || 'transactional',
        priority: 'HIGH',
        keywords
      });
      return clusters;
    }

    // Build one cluster per seed × dimension pair
    for (const seed of seeds) {
      if (dims.length >= 1) {
        const [dim1Name, dim1Values] = dims[0];
        const keywords = [];

        for (const val1 of dim1Values) {
          const keyword = `${seed} ${val1}`;
          if (this._shouldExclude(keyword, excludePatterns)) continue;
          const priority = this._scorePriority(seed, val1);
          if (priority > minPriority) continue;

          keywords.push({
            keyword,
            urlSlug: this._toSlug(`${seed}-${val1}`),
            primaryModifier: val1,
            secondaryModifier: dims[1] ? '' : '',
            priority,
            notes: ''
          });
        }

        if (keywords.length > 0) {
          const clusterId = `${this._toSlug(seed)}-${dim1Name}`;
          clusters.push({
            id: clusterId,
            name: `${this._titleCase(seed)} by ${this._titleCase(dim1Name)}`,
            hubUrl: `/${this._toSlug(seed)}`,
            hubTitle: `${this._titleCase(seed)} — ${siteName}`,
            schema: 'Service',
            intent: intents[0] || 'transactional',
            priority: 'HIGH',
            keywords
          });
        }
      }

      // Second dimension if present
      if (dims.length >= 2) {
        const [dim2Name, dim2Values] = dims[1];
        const keywords = [];

        for (const val2 of dim2Values) {
          const keyword = `${seed} for ${val2}`;
          if (this._shouldExclude(keyword, excludePatterns)) continue;
          const priority = this._scorePriority(seed, val2);
          if (priority > minPriority) continue;

          keywords.push({
            keyword,
            urlSlug: this._toSlug(`${seed}-for-${val2}`),
            primaryModifier: val2,
            secondaryModifier: '',
            priority,
            notes: ''
          });
        }

        if (keywords.length > 0) {
          const clusterId = `${this._toSlug(seed)}-${dim2Name}`;
          clusters.push({
            id: clusterId,
            name: `${this._titleCase(seed)} for ${this._titleCase(dim2Name)}`,
            hubUrl: `/${this._toSlug(seed)}-platform`,
            hubTitle: `${this._titleCase(seed)} Platform — ${siteName}`,
            schema: 'Service',
            intent: intents[1] || intents[0] || 'commercial',
            priority: 'MEDIUM',
            keywords
          });
        }
      }
    }

    return clusters;
  }

  _shouldExclude(keyword, patterns) {
    return patterns.some(p => keyword.toLowerCase().includes(p.toLowerCase()));
  }

  _scorePriority(seed, modifier) {
    // Simple heuristic: shorter, common modifiers = higher priority
    const highPriorityModifiers = ['bangalore', 'mumbai', 'delhi', 'startup', 'enterprise', 'india'];
    const isHigh = highPriorityModifiers.some(m => modifier.toLowerCase().includes(m));
    return isHigh ? 1 : modifier.length > 15 ? 3 : 2;
  }

  _renderMarkdown(clusters, siteAnswers) {
    const totalKeywords = clusters.reduce((sum, c) => sum + c.keywords.length, 0);
    const hash = createHash('sha256')
      .update(JSON.stringify(clusters))
      .digest('hex')
      .slice(0, 12);

    const lines = [
      `# Keyword Library`,
      `<!-- DO NOT EDIT THIS HEADER BLOCK -->`,
      `<!-- site: ${siteAnswers.siteName} -->`,
      `<!-- generated: ${new Date().toISOString()} -->`,
      `<!-- siteType: saas-landing -->`,
      `<!-- totalKeywords: ${totalKeywords} -->`,
      `<!-- totalClusters: ${clusters.length} -->`,
      `<!-- lastBuildHash: ${hash} -->`,
      ``,
      `---`,
      ``
    ];

    for (const cluster of clusters) {
      lines.push(`## [Cluster ID: ${cluster.id}] ${cluster.name}`);
      lines.push(`**Hub URL:** ${cluster.hubUrl}`);
      lines.push(`**Hub Page Title:** ${cluster.hubTitle}`);
      lines.push(`**Schema:** ${cluster.schema}`);
      lines.push(`**Intent:** ${cluster.intent}`);
      lines.push(`**Priority:** ${cluster.priority}`);
      lines.push(`**Page Count:** ${cluster.keywords.length}`);
      lines.push(``);
      lines.push(`| Keyword | URL Slug | Primary Modifier | Secondary Modifier | Priority | Notes |`);
      lines.push(`|---------|----------|-----------------|-------------------|----------|-------|`);

      for (const kw of cluster.keywords) {
        lines.push(`| ${kw.keyword} | ${kw.urlSlug} | ${kw.primaryModifier} | ${kw.secondaryModifier} | ${kw.priority} | ${kw.notes} |`);
      }

      lines.push(``, `---`, ``);
    }

    return lines.join('\n');
  }

  _toSlug(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  _titleCase(str) {
    return str.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}
