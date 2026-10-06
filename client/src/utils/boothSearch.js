// "Cari tenant / booth" of the Studio and Denah Operasional (AGENTS.md §36): booths matched by tenant name or booth number.
const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Booth objects (anything with `boothData`) matching `query`, best first: exact number, number starting with the
 * query, tenant name starting with it, then anything containing it. A leading "#" is ignored ("#A-01" = "A-01").
 */
export function searchBooths(booths, query, limit = 8) {
  const q = norm(query).replace(/^#/, '');
  if (!q) return [];
  const scored = [];
  booths.forEach(obj => {
    const data = obj?.boothData;
    if (!data) return;
    const code = norm(data.code || data.booth_number);
    const tokens = code.split('+').map(t => t.trim());
    const owner = norm(data.ownerName);
    let rank = -1;
    if (tokens.includes(q) || code === q) rank = 0;
    else if (tokens.some(t => t.startsWith(q))) rank = 1;
    else if (owner.startsWith(q) || owner.split(' ').some(w => w.startsWith(q))) rank = 2;
    else if (code.includes(q) || owner.includes(q)) rank = 3;
    if (rank >= 0) scored.push({ obj, rank, code });
  });
  return scored
    .sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code, 'id', { numeric: true }))
    .slice(0, limit)
    .map(s => s.obj);
}
