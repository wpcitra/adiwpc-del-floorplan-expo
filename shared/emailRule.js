// Exhibitor email (AGENTS.md §29): the registration forms no longer ask for an email; WhatsApp is the contact.
// An email may still arrive from data already on file (an existing tenant, older registrations): a valid one is
// kept, anything else is stored as NULL. It is never required and never blocks a registration.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The email to store: the trimmed address when valid, otherwise null. */
export function cleanEmail(value) {
  const email = String(value ?? '').trim();
  return EMAIL_RE.test(email) ? email : null;
}
