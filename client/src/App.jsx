import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './components/layout/AdminLayout';
import PublicLayout from './components/layout/PublicLayout';
import AdminDashboard from './pages/app/AdminDashboard';
import OpsFloorplanStudio from './pages/app/OpsFloorplanStudio';
import SalesCharts from './pages/admin/SalesCharts';
import ExhibitorTable from './pages/admin/ExhibitorTable';
import InvoicePage from './pages/admin/InvoicePage';
import SettingsPage from './pages/admin/SettingsPage';
import FacilityRequestsPage from './pages/admin/FacilityRequestsPage';
import UserManagementPage from './pages/admin/UserManagementPage';
import LiveFloorplan from './pages/public/LiveFloorplan';
import PublicFacilityRequestPage from './pages/public/PublicFacilityRequestPage';
import ErrorBoundary from './components/common/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import RequireAuth, { RoleHomeRedirect } from './components/auth/RequireAuth';
import LoginPage from './pages/auth/LoginPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import MaintenancePage from './pages/admin/MaintenancePage';
import InvoicePrintPage from './pages/print/InvoicePrintPage';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
      <BrowserRouter>
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
    </BrowserRouter>
      </AuthProvider>
  </ErrorBoundary>
);
}

export default App;
