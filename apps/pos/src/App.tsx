import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Toaster } from 'react-hot-toast';
import { theme } from '@paxrest/ui';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LoadingOverlay } from '@paxrest/ui';

import MainLayout from '@/layouts/MainLayout';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import POSTerminalPage from '@/pages/pos/POSTerminalPage';
import OrdersPage from '@/pages/orders/OrdersPage';
import KitchenDisplayPage from '@/pages/kitchen/KitchenDisplayPage';
import MenuManagementPage from '@/pages/menu/MenuManagementPage';
import InventoryPage from '@/pages/inventory/InventoryPage';
import TablesPage from '@/pages/tables/TablesPage';
import DeliveryPage from '@/pages/delivery/DeliveryPage';
import ShiftsPage from '@/pages/shifts/ShiftsPage';
import StaffPage from '@/pages/staff/StaffPage';
import BranchesPage from '@/pages/branches/BranchesPage';
import CustomersPage from '@/pages/customers/CustomersPage';
import SuppliersPage from '@/pages/suppliers/SuppliersPage';
import ReportsPage from '@/pages/reports/ReportsPage';
import SettingsPage from '@/pages/settings/SettingsPage';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, initialized } = useAuth();

  if (!initialized || loading) return <LoadingOverlay fullScreen message="Loading PaxRest…" />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { session, initialized } = useAuth();
  if (!initialized) return <LoadingOverlay fullScreen />;
  if (session) return <Navigate to="/pos" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />

            {/* Protected */}
            <Route element={<AuthGuard><MainLayout /></AuthGuard>}>
              <Route path="/pos" element={<POSTerminalPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/kitchen" element={<KitchenDisplayPage />} />
              <Route path="/tables" element={<TablesPage />} />
              <Route path="/menu" element={<MenuManagementPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/delivery" element={<DeliveryPage />} />
              <Route path="/shifts" element={<ShiftsPage />} />
              <Route path="/staff" element={<StaffPage />} />
              <Route path="/branches" element={<BranchesPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            {/* Default */}
            <Route path="*" element={<Navigate to="/pos" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
