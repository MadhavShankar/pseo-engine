import { ContentProvider } from './provider.interface.js';
import { EnrichmentEngine } from '../enrichment.js';

/**
 * Template-Only Content Provider
 *
 * Generates page content using rule-based string construction.
 * No API keys required. Zero cost. Works fully offline.
 * This is the default provider and baseline for all other providers.
 */
export class TemplateOnlyProvider extends ContentProvider {
  constructor(modifiers = {}) {
    super();
    this.modifiers = modifiers;
  }

  getMetadata() {
    return {
      name: 'template-only',
      requiresApiKey: false,
      description: 'Rule-based content generation. No API keys. Zero cost. Fully offline.'
    };
  }

  async healthCheck() {
    return { ok: true, message: 'Template-only provider is always available.' };
  }

  async generatePage(slots, context, rules) {
    const result = {};
    for (const slot of slots) {
      result[slot] = this._generateSlotContent(slot, context, rules[slot] || {});
    }
    return result;
  }

  async generateSlot(slotName, context, rules) {
    return this._generateSlotContent(slotName, context, rules || {});
  }

  _generateSlotContent(slot, ctx, rules) {
    const {
      primaryKeyword = '',
      primaryModifier = '',
      secondaryModifier = '',
      siteName = '',
      clusterIntent = 'transactional',
      siteDescription = '',
      urlSlug = ''
    } = ctx;

    const kw = this._titleCase(primaryKeyword);
    const kwLower = primaryKeyword.toLowerCase();
    const mod1 = this._titleCase(primaryModifier);
    const mod2 = this._titleCase(secondaryModifier);

    switch (slot) {
      case 'meta_title': {
        const base = `${kw}${mod1 ? ' in ' + mod1 : ''} — ${siteName}`;
        return this._truncate(base, rules.maxChars || 60);
      }

      case 'meta_description': {
        const templates = [
          `${siteName} helps you ${kwLower}${mod1 ? ' in ' + mod1 : ''}. Fast, simple, and built for results. Get started free.`,
          `Looking to ${kwLower}? ${siteName} makes it easier${mod1 ? ' in ' + mod1 : ''}. Try it today.`,
          `${siteName}${mod1 ? ' — ' + mod1 + ' —' : ''} the faster way to ${kwLower}. No setup required.`
        ];
        const chosen = templates[Math.abs(this._hash(urlSlug)) % templates.length];
        return this._truncate(chosen, rules.maxChars || 155);
      }

      case 'h1': {
        if (mod1 && mod2) return `${kw} in ${mod1} — ${mod2}`;
        if (mod1) return `${kw} in ${mod1}`;
        return kw;
      }

      case 'hero_subtext': {
        const intros = [
          `${siteName} is built for ${kwLower}${mod1 ? ' in ' + mod1 : ''}. Get results without the usual overhead.`,
          `The faster way to ${kwLower}${mod1 ? ' in ' + mod1 : ''}. Trusted by teams who value their time.`,
          `${siteName} handles ${kwLower} so your team can focus on what matters.`
        ];
        return intros[Math.abs(this._hash(urlSlug + 'hero')) % intros.length];
      }

      case 'body_content': {
        return this._generateBodyContent(ctx, rules);
      }

      case 'faq_block': {
        return this._generateFaqBlock(ctx, rules);
      }

      case 'cta_text': {
        const ctas = [
          `Get Started Free`,
          `Try ${siteName} Free`,
          `Start Now`,
          `See It in Action`
        ];
        return ctas[Math.abs(this._hash(urlSlug + 'cta')) % ctas.length];
      }

      case 'social_proof_stat': {
        const stats = [
          `Trusted by teams worldwide`,
          `Thousands of users and counting`,
          `Built for speed and simplicity`
        ];
        return stats[Math.abs(this._hash(urlSlug + 'stat')) % stats.length];
      }

      case 'feature_highlight': {
        return `${siteName} is purpose-built for ${kwLower}${mod1 ? ' in ' + mod1 : ''} — designed to save time and deliver results.`;
      }

      default:
        return `${kw}${mod1 ? ' — ' + mod1 : ''}`;
    }
  }

