// Public data protection (AGENTS.md §20): visitors never receive contact data, discounts or internal elements
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, boothObject, createPublishedFloorplan } from './helpers.js';

let s;
let slug;
const FP = 'FP-TEST-PUBLIC';
const SECRET_EMAIL = 'rahasia@contoh.test';
const SECRET_PHONE = '081299998888';

before(async () => {
  s = await startServer();
  const internal = {
    type: 'Group', left: 400, top: 0, width: 20, height: 20, isVenueItem: true,
    venueData: { lib: 'cctv', type: 'cctv', label: 'CCTV Internal', publicVisible: false }, objects: []
  };
  ({ slug } = await createPublishedFloorplan(s.api, FP, [
    boothObject('P-01', { left: 0, top: 0, extra: { discountType: 'nominal', discountValue: 1500000, discountAmount: 1500000, discountReason: 'Diskon rahasia' } }),
    boothObject('P-02', { left: 100, top: 0 }),
    internal
  ]));
  const r = await s.api('POST', '/orders/checkout', {
    floorplanId: FP, boothCodes: ['P-02'], fullName: 'Nama PIC Rahasia', brandName: 'Brand Publik',
    email: SECRET_EMAIL, phone: SECRET_PHONE, bookingType: 'booking'
  });
  assert.equal(r.status, 200, r.text);
});
after(async () => { await s?.stop(); });

const assertNoPrivateData = (text, where) => {
  assert.doesNotMatch(text, new RegExp(SECRET_EMAIL), `${where}: email bocor`);
  assert.doesNotMatch(text, new RegExp(SECRET_PHONE), `${where}: telepon bocor`);
  assert.doesNotMatch(text, /Nama PIC Rahasia/, `${where}: nama PIC bocor`);
  assert.doesNotMatch(text, /Diskon rahasia|discountAmount|discount_amount/, `${where}: diskon bocor`);
  assert.doesNotMatch(text, /CCTV Internal/, `${where}: elemen internal bocor`);
  assert.doesNotMatch(text, /EXH-[0-9a-f]/, `${where}: exhibitor ID asli bocor`);
};

test('denah publik tidak memuat data pribadi, diskon, atau elemen internal', async () => {
  const active = await s.api('GET', '/floorplan/active');
  assert.equal(active.status, 200);
  assertNoPrivateData(active.text, '/floorplan/active');
  const byId = await s.api('GET', `/floorplan/${FP}`);
  assert.equal(byId.status, 200);
  assertNoPrivateData(byId.text, '/floorplan/:id');
  assert.match(byId.text, /Brand Publik/, 'nama brand tenant tetap tampil');
  assert.ok(slug);
});

test('staf tetap melihat data lengkap di Studio', async () => {
  const r = await s.api('GET', `/floorplan/${FP}`, undefined, { as: 'superadmin' });
  assert.match(r.text, /Diskon rahasia/);
  assert.match(r.text, /CCTV Internal/);
  assert.match(r.text, /EXH-[0-9A-F]/i);
});

test('cek klien publik tidak membocorkan data klien', async () => {
  const r = await s.api('GET', `/orders/check-client?email=${encodeURIComponent(SECRET_EMAIL)}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.client, null);
  assertNoPrivateData(r.text, '/orders/check-client');
});

test('konfigurasi invoice publik tanpa gambar tanda tangan', async () => {
  const r = await s.api('GET', '/invoices/config');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /data:image\/png;base64/);
});

test('health tidak memuat rahasia', async () => {
  const r = await s.api('GET', '/health');
  assert.doesNotMatch(r.text, /ANTHROPIC|sk-ant|password|DATA_DIR/i);
});
