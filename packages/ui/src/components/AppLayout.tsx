import React, { useState } from 'react';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton, List,
  ListItem, ListItemButton, ListItemIcon, ListItemText, Divider,
  Avatar, Menu, MenuItem, useMediaQuery, useTheme, Tooltip,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import LogoutIcon from '@mui/icons-material/Logout';

const DRAWER_WIDTH = 260;
const DRAWER_COLLAPSED = 64;

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
  dividerAfter?: boolean;
}

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  navItems: NavItem[];
  activeItemId: string;
  onNavigate: (path: string) => void;
  userDisplayName: string;
  userRole?: string;
  branchName?: string;
  onLogout: () => void;
  onBranchSwitch?: () => void;
  headerActions?: React.ReactNode;
  logo?: React.ReactNode;
}

export function AppLayout({
  children, title, navItems, activeItemId, onNavigate,
  userDisplayName, userRole, branchName,
  onLogout, onBranchSwitch, headerActions, logo,
}: AppLayoutProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const collapsed = !isMobile && !drawerOpen;
  const width = collapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Sidebar */}
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? drawerOpen : true}
        onClose={() => setDrawerOpen(false)}
        sx={{
          width,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width,
            transition: 'width 0.2s',
            overflowX: 'hidden',
            boxSizing: 'border-box',
          },
        }}
      >
        {/* Logo area */}
        <Toolbar sx={{ justifyContent: collapsed ? 'center' : 'space-between', px: collapsed ? 1 : 2 }}>
          {!collapsed && (logo || <Typography variant="h6" fontWeight={700} color="primary">PaxRest</Typography>)}
          {!isMobile && (
            <IconButton onClick={() => setDrawerOpen(!drawerOpen)} size="small">
              {collapsed ? <MenuIcon /> : <ChevronLeftIcon />}
            </IconButton>
          )}
        </Toolbar>
        <Divider />

        {/* Branch name */}
        {branchName && !collapsed && (
          <Box
            sx={{ px: 2, py: 1, cursor: onBranchSwitch ? 'pointer' : 'default' }}
            onClick={onBranchSwitch}
          >
            <Typography variant="caption" color="text.secondary">Branch</Typography>
            <Typography variant="body2" fontWeight={600} noWrap>{branchName}</Typography>
          </Box>
        )}

        {/* Nav Items */}
        <List sx={{ flex: 1, pt: 1 }}>
          {navItems.map((item) => (
            <React.Fragment key={item.id}>
              <ListItem disablePadding>
                <Tooltip title={collapsed ? item.label : ''} placement="right">
                  <ListItemButton
                    selected={activeItemId === item.id}
                    onClick={() => { onNavigate(item.path); if (isMobile) setDrawerOpen(false); }}
                    sx={{
                      minHeight: 44,
                      px: collapsed ? 2 : 2.5,
                      borderRadius: 1,
                      mx: 1,
                      '&.Mui-selected': { bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' }, '& .MuiListItemIcon-root': { color: '#fff' } },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>
                      {item.icon}
                    </ListItemIcon>
                    {!collapsed && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.875rem' }} />}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
              {item.dividerAfter && <Divider sx={{ my: 1 }} />}
            </React.Fragment>
          ))}
        </List>

        {/* User section */}
        <Divider />
        <Box
          sx={{ p: collapsed ? 1 : 2, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
            {userDisplayName.charAt(0).toUpperCase()}
          </Avatar>
          {!collapsed && (
            <Box sx={{ overflow: 'hidden' }}>
              <Typography variant="body2" fontWeight={600} noWrap>{userDisplayName}</Typography>
              {userRole && <Typography variant="caption" color="text.secondary" noWrap>{userRole}</Typography>}
            </Box>
          )}
        </Box>
        <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
          <MenuItem onClick={() => { setAnchorEl(null); onLogout(); }}>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
            Sign Out
          </MenuItem>
        </Menu>
      </Drawer>

      {/* Main Content */}
      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" color="inherit" sx={{ bgcolor: 'background.paper' }}>
          <Toolbar>
            {isMobile && (
              <IconButton edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 1 }}>
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>{title}</Typography>
            {headerActions}
          </Toolbar>
        </AppBar>
        <Box sx={{ flex: 1, p: { xs: 2, md: 3 }, overflow: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