  _generateBodyContent(ctx, rules) {
    const {
      primaryKeyword = '', primaryModifier = '',
      secondaryModifier = '', siteName = '', pageData = {}
    } = ctx;
    const kw = primaryKeyword.toLowerCase();
    const mod1 = primaryModifier;
    const mod2 = secondaryModifier;

    // If we have enrichment data, build a data-informed paragraph
    const dataBlock = this._buildDataParagraph(pageData, kw, mod1, siteName);

    const paragraphs = [
      `<p>If you are looking for ${kw}${mod1 ? ' in ' + mod1 : ''}, the options vary widely in quality and ease of use. ${siteName} is built specifically for this use case, designed to cut the time between starting and getting results.</p>`,

      dataBlock,

      `<p>${siteName} keeps things straightforward. You do not need to navigate complex setups or spend hours on configuration. The core workflow is designed so most users are productive within minutes of signing up.</p>`,

      `<h2>How It Works</h2>`,
      `<p>Getting started takes a few minutes. Sign up, complete a short setup, and the platform guides you from there. The interface stays out of your way so you can focus on the outcome, not the tool itself.</p>`,

      `<h2>Why Teams Choose ${siteName}${mod1 ? ' for ' + mod1 : ''}</h2>`,
      `<ul>
  <li>Quick setup with no steep learning curve</li>
  <li>Works alongside the tools you already use</li>
  <li>Scales as your needs grow</li>
  <li>Support available when you need it</li>
</ul>`
    ].filter(Boolean);

    return paragraphs.join('\n');
  }

  _buildDataParagraph(pageData, kw, mod1, siteName) {
    if (!pageData || !pageData._hasEnrichment) return null;

    const parts = [];

    // Salary / price data
    if (pageData.avg_salary || pageData.salary_range || pageData.price_range) {
      const val = pageData.avg_salary || pageData.salary_range || pageData.price_range;
      parts.push(`The typical range for ${kw}${mod1 ? ' in ' + mod1 : ''} is ${val}.`);
    }

    // Volume / size data
    if (pageData.talent_pool || pageData.talent_pool_size || pageData.open_roles || pageData.category_size) {
      const val = pageData.talent_pool || pageData.talent_pool_size || pageData.open_roles || pageData.category_size;
      parts.push(`There are currently around ${val} options available in this market.`);
    }

    // Top companies / brands
    if (pageData.top_cos || pageData.top_companies || pageData.notable_employers || pageData.top_brands) {
      const raw = pageData.top_cos || pageData.top_companies || pageData.notable_employers || pageData.top_brands;
      const list = Array.isArray(raw) ? raw.join(', ') : raw;
      parts.push(`Well-known names in this space include ${list}.`);
    }

    // Demand / growth
    if (pageData.demand || pageData.demand_level || pageData.growth_rate) {
      const val = pageData.demand || pageData.demand_level || pageData.growth_rate;
      parts.push(`Demand is currently ${val}.`);
    }

    // Skills
    if (pageData.top_skills || pageData.in_demand_skills) {
      const raw = pageData.top_skills || pageData.in_demand_skills;
      const list = Array.isArray(raw) ? raw.join(', ') : raw;
      parts.push(`Key skills in this area include ${list}.`);
    }

    // Any custom market notes
    if (pageData.market_notes) {
      parts.push(pageData.market_notes);
    }

    if (parts.length === 0) return null;
    return `<p>${parts.join(' ')}</p>`;
  }

