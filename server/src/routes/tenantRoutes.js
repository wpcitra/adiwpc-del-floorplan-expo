import express from 'express';
import db from '../db.js';
import { writeAuditLog } from '../middleware/audit.js';
import { clientIp } from '../middleware/auth.js';
import { notifyOpsOfSalesChange } from '../utils/opsLayer.js';
import { canDeleteTenant, sameBoothNumber, BULK_CONFIRM_WORD } from '../../../shared/tenantPermissions.js';
import { tenantOfRow, planTenantDelete, planDto, executeTenantDelete, deletedTenants, restoreTenant } from '../utils/tenantDelete.js';

// Hapus Tenant & Urungkan (AGENTS.md §33). Super Admin only, on every endpoint (also in ACCESS_RULES).
//   GET    /api/tenants/:id/summary   what the confirmation shows (nothing changes)
//   DELETE /api/tenants/:id           soft delete one tenant row { confirmBooth, alsoIds }
//   POST   /api/tenants/bulk-delete   { ids, confirmText }: one transaction, all or nothing
//   POST   /api/tenants/:id/restore   "Urungkan"
//   GET    /api/tenants/trash         deleted tenants that were not restored
const router = express.Router();

const rupiah = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
const projectOf = (floorplanId) => db.prepare('SELECT id, title FROM floorplans WHERE id = ? AND deleted_at IS NULL').get(floorplanId || '');

const guard = (req, res) => {
  if (canDeleteTenant(req.user)) return true;
  res.status(403).json({ success: false, error: 'Hanya Super Admin yang dapat menghapus atau memulihkan tenant.' });
  return false;
};

// One or several row ids (a merged row "A-01+A-02" has one id per booth) -> the tenant and its booths
function tenantOfIds(ids) {
  const rows = [...new Set(ids.map(String))].map(tenantOfRow);
  if (!rows.length || rows.some(r => !r)) return null;
  const first = rows[0];
  if (rows.some(r => r.floorplanId !== first.floorplanId)) return null;
  return { ref: first.ref, floorplanId: first.floorplanId, company: first.company, codes: [...new Set(rows.flatMap(r => r.codes))] };
}

const audit = (req, action, target, summary, details) => {
  req.skipAudit = true; // written here with project, booth, brand, bill and payment status
  writeAuditLog({ user: req.user, action, category: 'Exhibitor', target, summary, method: req.method, path: `/api/tenants${req.path}`, statusCode: 200, ip: clientIp(req), details });
};

const auditDelete = (req, fp, plan, result, bulk = false) => audit(req, 'Hapus tenant', `${plan.company} · booth ${plan.codes.join('+')} (${fp.title})`,
  [`Tagihan ${rupiah(plan.totalAmount)}`, plan.paymentStatus, plan.paidAmount > 0 ? `sudah dibayar ${rupiah(plan.paidAmount)}` : '',
    result.released.length ? `booth ${result.released.join(', ')} kembali Available` : 'booth tidak diubah',
    plan.invoices.length ? `invoice: ${plan.invoices.map(i => `${i.inv.invoice_number} ${i.action === 'delete' ? 'ke Tempat Sampah' : i.action === 'cancel' ? 'dibatalkan (tetap tercatat)' : 'booth dikeluarkan'}`).join('; ')}` : 'tanpa invoice',
    plan.facilityRequests.length ? `${plan.facilityRequests.length} form fasilitas diarsipkan` : ''].filter(Boolean).join(' · '),
  { recordId: result.id, bulk, floorplanId: fp.id, project: fp.title, company: plan.company, boothCodes: plan.codes, releasedBooths: result.released,
    totalAmount: plan.totalAmount, paidAmount: plan.paidAmount, paymentStatus: plan.paymentStatus,
    invoices: plan.invoices.map(i => ({ invoiceNumber: i.inv.invoice_number, action: i.action, totalAmount: Number(i.inv.total_amount) || 0, paidAmount: i.paid })),
    facilityRequests: plan.facilityRequests.length });

router.get('/trash', (req, res) => {
  try {
    if (!guard(req, res)) return;
    res.json({ success: true, tenants: deletedTenants() });
  } catch (error) {
    console.error('Tenant trash error:', error);
    res.status(500).json({ success: false, error: 'Gagal memuat tenant yang dihapus' });
  }
});

router.get('/:id/summary', (req, res) => {
  try {
    if (!guard(req, res)) return;
    const also = String(req.query.alsoIds || '').split(',').map(s => s.trim()).filter(Boolean);
    const tenant = tenantOfIds([req.params.id, ...also]);
    const fp = tenant ? projectOf(tenant.floorplanId) : null;
    if (!tenant || !fp) return res.status(404).json({ success: false, error: 'Tenant tidak ditemukan' });
    res.json({ success: true, project: fp, tenant: planDto(planTenantDelete(fp.id, tenant.company, tenant.codes)) });
  } catch (error) {
    console.error('Tenant summary error:', error);
    res.status(500).json({ success: false, error: 'Gagal memuat data tenant' });
  }
});

