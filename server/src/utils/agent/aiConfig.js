import db from '../../db.js';

// AI settings of the Pusat Maintenance (AGENTS.md §27): model (chosen from GET /v1/models), monthly budget and the
// prices used to estimate costs. Stored in maintenance_settings ('ai_config'); never contains the API key.

export const DEFAULT_BUDGET_USD = 10;
export const BUDGET_WARNING_RATIO = 0.8;

// USD per million tokens by model family. Estimates: the admin can override them in Setting > Integrasi AI.
const FAMILY_PRICES = [
  [/haiku/i, { input: 1, output: 5 }],
  [/opus/i, { input: 5, output: 25 }],
  [/sonnet/i, { input: 3, output: 15 }]
];
const FALLBACK_PRICE = { input: 3, output: 15 };

export function readAiConfig() {
  let cfg = {};
  try { cfg = JSON.parse(db.prepare("SELECT value FROM maintenance_settings WHERE key = 'ai_config'").get()?.value || '{}'); } catch (e) {}
  return {
    model: typeof cfg.model === 'string' ? cfg.model : '',
    monthlyBudgetUsd: Number.isFinite(Number(cfg.monthlyBudgetUsd)) && cfg.monthlyBudgetUsd !== null && cfg.monthlyBudgetUsd !== ''
      ? Number(cfg.monthlyBudgetUsd) : DEFAULT_BUDGET_USD,
    priceInputPerMTok: Number(cfg.priceInputPerMTok) > 0 ? Number(cfg.priceInputPerMTok) : null,
    priceOutputPerMTok: Number(cfg.priceOutputPerMTok) > 0 ? Number(cfg.priceOutputPerMTok) : null,
    updatedBy: cfg.updatedBy || '',
    updatedAt: cfg.updatedAt || null
  };
}

export function writeAiConfig(patch, userName) {
  const next = { ...readAiConfig(), ...patch, updatedBy: userName || '', updatedAt: new Date().toISOString() };
  db.prepare(`
    INSERT INTO maintenance_settings (key, value, updated_by, updated_at) VALUES ('ai_config', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
  `).run(JSON.stringify(next), userName || '');
  return readAiConfig();
}

export function priceFor(model, cfg = readAiConfig()) {
  const family = FAMILY_PRICES.find(([re]) => re.test(model || ''))?.[1] || FALLBACK_PRICE;
  return {
    input: cfg.priceInputPerMTok || family.input,
    output: cfg.priceOutputPerMTok || family.output,
    custom: Boolean(cfg.priceInputPerMTok || cfg.priceOutputPerMTok)
  };
}

// Cost of one API response: cache writes cost 1,25x input, cache reads 0,1x input (Anthropic prompt caching)
export function costOf(usage = {}, model, cfg = readAiConfig()) {
  const p = priceFor(model, cfg);
  const input = Number(usage.input_tokens) || 0;
  const output = Number(usage.output_tokens) || 0;
  const cacheWrite = Number(usage.cache_creation_input_tokens) || 0;
  const cacheRead = Number(usage.cache_read_input_tokens) || 0;
  return (input * p.input + cacheWrite * p.input * 1.25 + cacheRead * p.input * 0.1 + output * p.output) / 1e6;
}

export function recordUsage({ taskId, runId, model, usage }) {
  const cost = costOf(usage, model);
  db.prepare(`
    INSERT INTO agent_usage (task_id, run_id, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(taskId, runId, model, usage?.input_tokens || 0, usage?.output_tokens || 0,
    usage?.cache_creation_input_tokens || 0, usage?.cache_read_input_tokens || 0, cost);
  return cost;
}

// Month in WIB (UTC+7), like the rest of the app's reports
const MONTH_SQL = "strftime('%Y-%m', created_at, '+7 hours') = strftime('%Y-%m', 'now', '+7 hours')";

export function usageSummary(taskId = null) {
  const cfg = readAiConfig();
  const month = db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS cost, COUNT(*) AS calls FROM agent_usage WHERE ${MONTH_SQL}`).get();
  const task = taskId
    ? db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS cost, COALESCE(SUM(input_tokens + cache_write_tokens + cache_read_tokens), 0) AS inTok, COALESCE(SUM(output_tokens), 0) AS outTok FROM agent_usage WHERE task_id = ?').get(taskId)
    : null;
  const budget = cfg.monthlyBudgetUsd;
  const ratio = budget > 0 ? month.cost / budget : 1;
  return {
    model: cfg.model,
    monthCostUsd: month.cost,
    monthCalls: month.calls,
    budgetUsd: budget,
    ratio,
    warning: ratio >= BUDGET_WARNING_RATIO && ratio < 1,
    exhausted: ratio >= 1,
    task: task ? { costUsd: task.cost, inputTokens: task.inTok, outputTokens: task.outTok } : null,
    estimated: true
  };
}