  _generateFaqBlock(ctx, rules) {
    const { primaryKeyword = '', primaryModifier = '', siteName = '' } = ctx;
    const kw = primaryKeyword.toLowerCase();
    const mod1 = primaryModifier || 'your area';
    const count = rules.minItems || 4;

    const allFaqs = [
      {
        q: `How does ${siteName} help with ${kw}?`,
        a: `${siteName} is built specifically for ${kw}. It handles the heavy lifting so you can focus on what matters — getting results faster than you would with a generic solution.`
      },
      {
        q: `How long does it take to get started with ${kw}${mod1 !== 'your area' ? ' in ' + mod1 : ''}?`,
        a: `Most users are up and running within minutes. The setup is straightforward and the platform walks you through each step.`
      },
      {
        q: `Do I need technical skills to use ${siteName} for ${kw}?`,
        a: `No. ${siteName} is designed to be used without any technical background. If you can use a web browser, you can use ${siteName}.`
      },
      {
        q: `Does ${siteName} integrate with my existing tools?`,
        a: `Yes. ${siteName} is built to sit alongside the tools you already use. You do not need to replace your existing workflow to benefit from it.`
      },
      {
        q: `Is ${siteName} suitable for ${kw} at scale?`,
        a: `Yes. Whether you are handling a small volume or running large-scale operations, ${siteName} is built to keep up. The performance stays consistent as your usage grows.`
      },
      {
        q: `What does ${siteName} cost?`,
        a: `${siteName} offers a free tier to get started. Paid plans are available for teams that need higher volume or additional features. See the pricing page for current options.`
      }
    ];

    const selected = allFaqs.slice(0, Math.min(count, allFaqs.length));
    const items = selected.map(({ q, a }) =>
      `  <dt>${q}</dt>\n  <dd>${a}</dd>`
    ).join('\n');

    return `<dl class="pseo-faq">\n${items}\n</dl>`;
  }

