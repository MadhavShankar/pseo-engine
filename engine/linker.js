import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * InternalLinker — generates internal link HTML blocks for every page
 * based on the ClusterMap's edge graph.
 */
export class InternalLinker {
  constructor(config = {}) {
    this.maxLinksPerPage = config.internalLinking?.maxLinksPerPage || 8;
    this.baseUrl = config.site?.baseUrl || '';
    this.outputDir = config.outputDir || './output';
    this.pageIndex = new Map(); // slug -> page data
    this.linksHtml = new Map(); // slug -> rendered HTML
    this.audit = { totalLinks: 0, orphans: [], crossClusterLinks: 0 };
  }

  /**
   * Build link HTML for all pages from the ClusterMap.
   * Must be called after ClusterBuilder.build().
   */
  build(clusterMap) {
    // Index all pages by slug
    for (const cluster of clusterMap.clusters.values()) {
      for (const page of cluster.pages) {
        this.pageIndex.set(page.urlSlug, page);
      }
    }

    // Generate link HTML for each page
    for (const [slug, targets] of clusterMap.edges) {
      const page = this.pageIndex.get(slug);
      const validTargets = targets.filter(t => this.pageIndex.has(t) && t !== slug);

      if (validTargets.length === 0) {
        this.linksHtml.set(slug, '');
        continue;
      }

      const items = validTargets.slice(0, this.maxLinksPerPage).map(targetSlug => {
        const targetPage = this.pageIndex.get(targetSlug);
        const anchor = this._buildAnchorText(targetPage);
        const href = `/${targetSlug}`;
        this.audit.totalLinks++;
        return `    <li><a href="${href}">${this._escape(anchor)}</a></li>`;
      });

      const html = `<nav class="pseo-internal-links" aria-label="Related pages">
  <ul>
${items.join('\n')}
  </ul>
</nav>`;

      this.linksHtml.set(slug, html);
    }

    // Detect orphans
    const allSlugs = new Set(this.pageIndex.keys());
    const hasInbound = new Set();
    for (const targets of clusterMap.edges.values()) {
      for (const t of targets) hasInbound.add(t);
    }
    this.audit.orphans = [...allSlugs].filter(s => !hasInbound.has(s));

    return this;
  }

  /**
   * Get the rendered internal links HTML for a page slug.
   */
  getLinksHtml(slug) {
    return this.linksHtml.get(slug) || '';
  }

  /**
   * Write LinkAudit.json to output directory.
   */
  writeAudit() {
    mkdirSync(this.outputDir, { recursive: true });
    const report = {
      generatedAt: new Date().toISOString(),
      totalLinks: this.audit.totalLinks,
      totalPages: this.pageIndex.size,
      orphanPages: this.audit.orphans,
      orphanCount: this.audit.orphans.length,
      crossClusterLinks: this.audit.crossClusterLinks,
      averageLinksPerPage: this.pageIndex.size > 0
        ? Math.round(this.audit.totalLinks / this.pageIndex.size * 10) / 10
        : 0
    };
    writeFileSync(join(this.outputDir, 'LinkAudit.json'), JSON.stringify(report, null, 2));
    return report;
  }

  _buildAnchorText(page) {
    if (!page) return 'Related page';
    // Use keyword directly as anchor text — specific, keyword-rich, not generic
    const title = page.keyword || page.urlSlug.replace(/-/g, ' ');
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  _escape(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
