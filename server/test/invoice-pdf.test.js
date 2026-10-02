// Invoice PDF (AGENTS.md §34): who may download, the registrant's token, the 503 fallback and a real render
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';
import { pdfTokenFor, pdfTokenValid, chromiumPath, printBaseUrl } from '../src/utils/pdfRenderer.js';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist/index.html');
const canRender = Boolean(chromiumPath()) && fs.existsSync(DIST);
const FP = 'FP-TEST-PDF';
let s;
let off;
let invoice;
let visitorInvoice;

const pdf = (server, id, { as, token } = {}) => fetch(`${server.base}/invoices/${encodeURIComponent(id)}/pdf${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  as ? { headers: { authorization: `Bearer ${as}` } } : {});

before(async () => {
  s = await startServer();
  off = await startServer({ PDF_ENGINE: 'off' });
  for (const server of [s, off]) {
    await createPublishedFloorplan(server.api, FP, [boothObject('A-01', { left: 0, top: 0 }), boothObject('A-02', { left: 100, top: 0 })]);
  }
  const reg = await s.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['A-01'], fullName: 'Budi', brandName: 'Kopi PDF', brandCategory: 'F&B', phone: '0812345678', bookingType: 'booking' }, { as: 'superadmin' });
  invoice = reg.body.order.invoice;
  const pub = await s.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['A-02'], fullName: 'Sari', brandName: 'Pengunjung', brandCategory: 'F&B', phone: '0812000111', bookingType: 'booking' });
  assert.equal(pub.status, 200, pub.text);
  visitorInvoice = pub.body.order.invoice;
  await off.api('POST', '/orders/checkout', { floorplanId: FP, boothCodes: ['A-01'], fullName: 'Budi', brandName: 'Kopi PDF', brandCategory: 'F&B', phone: '0812345678', bookingType: 'booking' }, { as: 'superadmin' });
});
after(async () => { await s?.stop(); await off?.stop(); });

test('token unduhan pendaftar: hanya untuk invoice itu, tidak bisa dipalsukan', () => {
  const token = pdfTokenFor('INV-1');
  assert.equal(pdfTokenValid('INV-1', token), true);
  assert.equal(pdfTokenValid('INV-2', token), false);
  assert.equal(pdfTokenValid('INV-1', `${Date.now() - 1000}.${token.split('.')[1]}`), false, 'kedaluwarsa');
  assert.equal(pdfTokenValid('INV-1', `${token.split('.')[0]}.deadbeef`), false);
  assert.equal(pdfTokenValid('INV-1', ''), false);
});

test('halaman cetak: server sendiri di produksi, dev server lokal bila halaman dibuka dari port lain', () => {
  assert.equal(printBaseUrl({ headers: {} }, 5001), 'http://127.0.0.1:5001');
  assert.equal(printBaseUrl({ headers: { origin: 'https://denah.example.com' } }, 8080), 'http://127.0.0.1:8080');
  assert.equal(printBaseUrl({ headers: { origin: 'http://localhost:3002' } }, 5001), 'http://localhost:3002');
});

test('tanpa login dan tanpa token: 401; token invoice lain: 401; respons checkout membawa token', async () => {
  assert.ok(visitorInvoice.pdfToken, 'pendaftar menerima token unduhan');
  assert.equal((await pdf(s, invoice.id)).status, 401);
  assert.equal((await pdf(s, invoice.id, { token: 'x.y' })).status, 401);
  assert.equal((await pdf(s, invoice.id, { token: visitorInvoice.pdfToken })).status, 401, 'token milik invoice lain');
  assert.equal((await s.api('POST', '/invoices/pdf-preview', { invoice: {} })).status, 401);
  assert.equal((await s.api('POST', '/invoices/pdf-preview', { invoice: {} }, { as: 'sales' })).status, 403);
  assert.equal((await s.api('POST', '/invoices/pdf-preview', {}, { as: 'finance' })).status, 400);
});

test('server tanpa Chromium menjawab 503 (halaman lalu memakai dialog cetak browser)', async () => {
  const health = await off.api('GET', '/health');
  assert.equal(health.body.pdfEngine, false);
  const list = await off.api('GET', '/invoices', undefined, { as: 'finance' });
  const r = await off.api('GET', `/invoices/${list.body.invoices[0].id}/pdf`, undefined, { as: 'finance' });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'PDF_ENGINE_UNAVAILABLE');
});

test('PDF sungguhan dari rute cetak: staf dan pendaftar dengan token', { skip: canRender ? false : 'butuh Chromium dan client/dist' }, async () => {
  const session = await s.api('POST', '/auth/login', { email: 'keuangan@expo.local', password: 'keuangan123' });
  const staff = await pdf(s, invoice.id, { as: session.body.token });
  assert.equal(staff.status, 200);
  assert.equal(staff.headers.get('content-type'), 'application/pdf');
  const bytes = Buffer.from(await staff.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 20000, 'bukan halaman kosong');
  assert.match(staff.headers.get('content-disposition'), /Invoice-INV_/);

  const visitor = await pdf(s, visitorInvoice.id, { token: visitorInvoice.pdfToken });
  assert.equal(visitor.status, 200);
  assert.equal(Buffer.from(await visitor.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');

  const preview = await fetch(`${s.base}/invoices/pdf-preview`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.body.token}` },
    body: JSON.stringify({ invoice, config: { primaryColor: '#b91c1c', headerLayout: 'logo_center_stacked' } }) });
  assert.equal(preview.status, 200);
  assert.equal(Buffer.from(await preview.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
});
