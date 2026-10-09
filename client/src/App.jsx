import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PublicLayout from './components/layout/PublicLayout';
import LiveFloorplan from './pages/public/LiveFloorplan';
import ErrorBoundary from './components/common/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import RequireAuth, { RoleHomeRedirect } from './components/auth/RequireAuth';

// The Live Floorplan is what visitors open: it is in the main bundle. Every other page is its own file, loaded when it
// is opened, so a visitor never downloads the Studio, the invoices or the charts (AGENTS.md §41).
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/app/AdminDashboard'));
const OpsFloorplanStudio = lazy(() => import('./pages/app/OpsFloorplanStudio'));
const SalesCharts = lazy(() => import('./pages/admin/SalesCharts'));
const ExhibitorTable = lazy(() => import('./pages/admin/ExhibitorTable'));
const InvoicePage = lazy(() => import('./pages/admin/InvoicePage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const FacilityRequestsPage = lazy(() => import('./pages/admin/FacilityRequestsPage'));
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'));
const PublicFacilityRequestPage = lazy(() => import('./pages/public/PublicFacilityRequestPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
const MaintenancePage = lazy(() => import('./pages/admin/MaintenancePage'));
const InvoicePrintPage = lazy(() => import('./pages/print/InvoicePrintPage'));

const PageLoading = () => (
  <div className="h-screen w-full flex items-center justify-center bg-slate-50 text-xs font-semibold text-slate-500" role="status">Memuat…</div>
);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
        <Routes>
        {/* Public Routes */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LiveFloorplan />} />
          <Route path="/portal" element={<LiveFloorplan />} />
          {/* Public link of one published floorplan (several can be live at once) */}
          <Route path="/live/:slug" element={<LiveFloorplan />} />
        </Route>

        {/* Public Tenant Facility Request Portal */}
        <Route path="/facility-request" element={<PublicFacilityRequestPage />} />

        {/* Invoice sheet alone at A4: the source of the server's PDF and of "Print Invoice" (AGENTS.md §34) */}
        <Route path="/print/invoice/:id" element={<InvoicePrintPage />} />

        {/* Staff Login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Admin Routes (login required; each page limited to the roles in utils/roles.js) */}
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<RoleHomeRedirect />} />
          <Route path="floorplan" element={<RequireAuth page="floorplan"><AdminDashboard /></RequireAuth>} />
          <Route path="ops" element={<RequireAuth page="ops"><OpsFloorplanStudio /></RequireAuth>} />
          <Route path="analytics" element={<RequireAuth page="analytics"><SalesCharts /></RequireAuth>} />
          <Route path="exhibitors" element={<RequireAuth page="exhibitors"><ExhibitorTable /></RequireAuth>} />
          <Route path="invoices" element={<RequireAuth page="invoices"><InvoicePage /></RequireAuth>} />
          <Route path="facilities" element={<RequireAuth page="facilities"><FacilityRequestsPage /></RequireAuth>} />
          <Route path="settings" element={<RequireAuth page="settings"><SettingsPage /></RequireAuth>} />
          <Route path="users" element={<RequireAuth page="users"><UserManagementPage /></RequireAuth>} />
          <Route path="audit" element={<RequireAuth page="audit"><AuditLogPage /></RequireAuth>} />
          <Route path="maintenance" element={<RequireAuth page="maintenance"><MaintenancePage /></RequireAuth>} />
        </Route>

        {/* Shortcut Routes */}
        <Route path="/app" element={<Navigate to="/admin/floorplan" replace />} />
        <Route path="/invoices" element={<Navigate to="/admin/invoices" replace />} />
        <Route path="/facilities" element={<Navigate to="/admin/facilities" replace />} />
        <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
        </Suspense>
    </BrowserRouter>
      </AuthProvider>
  </ErrorBoundary>
);
}

export default App;
