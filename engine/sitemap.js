import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * SitemapGenerator — produces XML sitemaps and robots.txt.
 */
export class SitemapGenerator {
  constructor(config = {}) {
    this.config = config;
    this.baseUrl = config.site?.baseUrl || 'https://example.com';
    this.outputDir = config.outputDir || './output';
    this.sitemapConfig = config.sitemapConfig || {};
    this.segmentByCluster = this.sitemapConfig.segmentByCluster !== false;
    this.maxUrls = this.sitemapConfig.maxUrlsPerSitemap || 10000;
    this.changefreq = this.sitemapConfig.changefreq || 'monthly';
  }

  /**
   * Generate all sitemaps from a ClusterMap.
   * @param {object} clusterMap
   * @param {Set} noindexSlugs - slugs that should be excluded
   */
  generate(clusterMap, noindexSlugs = new Set()) {
    mkdirSync(this.outputDir, { recursive: true });

    const sitemapFiles = [];

    if (this.segmentByCluster) {
      // One sitemap per cluster
      for (const [clusterId, cluster] of clusterMap.clusters) {
        const pages = cluster.pages.filter(p => !noindexSlugs.has(p.urlSlug));
        if (pages.length === 0) continue;

        const batches = this._splitIntoBatches(pages);
        batches.forEach((batch, i) => {
          const filename = batches.length > 1
            ? `sitemap-${clusterId}-${i + 1}.xml`
            : `sitemap-${clusterId}.xml`;

          const xml = this._renderSitemap(batch, cluster);
          writeFileSync(join(this.outputDir, filename), xml);
          sitemapFiles.push(filename);
        });
      }
    } else {
      // Single sitemap for all pages
      const allPages = [...clusterMap.clusters.values()]
        .flatMap(c => c.pages)
        .filter(p => !noindexSlugs.has(p.urlSlug));

      const batches = this._splitIntoBatches(allPages);
      batches.forEach((batch, i) => {
        const filename = batches.length > 1 ? `sitemap-${i + 1}.xml` : 'sitemap.xml';
        const xml = this._renderSitemap(batch);
        writeFileSync(join(this.outputDir, filename), xml);
        sitemapFiles.push(filename);
      });
    }

    // Write sitemap index
    const indexXml = this._renderSitemapIndex(sitemapFiles);
    writeFileSync(join(this.outputDir, 'sitemap-index.xml'), indexXml);

    // Write robots.txt
    const robotsTxt = this._renderRobotsTxt();
    writeFileSync(join(this.outputDir, 'robots.txt'), robotsTxt);

    return sitemapFiles;
  }

  _renderSitemap(pages, cluster = null) {
    const urls = pages.map(page => {
      const priority = this._getPriority(page, cluster);
      const loc = `${this.baseUrl}/${page.urlSlug}`;
      const lastmod = new Date().toISOString().split('T')[0];

      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${this.changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  }

  _renderSitemapIndex(filenames) {
    const sitemaps = filenames.map(file => {
      return `  <sitemap>
    <loc>${this.baseUrl}/${file}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps}
</sitemapindex>`;
  }

  _renderRobotsTxt() {
    return `User-agent: *
Allow: /

Sitemap: ${this.baseUrl}/sitemap-index.xml
`;
  }

  _getPriority(page, cluster) {
    if (page.isHub) return '0.9';
    switch (page.priority) {
      case 1: return '0.8';
      case 2: return '0.6';
      case 3: return '0.4';
      default: return '0.6';
    }
  }

  _splitIntoBatches(pages) {
    const batches = [];
    for (let i = 0; i < pages.length; i += this.maxUrls) {
      batches.push(pages.slice(i, i + this.maxUrls));
    }
    return batches.length > 0 ? batches : [[]];
  }
}
