// Who may delete a tenant: the same rule as the server (see shared/tenantPermissions.js, AGENTS.md §33)
export * from '../../../shared/tenantPermissions.js';

/** Ids of the tenant rows behind one table row (a merged row "A-01+A-02" has one per booth). */
export const tenantRowIds = (exh) => (exh?.isMerged && exh.mergedBooths?.length ? exh.mergedBooths.map(b => b.id) : [exh?.id]).filter(Boolean);

/** Booth numbers of one table row. */
export const tenantRowCodes = (exh) => (exh?.isMerged && exh.mergedBooths?.length ? exh.mergedBooths.map(b => b.code) : [exh?.booth]).filter(Boolean);
