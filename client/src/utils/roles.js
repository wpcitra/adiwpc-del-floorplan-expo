// Role labels & which admin pages each role may open (Super Admin: everything).
// Keep in sync with the server access policy in server/src/middleware/auth.js.
export const ROLE_LABELS = {
  superadmin: 'Super Admin',
  finance: 'Keuangan',
  sales: 'Sales',
  operations: 'Operasional',
  developer: 'Developer'
};

// Sales: only the Studio (view the floorplan and register tenants, no editing) and Data Exhibitor (open / send invoices)
export const PAGE_ACCESS = {
  analytics: ['superadmin', 'finance'],
  floorplan: ['superadmin', 'sales'],
  ops: ['superadmin', 'operations'],
  exhibitors: ['superadmin', 'finance', 'sales'],
  invoices: ['superadmin', 'finance'],
  facilities: ['superadmin', 'finance'],
  settings: ['superadmin'],
  users: ['superadmin'],
  audit: ['superadmin'],
  maintenance: ['superadmin', 'developer']
};

// Who may edit a floorplan in the Studio (draw, move, price, save, publish). Everyone else with the page sees it read-only.
export const canEditFloorplan = (role) => role === 'superadmin';

export const canAccessPage = (role, page) => Boolean(role && PAGE_ACCESS[page]?.includes(role));

// Landing page after login for each role
export const HOME_PAGE = {
  superadmin: '/admin/analytics',
  finance: '/admin/invoices',
  sales: '/admin/floorplan',
  operations: '/admin/ops',
  developer: '/admin/maintenance'
};
