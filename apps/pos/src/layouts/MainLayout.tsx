import React, { useMemo } from 'react';
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
import StorefrontIcon from '@mui/icons-material/Storefront';
import { AppLayout, type NavItem } from '@paxrest/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { Permission } from '@paxrest/shared-types';

interface NavItemWithPermission extends NavItem {
  permission?: Permission;
}

const NAV_ITEMS: NavItemWithPermission[] = [
  { id: 'pos',        label: 'POS Terminal',       icon: <PointOfSaleIcon />,      path: '/pos',        permission: 'process_pos',      dividerAfter: true },
  { id: 'orders',     label: 'Orders',             icon: <ListAltIcon />,          path: '/orders',     permission: 'manage_orders' },
  { id: 'kitchen',    label: 'Kitchen Display',    icon: <KitchenIcon />,          path: '/kitchen',    permission: 'view_kitchen' },
  { id: 'tables',     label: 'Tables',             icon: <TableBarIcon />,         path: '/tables',     permission: 'manage_tables',    dividerAfter: true },
  { id: 'menu',       label: 'Menu',               icon: <RestaurantMenuIcon />,   path: '/menu',       permission: 'manage_menu' },
  { id: 'inventory',  label: 'Inventory',          icon: <InventoryIcon />,        path: '/inventory',  permission: 'manage_inventory' },
  { id: 'suppliers',  label: 'Suppliers',          icon: <ShoppingCartIcon />,     path: '/suppliers',  permission: 'manage_suppliers', dividerAfter: true },
  { id: 'delivery',   label: 'Delivery',           icon: <LocalShippingIcon />,    path: '/delivery',   permission: 'manage_delivery' },
  { id: 'shifts',     label: 'Shifts & Cash',      icon: <AccessTimeIcon />,       path: '/shifts',     permission: 'manage_shifts' },
  { id: 'staff',      label: 'Staff Management',   icon: <PeopleIcon />,           path: '/staff',      permission: 'manage_staff' },
  { id: 'branches',   label: 'Branches',           icon: <StorefrontIcon />,       path: '/branches',   permission: 'manage_branches' },
  { id: 'customers',  label: 'Customers',          icon: <LoyaltyIcon />,          path: '/customers',  permission: 'manage_loyalty',   dividerAfter: true },
  { id: 'reports',    label: 'Reports',            icon: <BarChartIcon />,         path: '/reports',    permission: 'view_reports' },
  { id: 'settings',   label: 'Settings',           icon: <SettingsIcon />,         path: '/settings',   permission: 'manage_settings' },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, company, branches, activeBranchId, signOut, switchBranch } = useAuth();

  const activeBranch = branches.find((b) => b.id === activeBranchId);

  // Filter nav items by user permissions
  const userPermissions = profile?.permissions ?? [];
  const filteredNavItems: NavItem[] = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (!item.permission) return true;
      return userPermissions.includes(item.permission);
    });
  }, [userPermissions]);

  const activeId = filteredNavItems.find((n) => location.pathname.startsWith(n.path))?.id ?? filteredNavItems[0]?.id ?? 'pos';

  // Map path segment to page title
  const pageTitle = filteredNavItems.find((n) => n.id === activeId)?.label ?? 'POS';

  return (
    <AppLayout
      title={pageTitle}
      navItems={filteredNavItems}
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
