import express from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db.js';
import { scrubText } from '../utils/errorTracker.js';
import { usageSummary, readAiConfig } from '../utils/agent/aiConfig.js';
import { MODULES } from '../utils/agent/agentTools.js';
import { listFiles } from '../utils/agent/repoTools.js';
import { ATTACHMENT_DIR, newId, addMessage, startRun, stopRun, markInterruptedRuns } from '../utils/agent/agentRunner.js';

// Pusat Maintenance chat with the AI agent (AGENTS.md §27), mounted at /api/maintenance/agent:
// Developer / Super Admin only (access policy of /maintenance). Tahap 1: questions & code reading.
//   GET    /tasks                  list (search, status filter)
//   POST   /tasks                  new task (conversation)
//   GET    /tasks/:id              task, messages, current run, cost
//   PATCH  /tasks/:id              rename / cancel / reopen
//   POST   /tasks/:id/messages     send a message (+ context, attachments) -> starts the agent
//   POST   /tasks/:id/stop         stop the running agent
//   GET    /attachments/:id        a screenshot / file of the conversation
//   GET    /context/modules|files  pickers of the chat box;   GET /usage   cost of the month
const router = express.Router();

export const TASK_STATUSES = ['diskusi', 'menunggu_rencana', 'dikerjakan', 'siap_ditinjau', 'dideploy', 'dibatalkan'];
const MAX_ATTACHMENTS = 6;
const IMAGE_TYPES = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/gif': [0x47, 0x49, 0x46], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
const TEXT_EXT = /\.(txt|log|json|csv|md|js|jsx|mjs|ts|tsx|css|html|sql|xml|yml|yaml)$/i;
const LIMITS = { image: 5 * 1024 * 1024, pdf: 10 * 1024 * 1024, text: 1024 * 1024 };

fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });
markInterruptedRuns();

const parseJson = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } };
const cleanTitle = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 120);

const toTask = (t) => t && ({
  id: t.id, title: t.title, status: t.status, createdByName: t.created_by_name, branch: t.branch, prRef: t.pr_ref,
  createdAt: t.created_at, updatedAt: t.updated_at
});
const latestRun = (taskId) => db.prepare('SELECT * FROM agent_runs WHERE task_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1').get(taskId);
const toRun = (r) => r && ({ id: r.id, status: r.status, phase: r.phase, steps: r.steps, startedAt: r.started_at, finishedAt: r.finished_at, startedBy: r.started_by });

// Checks the declared type against the file content (magic bytes / no binary in text files)
function validateAttachment(a) {
  const name = String(a?.name || 'lampiran').replace(/[/\\]/g, '_').slice(0, 120);
  const mime = String(a?.mime || '').toLowerCase();
  let buf;
  try { buf = Buffer.from(String(a?.dataBase64 || ''), 'base64'); } catch (e) { return { error: `${name}: data tidak valid` }; }
  if (!buf.length) return { error: `${name}: file kosong` };
  if (IMAGE_TYPES[mime]) {
    if (!IMAGE_TYPES[mime].every((b, i) => buf[i] === b)) return { error: `${name}: isi file bukan gambar ${mime}` };
    if (buf.length > LIMITS.image) return { error: `${name}: gambar maksimal 5 MB` };
    return { name, mime, kind: 'image', buf };
  }
  if (mime === 'application/pdf') {
    if (buf.subarray(0, 4).toString() !== '%PDF') return { error: `${name}: isi file bukan PDF` };
    if (buf.length > LIMITS.pdf) return { error: `${name}: PDF maksimal 10 MB` };
    return { name, mime, kind: 'file', buf };
  }
  if (TEXT_EXT.test(name) || mime.startsWith('text/') || mime === 'application/json') {
    if (buf.subarray(0, 8000).includes(0)) return { error: `${name}: file biner tidak didukung` };
    if (buf.length > LIMITS.text) return { error: `${name}: file teks maksimal 1 MB` };
    return { name, mime: 'text/plain', kind: 'file', buf };
  }
  return { error: `${name}: jenis file tidak didukung (gambar PNG/JPG/GIF/WebP, PDF, atau file teks/log)` };
}

