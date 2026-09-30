import crypto from 'crypto';

// Public view sanitizing (AGENTS.md §20): what the Live Floorplan / visitors may receive from a floorplan.
// Staff endpoints keep the full data; the public view gets booth identity, size, list price, tenant brand
// and status only: never PIC names, emails, phone numbers, private discounts or internal elements.

// boothData fields a visitor may see
const PUBLIC_BOOTH_FIELDS = [
  'id', 'code', 'booth_number', 'category', 'shape', 'status', 'price', 'widthM', 'heightM', 'gridScale',
  'ownerName', 'brandCategory', 'facilities', 'exhibitorId', 'mergeSeparate', 'cornerPct', 'isMerged', 'mergedFrom'
];
// booth rows (GET /floorplan/active, /:id) a visitor may see
const PUBLIC_BOOTH_ROW_FIELDS = [
  'id', 'booth_number', 'code', 'category', 'shape', 'price', 'status', 'owner_name', 'ownerName',
  'exhibitor_id', 'merge_separate', 'dimensions_meters', 'widthM', 'heightM', 'facilities', 'coordinates'
];
// metadata keys a visitor may see (the exported booths / venue_elements lists carry discounts: dropped)
const PUBLIC_METADATA_KEYS = ['schema_version', 'event', 'floorplan', 'display', 'venue', 'title', 'id'];

// Exhibitor IDs are derived from the email: the public view only gets an opaque per-floorplan alias
// (same alias for the same exhibitor, enough for auto-merge grouping; not linkable to an email).
const ALIAS_SALT = process.env.PUBLIC_ALIAS_SALT || crypto.randomBytes(16).toString('hex');
export const publicExhibitorAlias = (floorplanId, exhibitorId) => (exhibitorId
  ? `PX-${crypto.createHash('sha256').update(`${ALIAS_SALT}:${floorplanId}:${exhibitorId}`).digest('hex').slice(0, 12)}`
  : '');

const pick = (obj, keys) => {
  const out = {};
  keys.forEach(k => { if (obj && obj[k] !== undefined) out[k] = obj[k]; });
  return out;
};

// Library elements the admin marked internal (CCTV, panel listrik, ...) are not sent to visitors
const isInternalElement = (o) => Boolean(o?.venueData?.lib && o.venueData.publicVisible === false);

export function publicCanvas(canvas, floorplanId) {
  if (!canvas || !Array.isArray(canvas.objects)) return canvas;
  return {
    ...canvas,
    objects: canvas.objects
      .filter(o => !isInternalElement(o))
      .map(o => {
        if (!o?.isBooth || !o.boothData) return o;
        const boothData = pick(o.boothData, PUBLIC_BOOTH_FIELDS);
        if (boothData.exhibitorId) boothData.exhibitorId = publicExhibitorAlias(floorplanId, boothData.exhibitorId);
        return { ...o, boothData };
      })
  };
}

export function publicBoothRows(rows, floorplanId) {
  return (rows || []).map(r => {
    const out = pick(r, PUBLIC_BOOTH_ROW_FIELDS);
    if (out.exhibitor_id) out.exhibitor_id = publicExhibitorAlias(floorplanId, out.exhibitor_id);
    return out;
  });
}

export function publicMetadata(meta) {
  return meta && typeof meta === 'object' ? pick(meta, PUBLIC_METADATA_KEYS) : meta;
}

export function publicVenueItems(items) {
  return (items || []).filter(v => v?.properties?.publicVisible !== false);
}

// The whole floorplan payload of GET /floorplan/active and /floorplan/:id in the public view
export function publicFloorplanPayload(floorplan) {
  return {
    ...floorplan,
    canvas_fabric_json: publicCanvas(floorplan.canvas_fabric_json, floorplan.id),
    metadata: publicMetadata(floorplan.metadata),
    booths: publicBoothRows(floorplan.booths, floorplan.id),
    venueItems: publicVenueItems(floorplan.venueItems)
  };
}

// Invoice template settings for visitors: no signature image (it could be copied onto forged documents)
export function publicInvoiceConfig(config) {
  if (!config || typeof config !== 'object') return config;
  return { ...config, signatureImage: '', signatureImageUrl: '', showSignatureImage: false };
}
