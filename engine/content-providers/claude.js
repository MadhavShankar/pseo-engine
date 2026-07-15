import { ContentProvider } from './provider.interface.js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { EnrichmentEngine } from '../enrichment.js';

const CACHE_DIR = './output/.content-cache';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 2000;
const RATE_LIMIT_RPS = 10;

export class ClaudeContentProvider extends ContentProvider {
  constructor(config = {}) {
    super();
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.maxRps = config.maxRps || RATE_LIMIT_RPS;
    this.cacheTtlMs = (config.cacheTtlHours || 168) * 60 * 60 * 1000;
    this._lastCallTime = 0;
    this._tokenUsage = { input: 0, output: 0, pages: 0 };
  }

  getMetadata() {
    return {
      name: 'claude',
      requiresApiKey: true,
      description: 'Anthropic Claude — high-quality, human-sounding content. Requires ANTHROPIC_API_KEY.'
    };
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { ok: false, message: 'ANTHROPIC_API_KEY environment variable is not set.' };
    }
    return { ok: true, message: 'Claude provider configured. API key present.' };
  }

  async generatePage(slots, context, rules) {
    const cacheKey = this._cacheKey(slots, context);
    const cached = this._readCache(cacheKey);
    if (cached) return cached;

    const systemPrompt = this._buildSystemPrompt(context, slots, rules);

    await this._rateLimit();

    let response;
    try {
      response = await this._callApi(systemPrompt);
    } catch (err) {
      throw new Error(`Claude API call failed: ${err.message}`);
    }

    let parsed;
    try {
      const clean = response.text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      // Retry once with correction
      try {
        await this._rateLimit();
        const retryPrompt = systemPrompt + `\n\nYour previous response was not valid JSON. Return ONLY a valid JSON object, nothing else.`;
        const retry = await this._callApi(retryPrompt);
        const clean = retry.text.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch (retryErr) {
        throw new Error(`Claude returned invalid JSON after retry: ${retryErr.message}`);
      }
    }

    this._writeCache(cacheKey, parsed);
    return parsed;
  }

  async generateSlot(slotName, context, rules) {
    const all = await this.generatePage([slotName], context, { [slotName]: rules });
    return all[slotName] || '';
  }

  _buildSystemPrompt(context, slots, rules) {
    const {
      siteDescription, siteType, brandVoice = 'professional and direct',
      primaryKeyword, urlSlug, targetPersona = 'your target audience',
      clusterIntent = 'transactional', siteName, pageData
    } = context;

    const slotsSpec = slots.map(s => {
      const r = rules[s] || {};
      const constraints = [];
      if (r.maxChars) constraints.push(`max ${r.maxChars} characters`);
      if (r.minChars) constraints.push(`min ${r.minChars} characters`);
      if (r.maxWords) constraints.push(`max ${r.maxWords} words`);
      if (r.minWords) constraints.push(`min ${r.minWords} words`);
      if (r.minItems) constraints.push(`min ${r.minItems} items`);
      if (r.mustContain === 'primaryKeyword') constraints.push(`must contain the primary keyword`);
      return `"${s}": ${constraints.length ? constraints.join(', ') : 'no specific constraints'}`;
    }).join('\n');

    // Format enrichment data — this is what makes each page genuinely unique
    const enrichmentBlock = EnrichmentEngine.formatForPrompt(pageData);

    return `You are a content writer for ${siteDescription || siteName}.
Generate SEO-optimised content for a landing page.

Site type: ${siteType}
Brand voice: ${brandVoice}
Primary keyword: "${primaryKeyword}"
Page URL: /${urlSlug}
Target persona: ${targetPersona}
Search intent: ${clusterIntent}
${enrichmentBlock ? `\n${enrichmentBlock}\n` : ''}
Generate content for the following slots. Return ONLY a valid JSON object with these exact keys and NO other text, preamble, or markdown:

${slotsSpec}

Slot-specific rules:
- meta_title: under 60 characters, include primary keyword, end with site name
- meta_description: 120-155 characters, include primary keyword, end with a call to action
- h1: 20-70 characters, natural language, include primary keyword
- hero_subtext: one specific sentence about this page's value — make it specific, not generic
- body_content: valid HTML (p, h2, ul tags — NOT markdown), 250-500 words, max 3% keyword density
- faq_block: HTML <dl> with <dt> questions and <dd> answers, 4 real user search queries
- cta_text: 4-8 words, action-oriented
${enrichmentBlock ? `
CRITICAL: The page-specific data above MUST be woven into the content naturally.
Do not list data as bullet points. Incorporate figures and facts into flowing prose.
This data is what makes this page different from every other page on the site.
Google suppresses pages that do not demonstrate unique, specific value.` : `
NOTE: No enrichment data provided. Add pipe-delimited data to the notes column
in keywords.md (e.g. avg_salary:25-40LPA|talent_pool:5000) to improve uniqueness.`}

Content rules:
- Every piece of content must be specific to the primary keyword and modifiers
- No generic filler phrases or AI-sounding language
- FAQ questions must be questions real users actually search for
- body_content must be valid HTML, not markdown
- Sound human-written and factually grounded`;
  }

  async _callApi(prompt) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }

    const data = await res.json();
    if (data.usage) {
      this._tokenUsage.input += data.usage.input_tokens || 0;
      this._tokenUsage.output += data.usage.output_tokens || 0;
      this._tokenUsage.pages += 1;
    }

    // Sonnet 5 runs adaptive thinking by default, so the first content block
    // may be a thinking block — find the text block instead of assuming index 0.
    const textBlock = (data.content || []).find(b => b.type === 'text');
    return { text: textBlock?.text || '' };
  }

  async _rateLimit() {
    const minGap = 1000 / this.maxRps;
    const now = Date.now();
    const wait = Math.max(0, this._lastCallTime + minGap - now);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this._lastCallTime = Date.now();
  }

  _cacheKey(slots, context) {
    const payload = JSON.stringify({ slots: slots.sort(), context });
    return createHash('sha256').update(payload).digest('hex');
  }

  _readCache(key) {
    const file = join(CACHE_DIR, `${key}.json`);
    if (!existsSync(file)) return null;
    try {
      const { ts, data } = JSON.parse(readFileSync(file, 'utf8'));
      if (Date.now() - ts > this.cacheTtlMs) return null;
      return data;
    } catch {
      return null;
    }
  }

  _writeCache(key, data) {
    try {
      if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // Cache write failure is non-fatal
    }
  }

  getTokenUsage() {
    return this._tokenUsage;
  }
}
