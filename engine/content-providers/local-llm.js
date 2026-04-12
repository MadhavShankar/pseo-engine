import { ContentProvider } from './provider.interface.js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = './output/.content-cache';
const SLOW_THRESHOLD_MS = 30000;

export class LocalLLMProvider extends ContentProvider {
  constructor(config = {}) {
    super();
    this.host = process.env.OLLAMA_HOST || config.ollamaHost || 'http://localhost:11434';
    this.model = config.ollamaModel || 'llama3.1';
    this.cacheTtlMs = (config.cacheTtlHours || 168) * 60 * 60 * 1000;
    this._tokenUsage = { pages: 0, slowPages: 0 };
  }

  getMetadata() {
    return { name: 'local-llm', requiresApiKey: false, description: `Ollama local LLM (${this.model}). Free and private. Requires Ollama running at ${this.host}.` };
  }

  async healthCheck() {
    try {
      const res = await fetch(`${this.host}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { ok: false, message: `Ollama returned HTTP ${res.status}` };
      const data = await res.json();
      const models = data.models?.map(m => m.name) || [];
      const hasModel = models.some(m => m.startsWith(this.model));
      if (!hasModel) {
        return { ok: false, message: `Model "${this.model}" not found. Available: ${models.join(', ')}. Run: ollama pull ${this.model}` };
      }
      return { ok: true, message: `Ollama running at ${this.host} with model "${this.model}"` };
    } catch (err) {
      return { ok: false, message: `Cannot reach Ollama at ${this.host}: ${err.message}. Is it running?` };
    }
  }

  async generatePage(slots, context, rules) {
    const cacheKey = this._cacheKey(slots, context);
    const cached = this._readCache(cacheKey);
    if (cached) return cached;

    const prompt = this._buildPrompt(context, slots, rules);
    const start = Date.now();

    let responseText;
    try {
      responseText = await this._callOllama(prompt);
    } catch (err) {
      throw new Error(`Ollama request failed: ${err.message}`);
    }

    const elapsed = Date.now() - start;
    this._tokenUsage.pages++;
    if (elapsed > SLOW_THRESHOLD_MS) {
      this._tokenUsage.slowPages++;
      console.warn(`[local-llm] Slow response for "${context.urlSlug}": ${(elapsed / 1000).toFixed(1)}s. Consider using a smaller model.`);
    }

    let parsed;
    try {
      const clean = responseText.replace(/```json|```/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : clean);
    } catch {
      // Last resort: build a minimal response from template-only
      console.warn(`[local-llm] Could not parse JSON response for "${context.urlSlug}". Using template fallback.`);
      const { TemplateOnlyProvider } = await import('./template-only.js');
      const fallback = new TemplateOnlyProvider();
      return fallback.generatePage(slots, context, rules);
    }

    this._writeCache(cacheKey, parsed);
    return parsed;
  }

  async generateSlot(slotName, context, rules) {
    const all = await this.generatePage([slotName], context, { [slotName]: rules });
    return all[slotName] || '';
  }

  _buildPrompt(context, slots, rules) {
    const { primaryKeyword, urlSlug, siteType, brandVoice, clusterIntent, siteName, siteDescription } = context;

    const slotsSpec = slots.map(s => {
      const r = rules[s] || {};
      const c = [r.maxChars && `max ${r.maxChars} chars`, r.minWords && `min ${r.minWords} words`, r.minItems && `min ${r.minItems} items`].filter(Boolean).join(', ');
      return `  "${s}": ${c || 'no specific constraints'}`;
    }).join('\n');

    return `You are a content writer for ${siteDescription || siteName}.
Site type: ${siteType}. Brand voice: ${brandVoice || 'professional and direct'}.

Generate SEO content for a landing page targeting the keyword: "${primaryKeyword}"
Page URL: /${urlSlug}
Search intent: ${clusterIntent || 'transactional'}

Return ONLY a valid JSON object (no markdown, no explanation) with these keys:
{
${slotsSpec}
}

Rules:
- Content must be specific to the keyword. No generic filler.
- body_content must be valid HTML (p, h2, ul tags). Not markdown.
- faq_block must be HTML using <dl><dt>question</dt><dd>answer</dd></dl>
- meta_title must be under 60 characters
- meta_description must be 120-155 characters
- Sound human-written

Respond with ONLY the JSON object, starting with { and ending with }`;
  }

  async _callOllama(prompt) {
    const res = await fetch(`${this.host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: { temperature: 0.3, top_p: 0.9 }
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.response || '';
  }

  _cacheKey(slots, context) {
    return `llm-${this.model.replace(/[^a-z0-9]/gi, '')}-` + createHash('sha256').update(JSON.stringify({ slots: slots.sort(), context })).digest('hex');
  }

  _readCache(key) {
    const file = join(CACHE_DIR, `${key}.json`);
    if (!existsSync(file)) return null;
    try {
      const { ts, data } = JSON.parse(readFileSync(file, 'utf8'));
      return Date.now() - ts > this.cacheTtlMs ? null : data;
    } catch { return null; }
  }

  _writeCache(key, data) {
    try {
      if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }

  getTokenUsage() { return this._tokenUsage; }
}
