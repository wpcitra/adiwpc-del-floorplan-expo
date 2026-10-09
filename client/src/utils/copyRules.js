// Copies of canvas objects (Duplikasi, Ctrl/Cmd + drag, Ctrl/Cmd + C / V, also between floorplans): AGENTS.md §26.
// A copy is the original's full serialized form (Fabric toObject + these custom properties), deep-copied, so it
// looks exactly like the original: size, colours, text & text styles, corners, rotation, flip, skew, caption,
// visibility, lock... Only the identity and the position change. No template and no "Jadikan Default" style is
// involved (those are for new elements from the catalog). Pure module (no Fabric), tested in server/test/.

// Custom properties a copy carries (the save / history lists + the older vector palette flags)
export const COPY_PROPS = [
  'isBooth', 'boothData', 'isVenueItem', 'venueData', 'isCustomGroup', 'strokeUniform', 'noScaleCache',
  'id', 'name', 'src', 'isLocked', 'isOpsItem', 'isBasicShape', 'shapeType'
];

// A booth copy is a new, empty booth: same size & settings, new code, no tenant / contract data
export const BOOTH_TENANT_FIELDS = [
  'ownerName', 'owner_name', 'brandCategory', 'brand_category', 'exhibitorId', 'exhibitor_id', 'picName', 'pic_name',
  'email', 'phone', 'registeredBy', 'registrationSource', 'orderId', 'invoiceId', 'invoiceNumber', 'paymentStatus',
  'paidAmount', 'discountType', 'discountValue', 'discountAmount', 'discountReason', 'mergeSeparate', 'isMerged', 'mergedFrom', 'priceLocked'
];

export { boothCodeTokens, boothCodeTaken, duplicateBoothCodes, cleanBoothCode } from '../../../shared/boothCodes.js';

let counter = 0;
export const newCopyId = (prefix) => `${prefix}_${Date.now()}_${(counter++ % 1000).toString().padStart(3, '0')}${Math.floor(Math.random() * 1000)}`;

/** Next free booth code after `code` with the same prefix and zero padding ("A-04" -> "A-05", skipping used ones). */
export function nextBoothCode(code, used = new Set()) {
  const taken = new Set([...used].map(c => String(c || '').trim().toUpperCase()));
  const base = String(code || 'A-00').split('+')[0].trim();
  const m = base.match(/^(.*?)(\d+)$/);
  const prefix = m ? m[1] : `${base}-`;
  const width = m ? m[2].length : 2;
  let n = m ? parseInt(m[2], 10) : 0;
  let candidate;
  do {
    n += 1;
    candidate = `${prefix}${String(n).padStart(width, '0')}`;
  } while (taken.has(candidate.toUpperCase()));
  return candidate;
}

/**
 * Serialized object -> serialized copy.
 *   dx / dy     offset in canvas px (e.g. +1 m for Duplikasi, 0 for the copy left behind by Ctrl/Cmd + drag)
 *   usedCodes   Set of booth codes on the canvas (updated with the new code)
 *   allowBooths false in Denah Operasional (booths belong to the sales layer): a booth gives null
 *   opsLayer    true in Denah Operasional: the copy belongs to the operational layer
 */
export function prepareCopy(raw, { dx = 0, dy = 0, usedCodes = new Set(), allowBooths = true, opsLayer = false } = {}) {
  if (!raw) return null;
  const copy = JSON.parse(JSON.stringify(raw));
  if (copy.isBooth && !allowBooths) return null;
  copy.left = (Number(copy.left) || 0) + dx;
  copy.top = (Number(copy.top) || 0) + dy;
  if (copy.id) copy.id = newCopyId('obj');

  if (copy.isBooth && copy.boothData) {
    const code = nextBoothCode(copy.boothData.code, usedCodes);
    usedCodes.add(code);
    const data = { ...copy.boothData };
    BOOTH_TENANT_FIELDS.forEach(k => { delete data[k]; });
    copy.boothData = {
      ...data,
      id: newCopyId('booth'),
      code,
      status: data.status === 'maintenance' ? 'maintenance' : 'available',
      ownerName: ''
    };
    if (copy.boothData.booth_number !== undefined) copy.boothData.booth_number = code;
  }

  if (copy.venueData) {
    const fromOpsLayer = Boolean(copy.isOpsItem);
    copy.venueData.id = newCopyId(copy.venueData.lib ? `el_${copy.venueData.type}` : `venue_${copy.venueData.type || 'item'}`);
    // Links to other objects belong to the original (a copy placed elsewhere is not anchored / connected)
    delete copy.venueData.anchor;
    delete copy.venueData.anchorOrphaned;
    delete copy.venueData.connections;
    // Something new in the operational layer is internal until a Super Admin publishes it
    if (opsLayer && !fromOpsLayer) copy.venueData.publicVisible = false;
  }

  // The copy belongs to the layer it is pasted into
  if (opsLayer) copy.isOpsItem = true;
  else delete copy.isOpsItem;
  delete copy.isSalesLayer;
  delete copy.opsOrigOpacity;
  delete copy.isOpsOverlay;
  return copy;
}
