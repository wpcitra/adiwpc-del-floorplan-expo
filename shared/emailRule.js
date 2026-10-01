// Exhibitor email rule, shared by the server and the forms (AGENTS.md §29).
// The email is OPTIONAL unless Setting > Aturan Booking says "Wajib" (`exhibitorEmailRequired`). Only spaces = empty.
// When filled it must be a valid address. An empty email is stored as NULL, never as ''.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const EMAIL_INVALID_MESSAGE = 'Format email tidak valid';
export const EMAIL_REQUIRED_MESSAGE = 'Email wajib diisi';

/** { email: string | null, error: string | null } for a value typed in a form. */
export function checkEmail(value, { required = false } = {}) {
  const email = String(value ?? '').trim();
  if (!email) return { email: null, error: required ? EMAIL_REQUIRED_MESSAGE : null };
  if (!EMAIL_RE.test(email)) return { email, error: EMAIL_INVALID_MESSAGE };
  return { email, error: null };
}
