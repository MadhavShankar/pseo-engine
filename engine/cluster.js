/**
 * ClusterBuilder — builds a directed ClusterMap graph from the keyword library.
 *
 * ClusterMap structure:
 * {
 *   clusters: Map<clusterId, ClusterNode>,
 *   edges: Map<urlSlug, string[]>  // slug -> array of slugs it links to
 * }
 */
export class ClusterBuilder {
  constructor(config = {}) {
    this.maxLinksPerPage = config.internalLinking?.maxLinksPerPage || 8;
  }

  /**
   * Build ClusterMap from a KeywordLibrary.
   * @param {{ clusters: object[], totalKeywords: number }} library
   * @returns {ClusterMap}
   */
  build(library) {
    const { clusters } = library;
    const clusterMap = {
      clusters: new Map(),
      edges: new Map(),
      hubPages: new Map()
    };

    // Register all clusters and their pages
    for (const cluster of clusters) {
      const clusterNode = {
        id: cluster.id,
        name: cluster.name,
        hubUrl: cluster.hubUrl,
        hubSlug: this._urlToSlug(cluster.hubUrl),
        hubTitle: cluster.hubTitle,
        schema: cluster.schema,
        intent: cluster.intent,
        priority: cluster.priority,
        pages: cluster.keywords.map(kw => ({
          ...kw,
          clusterId: cluster.id,
          clusterSchema: cluster.schema,
          clusterIntent: cluster.intent,
          isHub: false
        }))
      };

      // Add hub page as a page too
      const hubPage = {
        keyword: cluster.hubTitle || cluster.name,
        urlSlug: clusterNode.hubSlug,
        primaryModifier: '',
        secondaryModifier: '',
        priority: 1,
        notes: '',
        clusterId: cluster.id,
        clusterSchema: cluster.schema,
        clusterIntent: cluster.intent,
        isHub: true
      };

      clusterNode.pages.unshift(hubPage);
      clusterMap.clusters.set(cluster.id, clusterNode);
      clusterMap.hubPages.set(cluster.id, hubPage);
    }

    // Build edge graph (internal links)
    this._buildEdges(clusterMap);

    // Detect orphans and warn
    const orphans = this._detectOrphans(clusterMap);
    if (orphans.length > 0) {
      console.warn(`[cluster] ${orphans.length} orphan pages detected (zero inbound links): ${orphans.slice(0, 5).join(', ')}${orphans.length > 5 ? '...' : ''}`);
    }

    clusterMap.orphans = orphans;
    clusterMap.allPages = [...clusterMap.clusters.values()].flatMap(c => c.pages);

    return clusterMap;
  }

  _buildEdges(clusterMap) {
    for (const [clusterId, cluster] of clusterMap.clusters) {
      const hubSlug = cluster.hubSlug;
      const spokePages = cluster.pages.filter(p => !p.isHub);

      // Hub → all spokes
      clusterMap.edges.set(hubSlug, spokePages.map(p => p.urlSlug).slice(0, this.maxLinksPerPage));

      // Spoke → hub + related spokes
      for (const spoke of spokePages) {
        const related = this._findRelatedSpokes(spoke, spokePages, 4);
        const links = [hubSlug, ...related.map(r => r.urlSlug)].slice(0, this.maxLinksPerPage);
        clusterMap.edges.set(spoke.urlSlug, links);
      }
    }

    // Cross-cluster links: connect pages sharing a modifier value
    this._buildCrossClusterEdges(clusterMap);
  }

  _findRelatedSpokes(page, allSpokes, count) {
    const tokens = new Set(this._tokenise(page.keyword));
    return allSpokes
      .filter(s => s.urlSlug !== page.urlSlug)
      .map(s => ({ page: s, score: this._jaccardSimilarity(tokens, new Set(this._tokenise(s.keyword))) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(r => r.page);
  }

  _buildCrossClusterEdges(clusterMap) {
    const modifierIndex = new Map(); // modifier -> [pages across clusters]

    for (const cluster of clusterMap.clusters.values()) {
      for (const page of cluster.pages) {
        if (!page.primaryModifier) continue;
        const key = page.primaryModifier.toLowerCase();
        if (!modifierIndex.has(key)) modifierIndex.set(key, []);
        modifierIndex.get(key).push(page);
      }
    }

    for (const [modifier, pages] of modifierIndex) {
      if (pages.length < 2) continue;
      // Cross-link pages sharing this modifier (across different clusters)
      for (const page of pages) {
        const existing = clusterMap.edges.get(page.urlSlug) || [];
        const crossLinks = pages
          .filter(p => p.urlSlug !== page.urlSlug && p.clusterId !== page.clusterId)
          .map(p => p.urlSlug)
          .slice(0, 2);
        const merged = [...new Set([...existing, ...crossLinks])].slice(0, this.maxLinksPerPage);
        clusterMap.edges.set(page.urlSlug, merged);
      }
    }
  }

  _detectOrphans(clusterMap) {
    const allSlugs = new Set(clusterMap.allPages?.map(p => p.urlSlug) ||
      [...clusterMap.clusters.values()].flatMap(c => c.pages.map(p => p.urlSlug)));
    const hasInbound = new Set();

    for (const targets of clusterMap.edges.values()) {
      for (const t of targets) hasInbound.add(t);
    }

    return [...allSlugs].filter(slug => !hasInbound.has(slug));
  }

  _tokenise(str) {
    return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  }

  _jaccardSimilarity(setA, setB) {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  _urlToSlug(url) {
    return url.replace(/^\//, '').replace(/\//g, '-') || 'hub';
  }
}
