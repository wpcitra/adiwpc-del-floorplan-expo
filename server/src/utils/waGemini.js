import { generateContent, getGeminiKey, DEFAULT_GEMINI_MODEL } from './geminiApi.js';
import { waMeta } from './whatsapp.js';

// Conversation with Gemini for the WhatsApp staff assistant (AGENTS.md §45). It knows nothing about booths: the caller
// passes the tool declarations and their handlers. A handler returns { result } (data back to Gemini), { error } (also
// back, Gemini then asks the staff member) or { final } (the system's own text ends the turn, e.g. a booking summary
// that waits for YA: Gemini never words a confirmation and never saves anything).
const MAX_STEPS = 5;
const KEEP_MESSAGES = 12;
const IDLE_MS = 30 * 60 * 1000;
const memory = new Map(); // user id -> { contents: text turns only, at }

// Model and on / off live in maintenance_settings.wa_meta.gemini; the key in the env file
export const geminiConfig = () => {
  const g = waMeta().gemini || {};
  return { model: g.model || DEFAULT_GEMINI_MODEL, enabled: g.enabled !== false };
};
export const geminiReady = () => Boolean(getGeminiKey()) && geminiConfig().enabled;

// WhatsApp marks bold with one star and has no headings
const forWhatsApp = (text) => text.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#{1,6}\s+/gm, '').trim();

/** One staff message → { text } or { error }. `memoryKey` null = no conversation memory (the web test). */
export async function chatWithGemini({ memoryKey, text, system, tools, handlers }) {
  const past = memoryKey && memory.get(memoryKey);
  const history = past && Date.now() - past.at < IDLE_MS ? past.contents : [];
  const question = { role: 'user', parts: [{ text }] };
  const contents = [...history, question];
  const remember = (answer) => {
    if (memoryKey) memory.set(memoryKey, { contents: [...history, question, { role: 'model', parts: [{ text: answer }] }].slice(-KEEP_MESSAGES), at: Date.now() });
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await generateContent({ model: geminiConfig().model, system, tools, contents });
    if (!r.ok) return { error: r.message };
    const content = r.body?.candidates?.[0]?.content;
    const parts = content?.parts || [];
    if (!parts.length) return { error: r.body?.promptFeedback?.blockReason ? 'Pertanyaan ditolak filter keamanan Gemini.' : 'Gemini tidak memberi jawaban.' };
    contents.push(content); // exactly as received: Gemini 3 checks the thought signatures of this turn

    const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);
    if (!calls.length) {
      const answer = forWhatsApp(parts.filter(p => !p.thought).map(p => p.text || '').join(''));
      if (!answer) return { error: 'Gemini tidak memberi jawaban.' };
      remember(answer);
      return { text: answer };
    }
    const responses = [];
    for (const c of calls) {
      let out;
      try {
        out = handlers[c.name] ? await handlers[c.name](c.args || {}) : { error: `Alat ${c.name} tidak tersedia.` };
      } catch (e) {
        console.error('Alat agen Gemini gagal:', e);
        out = { error: 'Alat gagal dijalankan.' };
      }
      if (out.final) { remember(out.final); return { text: out.final }; }
      // one response per call, with the call's id and name (Gemini answers empty otherwise)
      responses.push({ functionResponse: { name: c.name, ...(c.id ? { id: c.id } : {}), response: out.error ? { error: out.error } : { result: out.result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return { error: 'Pertanyaannya butuh terlalu banyak langkah. Coba tanyakan lebih singkat.' };
}
