import crypto from 'crypto';

// Exhibitor identity (see AGENTS.md §18): booths are merged per exhibitor ID, never per brand-name text.
// The ID is derived from the registration email (stable, unique per exhibitor); registrations without an
// email (old data) fall back to the normalized company name.
const norm = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12).toUpperCase();

export function exhibitorIdFor(email, companyName) {
  const e = norm(email);
  if (e && e.includes('@')) return `EXH-${hash(e)}`;
  const c = norm(companyName);
  return c ? `EXH-N-${hash(c)}` : '';
}
