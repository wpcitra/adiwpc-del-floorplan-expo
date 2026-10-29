// Gemini API (Google) for the WhatsApp staff agent (AGENTS.md §45). Server only: the key is GEMINI_API_KEY (env file,
// write-only in Setting > Integrasi WhatsApp) and only travels in the x-goog-api-key header, never in logs, audit
// entries or responses. REST per Google's docs (generateContent with function calling, GET /v1beta/models).
// GEMINI_API_URL points the tests at a local mock; production uses https://generativelanguage.googleapis.com.
const apiBase = () => (process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');

// A fixed model, not an alias: "gemini-flash-latest" moves to Google's newest Flash on its own and once never answered
// (90 s, no reply) while gemini-3.5-flash answered the same request in 3 s. The admin can pick another model in Setting.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
// Popular models get "high demand" (503) spikes: a turn that fails on the chosen model is tried once more on this light,
// stable model with its own free quota (or on the default when this one is the chosen model)
export const FALLBACK_GEMINI_MODEL = 'gemini-3.1-flash-lite';
// How long one call may take; a model that does not answer must not keep the staff member waiting (tests set it short)
const TIMEOUT_MS = () => Number(process.env.GEMINI_TIMEOUT_MS) || 20000;
export const getGeminiKey = () => String(process.env.GEMINI_API_KEY || '').trim();
// No spaces, quotes or line breaks (it is written to the env file). Older keys look like "AIza…"; the "auth keys" AI
// Studio creates since 28 May 2026 contain dots ("AQ.…"), so dots are allowed.
export const isValidGeminiKeyFormat = (key) => /^[A-Za-z0-9._-]{20,300}$/.test(String(key || ''));
export const isValidModelId = (id) => /^[a-z0-9][a-z0-9.-]{1,79}$/i.test(String(id || ''));

// Gemini errors in plain Indonesian. Google's own sentence is appended where it helps the admin fix the key (it never
// contains the key itself).
function describeFailure(status, body) {
  const err = body?.error || {};
  const text = `${err.status || ''} ${err.message || ''} ${JSON.stringify(err.details || '')}`;
  const google = err.message ? ` (Google: ${String(err.message).slice(0, 200)})` : '';
  if (status === 401 || /API_KEY_INVALID|API key not valid/i.test(text)) return { code: 'INVALID_KEY', message: 'API key Gemini ditolak Google (tidak valid atau sudah dicabut).' };
  // Google refuses standard keys without restrictions with 403
  if (status === 403) return { code: 'FORBIDDEN', message: `API key ditolak Google: belum dibatasi atau tanpa izin. Di Google AI Studio buka API Keys, arahkan ke label "Unrestricted", klik Add restrictions > Restrict to Gemini API only, lalu simpan key-nya lagi di sini. Atau buat key baru di AI Studio.${google}` };
  if (status === 429) return { code: 'QUOTA', message: 'Kuota Gemini sedang habis (batas paket gratis / per menit). Coba lagi beberapa saat lagi.' };
  if (status === 404) return { code: 'MODEL', message: 'Model Gemini tidak ditemukan. Pilih model lain di Setting > Integrasi WhatsApp.' };
  if (status >= 500) return { code: 'UNAVAILABLE', message: `Layanan Gemini sedang gangguan. Coba lagi nanti, atau pilih model lain di Setting > Integrasi WhatsApp.${google}` };
  return { code: 'API_ERROR', message: `Gemini menolak permintaan (HTTP ${status}).${google}` };
}

async function call(path, { key, body, timeout }) {
  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout)
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') return { ok: false, code: 'TIMEOUT', message: `Model Gemini tidak menjawab dalam ${Math.round(timeout / 1000)} detik. Coba lagi, atau pilih model lain di Setting > Integrasi WhatsApp.` };
    return { ok: false, code: 'NETWORK', message: 'Server tidak dapat menghubungi Gemini (periksa koneksi internet).' };
  }
  let json = null;
  try { json = await res.json(); } catch (e) { /* empty body */ }
  return res.ok ? { ok: true, body: json } : { ok: false, status: res.status, ...describeFailure(res.status, json) };
}

// GET /v1beta/models: checks the key and lists the models it can use for generateContent
export async function listGeminiModels(key = getGeminiKey()) {
  if (!key) return { ok: false, code: 'NO_KEY', message: 'API key Gemini belum diisi.' };
  const r = await call('/v1beta/models?pageSize=1000', { key, timeout: 15000 });
  if (!r.ok) return r;
  const models = (r.body?.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => ({ id: String(m.name || '').replace(/^models\//, ''), name: String(m.displayName || m.name || '') }));
  return { ok: true, models };
}

/** POST generateContent with function declarations. Returns { ok, body } or { ok: false, code, message }. */
export function generateContent({ model, system, tools, contents, key = getGeminiKey() }) {
  if (!key) return Promise.resolve({ ok: false, code: 'NO_KEY', message: 'API key Gemini belum diisi.' });
  return call(`/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    key,
    timeout: TIMEOUT_MS(),
    body: { systemInstruction: { parts: [{ text: system }] }, contents, ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}) }
  });
}