router.get('/tasks', (req, res) => {
  const { status = 'semua', q = '' } = req.query;
  const where = [];
  const params = [];
  if (TASK_STATUSES.includes(status)) { where.push('status = ?'); params.push(status); }
  if (String(q).trim()) { where.push('(title LIKE ? OR id LIKE ?)'); params.push(`%${String(q).trim()}%`, `%${String(q).trim()}%`); }
  const rows = db.prepare(`SELECT * FROM agent_tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT 200`).all(...params);
  res.json({
    success: true,
    tasks: rows.map(t => ({ ...toTask(t), running: latestRun(t.id)?.status === 'berjalan' })),
    usage: usageSummary()
  });
});

router.post('/tasks', (req, res) => {
  const id = newId('TGS');
  db.prepare('INSERT INTO agent_tasks (id, title, status, created_by, created_by_name) VALUES (?, ?, ?, ?, ?)')
    .run(id, cleanTitle(req.body?.title) || 'Percakapan baru', 'diskusi', req.user.id, req.user.name);
  res.status(201).json({ success: true, task: toTask(db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get(id)) });
});

router.get('/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ success: false, error: 'Tugas tidak ditemukan' });
  const attachments = db.prepare('SELECT id, message_id, kind, mime, name, size FROM agent_attachments WHERE task_id = ?').all(task.id);
  const messages = db.prepare('SELECT * FROM agent_messages WHERE task_id = ? ORDER BY id').all(task.id).map(m => {
    const meta = parseJson(m.meta_json, {});
    return {
      id: m.id, role: m.role, content: m.content, createdAt: m.created_at, byName: m.created_by_name,
      context: meta.context || [], toolsUsed: meta.toolsUsed || [], costUsd: meta.costUsd || null, model: meta.model || null,
      attachments: attachments.filter(a => a.message_id === m.id).map(a => ({ id: a.id, kind: a.kind, mime: a.mime, name: a.name, size: a.size }))
    };
  });
  res.json({ success: true, task: toTask(task), messages, run: toRun(latestRun(task.id)), usage: usageSummary(task.id), stage: 1 });
});

router.patch('/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ success: false, error: 'Tugas tidak ditemukan' });
  const title = req.body?.title !== undefined ? cleanTitle(req.body.title) : task.title;
  // Tahap 1: a task can only be discussed or cancelled (plan / work / review / deploy states come with later stages)
  const status = req.body?.status !== undefined ? req.body.status : task.status;
  if (!title) return res.status(400).json({ success: false, error: 'Judul tidak boleh kosong' });
  if (!['diskusi', 'dibatalkan'].includes(status) && status !== task.status) {
    return res.status(400).json({ success: false, error: 'Status ini belum tersedia pada tahap sekarang' });
  }
  db.prepare('UPDATE agent_tasks SET title = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, status, task.id);
  res.json({ success: true, task: toTask(db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get(task.id)) });
});

