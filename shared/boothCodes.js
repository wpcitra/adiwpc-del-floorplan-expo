// Booth numbers are unique per floorplan (AGENTS.md §30): invoices, orders and the booking checkout find a booth
// by its code (§12), so two booths with one number would share one tenant, one contract and one status.
// One rule for the Studio (typing, +Next, new booths, copies) and the server (POST /floorplan/save).
// A merged code "A-01+A-02" occupies each of its numbers. Compared without case and outer spaces.

export const boothCodeKey = (code) => String(code ?? '').trim().toUpperCase();

/** The number as it is stored (AGENTS.md §40): no outer / repeated spaces, "A-01 + A-02" -> "A-01+A-02". */
export const cleanBoothCode = (code) => String(code ?? '').split('+').map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join('+');

/** The numbers a code occupies: "a-01 + A-02" -> ["A-01", "A-02"]. */
export const boothCodeTokens = (code) => [...new Set(String(code ?? '').split('+').map(boothCodeKey).filter(Boolean))];

/** true when `code` (or one of its numbers) is already used by one of `otherCodes`. */
export function boothCodeTaken(code, otherCodes = []) {
  const taken = new Set([...otherCodes].flatMap(boothCodeTokens));
  return boothCodeTokens(code).some(token => taken.has(token));
}

/** Numbers used by more than one booth of the list (one entry per booth), sorted. Empty codes are ignored. */
export function duplicateBoothCodes(codes = []) {
  const count = new Map();
  [...codes].forEach(code => boothCodeTokens(code).forEach(token => count.set(token, (count.get(token) || 0) + 1)));
  return [...count].filter(([, n]) => n > 1).map(([token]) => token).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
}

export const duplicateBoothCodeMessage = (duplicates) =>
  `Nomor booth tidak boleh sama: ${duplicates.slice(0, 8).join(', ')}${duplicates.length > 8 ? ', …' : ''} dipakai lebih dari satu booth. Ubah nomor salah satunya, lalu simpan lagi.`;
