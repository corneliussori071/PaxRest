import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import { theme } from '@paxrest/ui';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import HistoryPage from '@/pages/HistoryPage';
import ProfilePage from '@/pages/ProfilePage';
import DeliveryDiningIcon from '@mui/icons-material/DeliveryDining';
import HistoryIcon from '@mui/icons-material/History';
import PersonIcon from '@mui/icons-material/Person';
import { useNavigate, useLocation } from 'react-router-dom';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = [
    { label: 'Deliveries', icon: <DeliveryDiningIcon />, path: '/' },
    { label: 'History', icon: <HistoryIcon />, path: '/history' },
    { label: 'Profile', icon: <PersonIcon />, path: '/profile' },
  ];
  const currentTab = tabs.findIndex((t) => t.path === location.pathname);

  return (
    <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100 }} elevation={3}>
      <BottomNavigation
        value={currentTab === -1 ? 0 : currentTab}
        onChange={(_, idx) => navigate(tabs[idx]!.path)}
        showLabels
      >
        {tabs.map((t) => (
          <BottomNavigationAction key={t.path} label={t.label} icon={t.icon} />
        ))}
      </BottomNavigation>
    </Paper>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/" element={<AuthGuard><><DashboardPage /><BottomNav /></></AuthGuard>} />
      <Route path="/history" element={<AuthGuard><><HistoryPage /><BottomNav /></></AuthGuard>} />
      <Route path="/profile" element={<AuthGuard><><ProfilePage /><BottomNav /></></AuthGuard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Toaster position="top-center" />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
