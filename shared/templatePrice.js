// Harga booth mengikuti Katalog Template (AGENTS.md §32). One rule for the Studio and the server.
// A booth is matched to a template by its SIZE in metres (never by name or colour). The size is normalized:
// "3X2", "3 x 2 m" and 3.0 x 2 are the same, and a turned booth is the same size (2x3 = 3x2).
// Pure module (no database, no Fabric); tested in server/test/harga-template.test.js.

export const PRICE_MODES = ['template', 'custom'];
export const priceModeOf = (value) => (value === 'template' || value === 'custom' ? value : null);

/** Roles that may run "Samakan Semua Harga dengan Template" (Operasional never: 403 on the server). */
export const canSyncTemplatePrices = (user) => ['superadmin', 'finance'].includes(user?.role);

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

const widthOf = (o) => num(o?.widthM ?? o?.width_m ?? o?.dimensions_meters?.width);
const heightOf = (o) => num(o?.heightM ?? o?.height_m ?? o?.dimensions_meters?.height);

/** "3X2 m" / "3 x 2m" / "3.0×2" -> { widthM: 3, heightM: 2 }; null when the text is not a size. */
export function parseSizeLabel(text) {
  const m = String(text ?? '').toLowerCase().replace(/\s+/g, '').match(/^(\d+(?:[.,]\d+)?)m?[x×*](\d+(?:[.,]\d+)?)m?$/);
  if (!m) return null;
  const widthM = num(m[1]);
  const heightM = num(m[2]);
  return widthM && heightM ? { widthM, heightM } : null;
}

/** Orientation-free key of a size: 3 x 2, 2 x 3 and 3.0 x 2.00 all give "2x3". '' when a side is missing. */
export function sizeKeyOf(widthM, heightM) {
  const a = num(widthM);
  const b = num(heightM);
  return a && b ? `${Math.min(a, b)}x${Math.max(a, b)}` : '';
}

export const sizeLabelOf = (widthM, heightM) => `${num(widthM)}x${num(heightM)}m`.replace(/\./g, ',');

const templatePrice = (t) => Math.max(0, Math.round(Number(t?.defaultPrice ?? t?.default_price) || 0));
const isFreeTemplate = (t) => Boolean(t?.isFree ?? t?.is_free);

/**
 * Catalog -> Map(sizeKey -> { key, price, conflict, prices, templates }). Free tiers (Rp 0 sponsor booths) are not
 * price templates. Two templates of one size (also 2x3 next to 3x2) with different prices are a conflict: no price
 * is chosen for that size.
 */
export function buildTemplateIndex(catalog = []) {
  if (catalog instanceof Map) return catalog;
  const index = new Map();
  [...catalog].forEach(t => {
    if (!t || isFreeTemplate(t)) return;
    const key = sizeKeyOf(widthOf(t), heightOf(t));
    if (!key) return;
    const entry = index.get(key) || { key, price: null, conflict: false, prices: [], templates: [] };
    const price = templatePrice(t);
    entry.templates.push({ name: t.name || t.key || key, price, widthM: widthOf(t), heightM: heightOf(t) });
    if (!entry.prices.includes(price)) entry.prices.push(price);
    entry.conflict = entry.prices.length > 1;
    entry.price = entry.conflict ? null : price;
    index.set(key, entry);
  });
  return index;
}

/**
 * The one matching function: booth (widthM / heightM, any spelling) -> template price of the catalog.
 * status 'match' (price = template price) | 'none' (no template of this size) | 'conflict' (several prices).
 */
export function resolveTemplatePrice(booth, catalog) {
  const key = sizeKeyOf(widthOf(booth), heightOf(booth));
  const label = key ? sizeLabelOf(widthOf(booth), heightOf(booth)) : '-';
  const entry = key ? buildTemplateIndex(catalog).get(key) : null;
  if (!entry) return { status: 'none', price: null, key, label, templates: [] };
  if (entry.conflict) return { status: 'conflict', price: null, key, label, templates: entry.templates, prices: entry.prices };
  return { status: 'match', price: entry.price, key, label, templates: entry.templates, templateName: entry.templates[0]?.name || '' };
}

/** Mode of a booth that has none yet: 'template' only when its price IS the template price (nothing changes silently). */
export function initialPriceMode(booth, catalog) {
  const r = resolveTemplatePrice(booth, catalog);
  return r.status === 'match' && Math.round(Number(booth?.price) || 0) === r.price ? 'template' : 'custom';
}

/**
 * Auto-merge group: the total size (when the group is a rectangle) is matched first and its template price is shared
 * between the members by area; otherwise every member takes the template price of its own size.
 * members: [{ code, widthM, heightM }]; total: { widthM, heightM } | null. Returns Map(code -> resolution).
 */
export function resolveGroupTemplatePrices(members, total, catalog) {
  const index = buildTemplateIndex(catalog);
  const out = new Map();
  const whole = total ? resolveTemplatePrice(total, index) : { status: 'none' };
  if (whole.status === 'match' && members.length) {
    const areas = members.map(m => widthOf(m) * heightOf(m));
    const sum = areas.reduce((a, b) => a + b, 0) || 1;
    let rest = whole.price;
    members.forEach((m, i) => {
      const share = i === members.length - 1 ? rest : Math.round((whole.price * areas[i]) / sum);
      rest -= share;
      out.set(m.code, { ...whole, price: share, groupPrice: whole.price, groupLabel: whole.label, fromGroup: true });
    });
    return out;
  }
  members.forEach(m => out.set(m.code, resolveTemplatePrice(m, index)));
  return out;
}

/** Private discount in rupiah for a price: nominal keeps its value (never above the price), percentage follows the price. */
export function discountAmountOf(price, discountType, discountValue) {
  const p = Math.max(0, Number(price) || 0);
  const value = Number(discountValue) || 0;
  return discountType === 'percentage'
    ? Math.round((p * Math.min(100, Math.max(0, value))) / 100)
    : Math.min(p, Math.max(0, Math.round(value)));
}
