import { LEGACY_KEYS, safeRemove, storageReport } from './safeStorage';
import { keepDraft, pruneDrafts } from './localDraft';

// Runs once when the app opens (main.jsx): older versions mirrored the whole floorplan canvas (with base64 images)
// and the invoice layout in localStorage, which filled the ~5 MB quota ("The quota has been exceeded.").
//   1. The old local draft copy is moved to IndexedDB (kept 14 days, id "legacy") instead of being thrown away. It is
//      NOT pushed to the server automatically: the server copy is the same data or newer, and an old browser copy
//      must never overwrite it.
//   2. Every legacy key is removed from localStorage, so the quota is free again.
export async function cleanupLegacyStorage() {
  let report = [];
  try {
    report = storageReport().filter(r => LEGACY_KEYS.includes(r.key));
    if (!report.length) { pruneDrafts(); return { removed: [] }; }

    let fabricJson = null;
    let metadata = null;
    try { fabricJson = JSON.parse(localStorage.getItem('floorplan_draft_fabric') || 'null'); } catch (e) { fabricJson = null; }
    try { metadata = JSON.parse(localStorage.getItem('floorplan_draft_data') || 'null'); } catch (e) { metadata = null; }
    if (fabricJson?.objects?.length) {
      await keepDraft('legacy', { fabricJson, metadata }, 'Salinan draft lama dari localStorage');
    }
  } catch (e) { /* storage blocked: nothing to clean */ }

  LEGACY_KEYS.forEach(safeRemove);
  pruneDrafts();
  return { removed: report };
}
