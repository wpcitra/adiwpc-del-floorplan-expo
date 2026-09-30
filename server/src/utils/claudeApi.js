// Claude API access for the Pusat Maintenance (AGENTS.md §23). Server only: the key comes from process.env
// (server/.env) and is never returned to the browser, written to logs, audit entries or error reports.
// Endpoint & headers per Anthropic docs: x-api-key + anthropic-version: 2023-06-01.
// ANTHROPIC_API_URL can point tests at a local mock; production uses https://api.anthropic.com.

export const ANTHROPIC_VERSION = '2023-06-01';
const apiBase = () => (process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com').replace(/\/+$/, '');

export const getApiKey = () => String(process.env.ANTHROPIC_API_KEY || '').trim();

// Format check before anything is stored: Anthropic keys start with "sk-ant-" and contain no spaces / quotes
export const isValidKeyFormat = (key) => /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(String(key || ''));

// "…a1b2": enough to recognise which key is stored, never the key itself
export const keyHint = (key) => (key ? `…${key.slice(-4)}` : '');

// Errors of the Claude API in plain Indonesian (401 invalid key, 429 rate limit, credit balance, outages)
function describeFailure(status, body) {
  const text = String(body?.error?.message || '').toLowerCase();
  if (status === 401) return { code: 'INVALID_KEY', message: 'API key ditolak oleh Anthropic (tidak valid atau sudah dicabut).' };
  if (status === 403) return { code: 'FORBIDDEN', message: 'API key tidak memiliki izin untuk layanan ini.' };
  if (status === 429) return { code: 'RATE_LIMIT', message: 'Batas permintaan Claude API tercapai. Coba lagi beberapa saat lagi.' };
  if (/credit|balance|billing/.test(text)) return { code: 'NO_CREDIT', message: 'Saldo / kredit Claude API habis. Isi ulang di console.anthropic.com.' };
  if (status >= 500) return { code: 'UNAVAILABLE', message: 'Layanan Claude API sedang gangguan. Coba lagi nanti.' };
  return { code: 'API_ERROR', message: `Claude API menolak permintaan (HTTP ${status}).` };
}

// GET /v1/models: checks the key and returns the models available to it
export async function listModels(key = getApiKey()) {
  if (!key) return { ok: false, code: 'NO_KEY', message: 'API key Claude belum diisi.' };
  let res;
  try {
    res = await fetch(`${apiBase()}/v1/models?limit=100`, {
      headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: 'Server tidak dapat menghubungi api.anthropic.com (periksa koneksi internet).' };
  }
  let body = null;
  try { body = await res.json(); } catch (e) {}
  if (!res.ok) return { ok: false, status: res.status, ...describeFailure(res.status, body) };
  const models = (body?.data || []).map(m => ({ id: String(m.id), name: String(m.display_name || m.id) }));
  return { ok: true, models };
}
