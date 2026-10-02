import express from 'express';
import db from '../db.js';
import { writeAuditLog } from '../middleware/audit.js';
import { clientIp } from '../middleware/auth.js';
import { canSyncTemplatePrices } from '../../../shared/templatePrice.js';
import { templatePriceRows, applyTemplatePrices, undoLastPriceBatch, lastPriceBatch, GROUP_ORDER } from '../utils/templatePricing.js';

// "Samakan Semua Harga dengan Template" (AGENTS.md §32): preview, apply (one transaction) and undo of the last batch.
// Access: Super Admin and Keuangan (ACCESS_RULES); Operasional gets 403.
const router = express.Router();

const rupiah = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${rupiah(Math.abs(n))}`;

const floorplanOf = (req, res) => {
  if (!canSyncTemplatePrices(req.user)) {
    res.status(403).json({ success: false, error: 'Hanya Super Admin dan Keuangan yang dapat menyamakan harga booth dengan template.' });
    return null;
  }
  const fp = db.prepare('SELECT id, title FROM floorplans WHERE id = ? AND deleted_at IS NULL').get(req.params.floorplanId);
  if (!fp) res.status(404).json({ success: false, error: 'Project tidak ditemukan' });
  return fp || null;
};

const previewOf = (floorplanId) => {
  const rows = templatePriceRows(floorplanId);
  const counts = Object.fromEntries(GROUP_ORDER.map(g => [g, rows.filter(r => r.group === g).length]));
  const last = lastPriceBatch(floorplanId);
  return { rows, counts, lastBatch: last ? { id: last.id, userName: last.userName, createdAt: last.createdAt, undoneAt: last.undoneAt, count: last.changes.length } : null };
};

const audit = (req, action, fp, summary, details) => {
  req.skipAudit = true; // written here with the old -> new price of every booth
  writeAuditLog({ user: req.user, action, category: 'Floorplan', target: `${fp.title} (${fp.id})`, summary, method: req.method,
    path: `/api/template-prices${req.path}`, statusCode: 200, ip: clientIp(req), details });
};

// GET /api/template-prices/:floorplanId/preview: nothing is saved
router.get('/:floorplanId/preview', (req, res) => {
  try {
    const fp = floorplanOf(req, res);
    if (!fp) return;
    res.json({ success: true, floorplan: fp, ...previewOf(fp.id) });
  } catch (error) {
    console.error('Template price preview error:', error);
    res.status(500).json({ success: false, error: 'Gagal memuat pratinjau harga template' });
  }
});

// POST /api/template-prices/:floorplanId/apply { codes: [] }
router.post('/:floorplanId/apply', (req, res) => {
  try {
    const fp = floorplanOf(req, res);
    if (!fp) return;
    const codes = Array.isArray(req.body?.codes) ? req.body.codes.map(c => String(c || '').trim()).filter(Boolean) : [];
    if (!codes.length) return res.status(400).json({ success: false, error: 'Pilih minimal satu booth.' });

    const result = applyTemplatePrices(fp.id, codes, req.user);
    if (!result.changes.length) {
      return res.status(409).json({ success: false, code: 'NOTHING_TO_CHANGE', skipped: result.skipped, error: 'Tidak ada booth yang dapat diubah (terkunci invoice, konflik template, atau sudah sesuai).' });
    }
    const totalDiff = result.changes.reduce((acc, c) => acc + (c.newPrice - c.oldPrice), 0);
    audit(req, 'Samakan harga booth dengan template', fp,
      `${result.changes.length} booth diubah · selisih ${signed(totalDiff)} · ${result.changes.slice(0, 12).map(c => `${c.code}: ${rupiah(c.oldPrice)} → ${rupiah(c.newPrice)}`).join('; ')}${result.changes.length > 12 ? '; …' : ''}`,
      { batchId: result.batch.id, floorplanId: fp.id, count: result.changes.length, totalDiff, changes: result.changes, skipped: result.skipped });

    res.json({
      success: true,
      message: `${result.changes.length} booth disamakan dengan harga template.`,
      changes: result.changes.map(c => ({ code: c.code, price: c.newPrice, priceMode: c.newMode, discountAmount: c.newDiscountAmount })),
      skipped: result.skipped, totalDiff, ...previewOf(fp.id)
    });
  } catch (error) {
    console.error('Template price apply error:', error);
    res.status(500).json({ success: false, error: 'Gagal menyamakan harga. Tidak ada booth yang diubah.' });
  }
});

// POST /api/template-prices/:floorplanId/undo: the latest batch only
router.post('/:floorplanId/undo', (req, res) => {
  try {
    const fp = floorplanOf(req, res);
    if (!fp) return;
    const result = undoLastPriceBatch(fp.id, req.user);
    if (!result) return res.status(409).json({ success: false, code: 'NOTHING_TO_UNDO', error: 'Tidak ada perubahan harga yang bisa dibatalkan.' });
    audit(req, 'Batalkan samakan harga booth', fp,
      `${result.restored.length} booth dikembalikan${result.skipped.length ? `, ${result.skipped.length} dilewati` : ''} · ${result.restored.slice(0, 12).map(c => `${c.code}: ${rupiah(c.oldPrice)} → ${rupiah(c.newPrice)}`).join('; ')}${result.restored.length > 12 ? '; …' : ''}`,
      { batchId: result.batch.id, floorplanId: fp.id, count: result.restored.length, restored: result.restored, skipped: result.skipped });
    res.json({
      success: true,
      message: `${result.restored.length} booth dikembalikan ke harga sebelumnya${result.skipped.length ? ` (${result.skipped.length} dilewati)` : ''}.`,
      changes: result.restored.map(c => ({ code: c.code, price: c.newPrice, priceMode: c.priceMode, discountAmount: c.discountAmount })),
      skipped: result.skipped, ...previewOf(fp.id)
    });
  } catch (error) {
    console.error('Template price undo error:', error);
    res.status(500).json({ success: false, error: 'Gagal membatalkan perubahan harga' });
  }
});

export default router;
