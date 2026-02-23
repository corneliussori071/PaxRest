import React from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import ListAltIcon from '@mui/icons-material/ListAlt';
import KitchenIcon from '@mui/icons-material/Kitchen';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TableBarIcon from '@mui/icons-material/TableBar';
import PeopleIcon from '@mui/icons-material/People';
import LoyaltyIcon from '@mui/icons-material/Loyalty';
import BarChartIcon from '@mui/icons-material/BarChart';
import SettingsIcon from '@mui/icons-material/Settings';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { AppLayout, type NavItem } from '@paxrest/ui';
import { useAuth } from '@/contexts/AuthContext';

const NAV_ITEMS: NavItem[] = [
  { id: 'pos',        label: 'POS Terminal',   icon: <PointOfSaleIcon />,      path: '/pos',        dividerAfter: true },
  { id: 'orders',     label: 'Orders',         icon: <ListAltIcon />,          path: '/orders' },
  { id: 'kitchen',    label: 'Kitchen Display', icon: <KitchenIcon />,         path: '/kitchen' },
  { id: 'tables',     label: 'Tables',         icon: <TableBarIcon />,         path: '/tables',     dividerAfter: true },
  { id: 'menu',       label: 'Menu',           icon: <RestaurantMenuIcon />,   path: '/menu' },
  { id: 'inventory',  label: 'Inventory',      icon: <InventoryIcon />,        path: '/inventory' },
  { id: 'suppliers',  label: 'Suppliers',      icon: <ShoppingCartIcon />,     path: '/suppliers',  dividerAfter: true },
  { id: 'delivery',   label: 'Delivery',       icon: <LocalShippingIcon />,    path: '/delivery' },
  { id: 'shifts',     label: 'Shifts & Cash',  icon: <AccessTimeIcon />,       path: '/shifts' },
  { id: 'staff',      label: 'Staff',          icon: <PeopleIcon />,           path: '/staff' },
  { id: 'customers',  label: 'Customers',      icon: <LoyaltyIcon />,          path: '/customers',  dividerAfter: true },
  { id: 'reports',    label: 'Reports',        icon: <BarChartIcon />,         path: '/reports' },
  { id: 'settings',   label: 'Settings',       icon: <SettingsIcon />,         path: '/settings' },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, company, branches, activeBranchId, signOut, switchBranch } = useAuth();

  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const activeId = NAV_ITEMS.find((n) => location.pathname.startsWith(n.path))?.id ?? 'pos';

  // Map path segment to page title
  const pageTitle = NAV_ITEMS.find((n) => n.id === activeId)?.label ?? 'POS';

  return (
    <AppLayout
      title={pageTitle}
      navItems={NAV_ITEMS}
      activeItemId={activeId}
      onNavigate={(path) => navigate(path)}
      userDisplayName={profile?.name ?? 'User'}
      userRole={profile?.role?.replace('_', ' ')}
      branchName={activeBranch?.name ?? 'Branch'}
      onLogout={signOut}
      onBranchSwitch={branches.length > 1 ? () => {
        // Simple rotate for now — could open a dialog
        const idx = branches.findIndex((b) => b.id === activeBranchId);
        const next = branches[(idx + 1) % branches.length];
        switchBranch(next.id);
      } : undefined}
    >
      <Outlet />
    </AppLayout>
  );
}