router.post('/bulk-delete', (req, res) => {
  try {
    if (!guard(req, res)) return;
    // each entry is one table row: an id, or the ids of a merged row
    const groups = (Array.isArray(req.body?.ids) ? req.body.ids : []).slice(0, 500).map(g => (Array.isArray(g) ? g : [g]).map(String).filter(Boolean)).filter(g => g.length);
    if (!groups.length) return res.status(400).json({ success: false, error: 'Pilih minimal satu tenant.' });

    const done = [];
    let refusal = null;
    try {
      db.transaction(() => {
        for (const ids of groups) {
          const tenant = tenantOfIds(ids);
          const fp = tenant ? projectOf(tenant.floorplanId) : null;
          const plan = tenant && fp ? planTenantDelete(fp.id, tenant.company, tenant.codes) : null;
          if (!plan || plan.empty) { refusal = { status: 404, body: { success: false, code: 'TENANT_NOT_FOUND', error: 'Salah satu tenant terpilih sudah tidak ada. Tidak ada yang dihapus; muat ulang daftar lalu pilih lagi.' } }; throw new Error('refused'); }
          if ((plan.hasPayment || plan.hasInvoice) && String(req.body?.confirmText || '').trim() !== BULK_CONFIRM_WORD) {
            refusal = { status: 400, body: { success: false, code: 'CONFIRM_REQUIRED', error: `Ada tenant yang sudah punya pembayaran / invoice (${plan.company}). Ketik ${BULK_CONFIRM_WORD} untuk melanjutkan.` } };
            throw new Error('refused');
          }
          const result = executeTenantDelete(plan, req.user, { scope: 'bulk', ref: tenant.ref });
          done.push({ fp, plan, result, ref: tenant.ref });
        }
      })();
    } catch (e) {
      if (refusal) return res.status(refusal.status).json(refusal.body);
      throw e;
    }

    const notify = new Map();
    done.forEach(({ fp, plan, result }) => {
      auditDelete(req, fp, plan, result, true);
      notify.set(fp.id, (notify.get(fp.id) || 0) + result.released.length);
    });
    notify.forEach((count, fpId) => { if (count) notifyOpsOfSalesChange(fpId, count, req.user?.name || ''); });
    res.json({
      success: true, message: `${done.length} tenant dihapus.`,
      deleted: done.map(d => ({ id: d.ref, recordId: d.result.id, company: d.plan.company, boothCodes: d.plan.codes, released: d.result.released }))
    });
  } catch (error) {
    console.error('Tenant bulk delete error:', error);
    res.status(500).json({ success: false, error: 'Gagal menghapus tenant terpilih. Tidak ada yang dihapus.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    if (!guard(req, res)) return;
    const also = Array.isArray(req.body?.alsoIds) ? req.body.alsoIds.map(String) : [];
    const tenant = tenantOfIds([req.params.id, ...also]);
    const fp = tenant ? projectOf(tenant.floorplanId) : null;
    const plan = tenant && fp ? planTenantDelete(fp.id, tenant.company, tenant.codes) : null;
    if (!plan || plan.empty) return res.status(404).json({ success: false, error: 'Tenant tidak ditemukan atau sudah dihapus.' });
    if ((plan.hasPayment || plan.hasInvoice) && !sameBoothNumber(req.body?.confirmBooth, plan.codes)) {
      return res.status(400).json({ success: false, code: 'CONFIRM_BOOTH', error: `Tenant ini sudah memiliki pembayaran/invoice. Ketik nomor booth ${plan.codes.join('+')} persis untuk menghapus.` });
    }

    const result = executeTenantDelete(plan, req.user, { scope: 'booth', ref: tenant.ref });
    auditDelete(req, fp, plan, result);
    if (result.released.length) notifyOpsOfSalesChange(fp.id, result.released.length, req.user?.name || '');
    res.json({
      success: true, id: tenant.ref, recordId: result.id, released: result.released, warnings: result.warnings,
      message: `Tenant ${plan.company} dihapus`
    });
  } catch (error) {
    console.error('Tenant delete error:', error);
    res.status(500).json({ success: false, error: 'Gagal menghapus tenant. Tidak ada data yang diubah.' });
  }
});

router.post('/:id/restore', (req, res) => {
  try {
    if (!guard(req, res)) return;
    const result = restoreTenant(req.params.id, req.user);
    if (!result) return res.status(404).json({ success: false, error: 'Tenant tidak ditemukan di daftar yang dihapus.' });
    if (result.error) return res.status(409).json({ success: false, code: result.code, conflicts: result.conflicts || [], error: result.error });
    const { record, restoredBooths, notes } = result;
    audit(req, 'Pulihkan tenant', `${record.company} · booth ${record.boothCodes.join('+')} (${record.projectTitle})`,
      [`booth ${restoredBooths.join(', ') || '-'} kembali ke tenant`, ...notes].join(' · '),
      { recordId: record.id, floorplanId: record.floorplanId, project: record.projectTitle, company: record.company, boothCodes: record.boothCodes, restoredBooths, notes,
        totalAmount: record.totalAmount, paymentStatus: record.paymentStatus, deletedBy: record.deletedBy });
    if (restoredBooths.length) notifyOpsOfSalesChange(record.floorplanId, restoredBooths.length, req.user?.name || '');
    res.json({ success: true, restoredBooths, notes, message: `Tenant ${record.company} dipulihkan` });
  } catch (error) {
    console.error('Tenant restore error:', error);
    res.status(500).json({ success: false, error: 'Gagal memulihkan tenant' });
  }
});

export default router;
