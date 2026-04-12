import { ContentProvider } from './provider.interface.js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = './output/.content-cache';
const MODEL = 'gpt-4o';
const MAX_TOKENS = 2000;

export class OpenAIContentProvider extends ContentProvider {
  constructor(config = {}) {
    super();
    this.apiKey = process.env.OPENAI_API_KEY;
    this.maxRps = config.maxRps || 10;
    this.cacheTtlMs = (config.cacheTtlHours || 168) * 60 * 60 * 1000;
    this._lastCallTime = 0;
    this._tokenUsage = { input: 0, output: 0, pages: 0 };
  }

  getMetadata() {
    return { name: 'openai', requiresApiKey: true, description: 'OpenAI GPT-4o. Requires OPENAI_API_KEY.' };
  }

  async healthCheck() {
    if (!this.apiKey) return { ok: false, message: 'OPENAI_API_KEY not set.' };
    return { ok: true, message: 'OpenAI provider configured.' };
  }

  async generatePage(slots, context, rules) {
    const cacheKey = this._cacheKey(slots, context);
    const cached = this._readCache(cacheKey);
    if (cached) return cached;

    const messages = this._buildMessages(context, slots, rules);
    await this._rateLimit();

    let response;
    try { response = await this._callApi(messages); }
    catch (err) { throw new Error(`OpenAI API failed: ${err.message}`); }

    let parsed;
    try {
      parsed = JSON.parse(response.text.replace(/```json|```/g, '').trim());
    } catch {
      await this._rateLimit();
      const retry = await this._callApi([...messages,
        { role: 'assistant', content: response.text },
        { role: 'user', content: 'Invalid JSON. Return ONLY a valid JSON object, nothing else.' }
      ]);
      parsed = JSON.parse(retry.text.replace(/```json|```/g, '').trim());
    }

    this._writeCache(cacheKey, parsed);
    return parsed;
  }

  async generateSlot(slotName, context, rules) {
    const all = await this.generatePage([slotName], context, { [slotName]: rules });
    return all[slotName] || '';
  }

  _buildMessages(context, slots, rules) {
    const { siteDescription, siteType, brandVoice = 'professional', primaryKeyword, urlSlug, clusterIntent = 'transactional', siteName } = context;
    const slotsSpec = slots.map(s => {
      const r = rules[s] || {};
      const c = [r.maxChars && `max ${r.maxChars} chars`, r.minWords && `min ${r.minWords} words`, r.minItems && `min ${r.minItems} items`].filter(Boolean).join(', ');
      return `"${s}": ${c || 'no constraints'}`;
    }).join('\n');

    return [
      { role: 'system', content: `You write SEO content for ${siteDescription || siteName}. Site type: ${siteType}. Brand voice: ${brandVoice}. Respond ONLY with valid JSON, no other text.` },
      { role: 'user', content: `Keyword: "${primaryKeyword}"\nURL: /${urlSlug}\nIntent: ${clusterIntent}\n\nReturn JSON with:\n${slotsSpec}\n\nRules: specific content only, body_content as HTML, faq_block as <dl><dt>/<dd>, meta_title under 60 chars, human-written.` }
    ];
  }

  async _callApi(messages) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages, response_format: { type: 'json_object' } })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.usage) { this._tokenUsage.input += data.usage.prompt_tokens || 0; this._tokenUsage.output += data.usage.completion_tokens || 0; this._tokenUsage.pages++; }
    return { text: data.choices?.[0]?.message?.content || '' };
  }

  async _rateLimit() {
    const gap = 1000 / this.maxRps;
    const wait = Math.max(0, this._lastCallTime + gap - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this._lastCallTime = Date.now();
  }

  _cacheKey(slots, context) {
    return 'oai-' + createHash('sha256').update(JSON.stringify({ slots: slots.sort(), context })).digest('hex');
  }

  _readCache(key) {
    const file = join(CACHE_DIR, `${key}.json`);
    if (!existsSync(file)) return null;
    try { const { ts, data } = JSON.parse(readFileSync(file, 'utf8')); return Date.now() - ts > this.cacheTtlMs ? null : data; }
    catch { return null; }
  }

  _writeCache(key, data) {
    try { if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify({ ts: Date.now(), data })); } catch {}
  }

  getTokenUsage() { return this._tokenUsage; }
}
