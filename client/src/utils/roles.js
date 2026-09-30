// Role labels & which admin pages each role may open (Super Admin: everything).
// Keep in sync with the server access policy in server/src/middleware/auth.js.
export const ROLE_LABELS = {
  superadmin: 'Super Admin',
  finance: 'Keuangan',
  sales: 'Sales',
  operations: 'Operasional'
};

export const PAGE_ACCESS = {
  analytics: ['superadmin', 'finance', 'sales'],
  floorplan: ['superadmin', 'sales'],
  ops: ['superadmin', 'operations'],
  exhibitors: ['superadmin', 'finance', 'sales'],
  invoices: ['superadmin', 'finance'],
  facilities: ['superadmin', 'finance', 'sales'],
  settings: ['superadmin'],
  users: ['superadmin'],
  audit: ['superadmin']
};

export const canAccessPage = (role, page) => Boolean(role && PAGE_ACCESS[page]?.includes(role));

// Landing page after login for each role
export const HOME_PAGE = {
  superadmin: '/admin/analytics',
  finance: '/admin/invoices',
  sales: '/admin/floorplan',
  operations: '/admin/ops'
};