router.post('/tasks/:id/messages', (req, res) => {
  const task = db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ success: false, error: 'Tugas tidak ditemukan' });
  if (task.status === 'dibatalkan') return res.status(409).json({ success: false, error: 'Tugas ini sudah dibatalkan. Buka kembali untuk melanjutkan.' });
  if (latestRun(task.id)?.status === 'berjalan') return res.status(409).json({ success: false, error: 'Agent masih bekerja pada tugas ini. Tunggu atau klik Hentikan.' });

  const text = String(req.body?.text || '').trim().slice(0, 20000);
  const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  if (!text && !rawAttachments.length) return res.status(400).json({ success: false, error: 'Tulis pesan atau lampirkan file' });
  if (rawAttachments.length > MAX_ATTACHMENTS) return res.status(400).json({ success: false, error: `Maksimal ${MAX_ATTACHMENTS} lampiran per pesan` });
  const files = rawAttachments.map(validateAttachment);
  const bad = files.find(f => f.error);
  if (bad) return res.status(400).json({ success: false, error: bad.error });

  const context = (Array.isArray(req.body?.context) ? req.body.context : []).slice(0, 10).map(c => {
    if (c?.type === 'error') return { type: 'error', id: String(c.id || '').slice(0, 40), label: `Error ${String(c.id || '').slice(0, 40)}` };
    if (c?.type === 'module') { const m = MODULES.find(x => x.key === c.key); return m ? { type: 'module', key: m.key, label: m.label } : null; }
    if (c?.type === 'file') return { type: 'file', path: String(c.path || '').slice(0, 300), label: String(c.path || '').slice(0, 300) };
    return null;
  }).filter(Boolean);

  const usage = usageSummary();
  if (usage.exhausted) return res.status(402).json({ success: false, error: `Batas biaya bulanan (USD ${usage.budgetUsd.toFixed(2)}) sudah tercapai. Super Admin dapat menaikkannya di Setting > Integrasi AI.` });
  if (!readAiConfig().model) return res.status(409).json({ success: false, error: 'Model Claude belum dipilih. Super Admin dapat memilihnya di Setting > Integrasi AI (Claude).' });

  const messageId = db.transaction(() => {
    const mid = addMessage(task.id, 'user', text, { context, attachmentNames: files.map(f => f.name) }, req.user.name);
    const ids = files.map(f => {
      const id = newId('ATT');
      const fileName = `${id}.bin`;
      fs.writeFileSync(path.join(ATTACHMENT_DIR, fileName), f.buf, { mode: 0o600 });
      db.prepare('INSERT INTO agent_attachments (id, task_id, message_id, kind, mime, name, size, file_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, task.id, mid, f.kind, f.mime, f.name, f.buf.length, fileName);
      return id;
    });
    const meta = { context, attachments: ids, attachmentNames: files.map(f => f.name) };
    db.prepare('UPDATE agent_messages SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), mid);
    // First message names the task (can be renamed)
    if (task.title === 'Percakapan baru' && text) {
      db.prepare('UPDATE agent_tasks SET title = ? WHERE id = ?').run(cleanTitle(text.split('\n')[0]).slice(0, 80), task.id);
    }
    return mid;
  })();

  const runId = startRun({ taskId: task.id, messageId, user: req.user });
  res.status(202).json({ success: true, runId, messageId });
});

router.post('/tasks/:id/stop', (req, res) => {
  const run = latestRun(req.params.id);
  if (!run || run.status !== 'berjalan') return res.json({ success: true, stopped: false });
  stopRun(run.id);
  res.json({ success: true, stopped: true });
});

router.get('/attachments/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM agent_attachments WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ success: false, error: 'Lampiran tidak ditemukan' });
  res.setHeader('Content-Type', a.kind === 'image' || a.mime === 'application/pdf' ? a.mime : 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${a.kind === 'image' ? 'inline' : 'attachment'}; filename="${encodeURIComponent(a.name)}"`);
  res.sendFile(path.join(ATTACHMENT_DIR, a.file_name));
});

router.get('/context/modules', (req, res) => res.json({ success: true, modules: MODULES.map(m => ({ key: m.key, label: m.label, files: m.files })) }));

router.get('/context/files', (req, res) => {
  const q = String(req.query.q || '').trim();
  try {
    const { files } = listFiles('', { contains: q });
    res.json({ success: true, files: files.slice(0, 60) });
  } catch (e) {
    res.status(400).json({ success: false, error: scrubText(e.message, 200) });
  }
});

router.get('/usage', (req, res) => res.json({ success: true, usage: usageSummary() }));

export default router;