  _titleCase(str) {
    if (!str) return '';
    return str.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  _truncate(str, max) {
    if (str.length <= max) return str;
    return str.slice(0, max - 3).trimEnd() + '...';
  }

  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}

// ─── Ecom + Blog site type overrides ─────────────────────────────────────────
// These patch the base _generateSlotContent method to handle non-SaaS site types.

const _origGenerate = TemplateOnlyProvider.prototype._generateSlotContent;
TemplateOnlyProvider.prototype._generateSlotContent = function(slot, ctx, rules) {
  const { siteType = 'saas-landing' } = ctx;

  if (siteType === 'ecom') return this._generateEcomSlot(slot, ctx, rules);
  if (siteType === 'blog') return this._generateBlogSlot(slot, ctx, rules);
  return _origGenerate.call(this, slot, ctx, rules);
};

TemplateOnlyProvider.prototype._generateEcomSlot = function(slot, ctx, rules) {
  const { primaryKeyword = '', primaryModifier = '', secondaryModifier = '', siteName = '', urlSlug = '' } = ctx;
  const kw = this._titleCase(primaryKeyword);
  const kwLower = primaryKeyword.toLowerCase();
  const mod1 = this._titleCase(primaryModifier);

  switch (slot) {
    case 'meta_title':
      return this._truncate(`${kw} — Shop Online with Fast Delivery | ${siteName}`, rules.maxChars || 60);
    case 'meta_description':
      return this._truncate(`Buy ${kwLower} online at the best prices. Fast delivery across India. Free shipping on orders above ₹499. COD available. Shop now at ${siteName}.`, rules.maxChars || 155);
    case 'h1':
      return mod1 ? `${kw} in ${mod1}` : `Shop ${kw} Online`;
    case 'hero_subtext':
      return `Browse our selection of ${kwLower}${mod1 ? ' available for delivery in ' + mod1 : ''}. Competitive prices, genuine products, fast delivery.`;
    case 'body_content':
      return `<p>Looking for ${kwLower}${mod1 ? ' in ' + mod1 : ''}? ${siteName} offers a curated selection of genuine products with competitive pricing and fast delivery across India.</p>
<h2>Why shop ${kwLower} on ${siteName}?</h2>
<ul>
  <li>Genuine products from authorised sellers</li>
  <li>Free delivery on orders above ₹499</li>
  <li>Cash on delivery available</li>
  <li>Easy 7-day return policy</li>
  <li>Secure payment — UPI, credit card, net banking</li>
</ul>
<h2>How to choose the right ${secondaryModifier || 'product'}</h2>
<p>Before purchasing ${kwLower}, consider your use case, budget, and the warranty offered. Check verified buyer reviews to understand real-world performance before deciding.</p>`;
    case 'faq_block':
      return `<dl class="pseo-faq">
  <dt>Is free delivery available for ${kwLower}${mod1 ? ' in ' + mod1 : ''}?</dt>
  <dd>Yes. ${siteName} offers free delivery on orders above ₹499 to most pin codes${mod1 ? ' in ' + mod1 : ''} and across India.</dd>
  <dt>Can I return ${kwLower} if I'm not satisfied?</dt>
  <dd>Yes. We have a 7-day return policy for most products. The item must be in its original packaging and unused condition.</dd>
  <dt>Are the ${kwLower} on ${siteName} genuine?</dt>
  <dd>All products on ${siteName} are sourced from authorised sellers and come with manufacturer warranties where applicable.</dd>
  <dt>What payment methods are accepted?</dt>
  <dd>We accept UPI, credit and debit cards, net banking, and cash on delivery (COD) for eligible orders.</dd>
</dl>`;
    case 'cta_text': return `Shop ${kw} Now`;
    case 'social_proof_stat': return 'Free delivery on orders above ₹499';
    default: return `${kw}${mod1 ? ' — ' + mod1 : ''}`;
  }
};

TemplateOnlyProvider.prototype._generateBlogSlot = function(slot, ctx, rules) {
  const { primaryKeyword = '', primaryModifier = '', secondaryModifier = '', siteName = '', urlSlug = '' } = ctx;
  const kw = this._titleCase(primaryKeyword);
  const kwLower = primaryKeyword.toLowerCase();
  const isComparison = urlSlug.includes('-vs-');
  const mod1 = this._titleCase(primaryModifier);
  const mod2 = this._titleCase(secondaryModifier);

  switch (slot) {
    case 'meta_title':
      return this._truncate(isComparison ? `${mod1} vs ${mod2}: Which Should You Choose? (2025)` : `${kw}: Complete Guide for 2025`, rules.maxChars || 60);
    case 'meta_description':
      return this._truncate(isComparison
        ? `${mod1} vs ${mod2} — a detailed comparison covering features, pricing, and use cases. Find out which is right for your needs in 2025.`
        : `A complete guide to ${kwLower}. Learn step-by-step how to get started, best practices, and common mistakes to avoid.`,
        rules.maxChars || 155);
    case 'h1':
      return isComparison ? `${mod1} vs ${mod2}: The Complete Comparison (2025)` : `How to ${kw}: A Step-by-Step Guide`;
    case 'hero_subtext':
      return isComparison
        ? `We break down ${mod1} and ${mod2} across features, pricing, and real use cases so you can make the right choice for your situation.`
        : `Everything you need to know about ${kwLower} — from first steps to advanced techniques, with practical examples throughout.`;
    case 'body_content':
      if (isComparison) {
        return `<p>Choosing between ${mod1} and ${mod2} depends heavily on your specific use case, budget, and team size. This comparison covers the key differences so you can make an informed decision.</p>
<h2>${mod1} — Overview</h2>
<p>${mod1} is designed for teams that prioritise ${primaryModifier.toLowerCase()} capabilities. It offers a clean interface and integrates well with existing workflows. Pricing starts at a competitive tier for small teams.</p>
<h2>${mod2} — Overview</h2>
<p>${mod2} takes a different approach, focusing on ${secondaryModifier.toLowerCase()} features with a broader feature set. It suits teams that need more customisation at the cost of a steeper learning curve.</p>
<h2>Key differences</h2>
<ul>
  <li><strong>Ease of use:</strong> ${mod1} wins for simplicity; ${mod2} wins for power users</li>
  <li><strong>Pricing:</strong> Both offer free tiers — compare paid plans based on your team size</li>
  <li><strong>Integrations:</strong> Check your existing tool stack before committing</li>
  <li><strong>Support:</strong> ${mod2} has stronger enterprise support options</li>
</ul>
<h2>Which should you choose?</h2>
<p>Choose ${mod1} if you want a quick setup and a gentle learning curve. Choose ${mod2} if you need advanced customisation and your team is willing to invest time in onboarding.</p>`;
      }
      return `<p>${kw} is one of those skills that pays off across many areas of business. This guide walks through the entire process from zero, with concrete steps at each stage.</p>
<h2>Before you start: what you need</h2>
<p>You do not need specialist tools or a large budget to ${kwLower.replace('how to ', '')}. The basics are free, and most of what matters comes from consistent execution rather than expensive software.</p>
<h2>Step 1: Research and plan</h2>
<p>Start by understanding the landscape. Look at what is already working in your industry before creating anything. This saves you from spending time on approaches that have already been proven ineffective.</p>
<h2>Step 2: Build the foundation</h2>
<p>Set up the core components first. Skipping this step to get to the visible work faster is the most common reason people plateau early.</p>
<h2>Step 3: Execute consistently</h2>
<p>Consistency over a 90-day period matters more than the quality of any single effort. Build a repeatable process before you try to optimise.</p>
<h2>Common mistakes to avoid</h2>
<ul>
  <li>Trying to do everything at once — pick one approach and commit to it</li>
  <li>Measuring the wrong metrics in the first 30 days</li>
  <li>Copying tactics without understanding the strategy behind them</li>
</ul>`;
    case 'faq_block': {
      const faqs = isComparison ? [
        { q: `Is ${mod1} better than ${mod2}?`, a: `It depends on your needs. ${mod1} is better for simplicity and fast setup. ${mod2} is better for teams that need advanced features and customisation. Neither is universally better.` },
        { q: `Which is more affordable: ${mod1} or ${mod2}?`, a: `Both offer free tiers. For paid plans, compare based on the features you actually need at your team size — the cheapest plan is not always the most cost-effective.` },
        { q: `Can I switch from ${mod1} to ${mod2} later?`, a: `Yes, though migration takes effort depending on how much data you have in your current tool. Check whether your chosen tool has an import feature before committing.` },
        { q: `Do ${mod1} and ${mod2} integrate with each other?`, a: `Not natively, but both integrate with tools like Zapier and Make for custom workflows if you need data to flow between them.` }
      ] : [
        { q: `How long does it take to ${kwLower.replace('how to ', '')}?`, a: `The basics can be set up in a day. Seeing meaningful results typically takes 30–90 days of consistent effort, depending on your starting point.` },
        { q: `Do I need technical skills to ${kwLower.replace('how to ', '')}?`, a: `No. The core process outlined in this guide requires no technical background. Tools handle the complex parts automatically.` },
        { q: `What is the most common mistake when starting with ${kwLower.replace('how to ', '')}?`, a: `Trying to scale before validating. Most people skip the validation step and build something nobody engages with. Start small, prove it works, then scale.` },
        { q: `What are the best tools for ${kwLower.replace('how to ', '')}?`, a: `Start with free tools before paying for anything. Most paid tools add convenience, not capability. The free version is usually sufficient until you have a clear use case for the upgrade.` }
      ];
      return `<dl class="pseo-faq">\n${faqs.map(f => `  <dt>${f.q}</dt>\n  <dd>${f.a}</dd>`).join('\n')}\n</dl>`;
    }
    case 'author': return 'Editorial Team';
    case 'publish_date': return new Date().toISOString().split('T')[0];
    case 'reading_time': return '8 min read';
    case 'cta_text': return 'Get Weekly Guides';
    case 'social_proof_stat': return '50+ guides published';
    default: return `${kw}`;
  }
};
