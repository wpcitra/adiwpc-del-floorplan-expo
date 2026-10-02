// Who may delete / restore a tenant of a project (AGENTS.md §33). One rule for the page (what is rendered) and the
// server (/api/tenants/*): the Super Admin only (users.role 'superadmin').

export const canDeleteTenant = (user) => user?.role === 'superadmin';

/** Word to type before a bulk delete that contains a tenant with a payment or an invoice. */
export const BULK_CONFIRM_WORD = 'HAPUS';

const tokens = (v) => String(v ?? '').split('+').map(t => t.trim()).filter(Boolean).sort();

/**
 * The typed booth number is exactly the tenant's booth number ("A-01"; a row of several booths "A-01+A-02", in any
 * order). Letter case counts: the number has to be typed as it is shown.
 */
export function sameBoothNumber(typed, codes) {
  const want = tokens(Array.isArray(codes) ? codes.join('+') : codes);
  const got = tokens(typed);
  return want.length > 0 && want.length === got.length && want.every((c, i) => c === got[i]);
}
