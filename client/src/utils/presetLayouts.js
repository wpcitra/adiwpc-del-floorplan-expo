import { DEFAULT_GRID_SCALE } from './floorplanUtils';

/**
 * Generate starter floorplan data.
 * Supports clean blank canvas or custom user-saved preset objects.
 */
export function generatePresetFloorplanData(presetType = 'blank', options = {}) {
  const {
    title = 'Denah Pameran Baru',
    venue = 'Jakarta Convention Center (Hall A)',
    gridScale = DEFAULT_GRID_SCALE,
    presetObj = null
  } = options;

  // Handle custom preset object if passed in options or presetType
  const targetPreset = presetObj || (typeof presetType === 'object' ? presetType : null);
  if (targetPreset && targetPreset.fabricJson) {
    return {
      fabricJson: targetPreset.fabricJson,
      metadata: targetPreset.metadata || {
        schema_version: '1.0',
        event: { id: 'EVT-2026-001', title, venue, created_at: new Date().toISOString() },
        booths: [],
        venue_elements: []
      },
      booths: targetPreset.metadata?.booths || [],
      venueElements: targetPreset.metadata?.venue_elements || []
    };
  }

  // Blank canvas layout (default starting point with clean grid)
  return {
    fabricJson: { version: '6.0.0', objects: [] },
    metadata: {
      schema_version: '1.0',
      event: { id: 'EVT-2026-001', title, venue, created_at: new Date().toISOString() },
      booths: [],
      venue_elements: []
    },
    booths: [],
    venueElements: []
  };
}
