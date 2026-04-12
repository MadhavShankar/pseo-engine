import { TemplateOnlyProvider } from './content-providers/template-only.js';

export class ContentEngine {
  constructor(config = {}) {
    this.providerName = config.contentProvider || 'template-only';
    this.providerConfig = config.contentProviderConfig || {};
    this.maxConcurrent = this.providerConfig.maxConcurrent || 5;
    this.stats = { generated: 0, fallback: 0, errors: 0 };
    this.provider = null;
    this.fallbackProvider = new TemplateOnlyProvider();
  }

  async init() {
    this.provider = await this._createProvider(this.providerName);
    const health = await this.provider.healthCheck();
    if (!health.ok) {
      console.warn(`[content] Provider "${this.providerName}" unavailable: ${health.message}`);
      console.warn('[content] Falling back to template-only provider.');
      this.provider = this.fallbackProvider;
    }
    return this;
  }

  async _createProvider(name) {
    switch (name) {
      case 'claude': {
        const { ClaudeContentProvider } = await import('./content-providers/claude.js');
        return new ClaudeContentProvider(this.providerConfig);
      }
      case 'openai': {
        const { OpenAIContentProvider } = await import('./content-providers/openai.js');
        return new OpenAIContentProvider(this.providerConfig);
      }
      case 'local-llm': {
        const { LocalLLMProvider } = await import('./content-providers/local-llm.js');
        return new LocalLLMProvider(this.providerConfig);
      }
      case 'template-only':
      default:
        return new TemplateOnlyProvider();
    }
  }

  async generatePage(slots, context, rules) {
    try {
      const result = await this.provider.generatePage(slots, context, rules);
      this.stats.generated++;
      return result;
    } catch (err) {
      if (this.provider !== this.fallbackProvider) {
        console.warn(`[content] Provider error for "${context.urlSlug}", using fallback: ${err.message}`);
        try {
          const result = await this.fallbackProvider.generatePage(slots, context, rules);
          this.stats.fallback++;
          return result;
        } catch (fallbackErr) {
          this.stats.errors++;
          throw new Error(`Both providers failed for ${context.urlSlug}: ${fallbackErr.message}`);
        }
      }
      this.stats.errors++;
      throw err;
    }
  }

  async generatePages(pages) {
    const results = [];
    for (let i = 0; i < pages.length; i += this.maxConcurrent) {
      const batch = pages.slice(i, i + this.maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(({ slots, context, rules }) => this.generatePage(slots, context, rules))
      );
      results.push(...batchResults);
    }
    return results;
  }

  getStats() {
    return {
      ...this.stats,
      provider: this.providerName,
      ...(this.provider?.getTokenUsage ? { tokenUsage: this.provider.getTokenUsage() } : {})
    };
  }
}
