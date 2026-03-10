import React, { useState } from 'react';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton, List,
  ListItem, ListItemButton, ListItemIcon, ListItemText, Divider,
  Avatar, Menu, MenuItem, useMediaQuery, useTheme, Tooltip,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import LogoutIcon from '@mui/icons-material/Logout';
import { SHELL_BG, SHELL_BG_LIGHT } from '../theme';

const DRAWER_WIDTH = 248;
const DRAWER_COLLAPSED = 64;

/* Dark sidebar token palette */
const SIDEBAR = {
  bg: SHELL_BG,
  bgHover: SHELL_BG_LIGHT,
  bgActive: 'rgba(99,91,255,0.16)',
  text: '#C1C9D2',
  textActive: '#FFFFFF',
  accent: '#635BFF',
  divider: 'rgba(255,255,255,0.08)',
  caption: 'rgba(255,255,255,0.45)',
};

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
            bgcolor: SIDEBAR.bg,
            borderRight: 'none',
          },
        }}
      >
        {/* Logo area */}
        <Toolbar sx={{ justifyContent: collapsed ? 'center' : 'space-between', px: collapsed ? 1 : 2.5, minHeight: '56px !important' }}>
          {!collapsed && (logo || <Typography variant="h6" fontWeight={700} sx={{ color: '#fff', letterSpacing: '-0.02em' }}>PaxRest</Typography>)}
          {!isMobile && (
            <IconButton onClick={() => setDrawerOpen(!drawerOpen)} size="small" sx={{ color: SIDEBAR.text }}>
              {collapsed ? <MenuIcon /> : <ChevronLeftIcon />}
            </IconButton>
          )}
        </Toolbar>

        {/* Branch name */}
        {branchName && !collapsed && (
          <Box
            sx={{ px: 2.5, py: 1.25, cursor: onBranchSwitch ? 'pointer' : 'default', '&:hover': onBranchSwitch ? { bgcolor: SIDEBAR.bgHover } : {} }}
            onClick={onBranchSwitch}
          >
            <Typography variant="overline" sx={{ color: SIDEBAR.caption, fontSize: '0.625rem' }}>Branch</Typography>
            <Typography variant="body2" fontWeight={600} noWrap sx={{ color: '#fff' }}>{branchName}</Typography>
          </Box>
        )}

        <Box sx={{ borderBottom: `1px solid ${SIDEBAR.divider}`, mx: 2, mt: 0.5, mb: 1 }} />

        {/* Nav Items */}
        <List sx={{ flex: 1, pt: 0, px: 1 }}>
          {navItems.map((item) => (
            <React.Fragment key={item.id}>
              <ListItem disablePadding sx={{ mb: 0.25 }}>
                <Tooltip title={collapsed ? item.label : ''} placement="right">
                  <ListItemButton
                    selected={activeItemId === item.id}
                    onClick={() => { onNavigate(item.path); if (isMobile) setDrawerOpen(false); }}
                    sx={{
                      minHeight: 38,
                      px: collapsed ? 2 : 1.5,
                      py: 0.5,
                      borderRadius: '6px',
                      color: SIDEBAR.text,
                      '&:hover': { bgcolor: SIDEBAR.bgHover, color: SIDEBAR.textActive },
                      '& .MuiListItemIcon-root': { color: SIDEBAR.text, minWidth: collapsed ? 0 : 32 },
                      '&.Mui-selected': {
                        bgcolor: SIDEBAR.bgActive,
                        color: SIDEBAR.textActive,
                        '&:hover': { bgcolor: SIDEBAR.bgActive },
                        '& .MuiListItemIcon-root': { color: SIDEBAR.accent },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ justifyContent: 'center', '& .MuiSvgIcon-root': { fontSize: '1.2rem' } }}>
                      {item.icon}
                    </ListItemIcon>
                    {!collapsed && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: activeItemId === item.id ? 600 : 400 }} />}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
              {item.dividerAfter && <Box sx={{ borderBottom: `1px solid ${SIDEBAR.divider}`, mx: 1, my: 1 }} />}
            </React.Fragment>
          ))}
        </List>

        {/* User section */}
        <Box sx={{ borderTop: `1px solid ${SIDEBAR.divider}` }}>
          <Box
            sx={{ p: collapsed ? 1 : 2, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', '&:hover': { bgcolor: SIDEBAR.bgHover } }}
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            <Avatar sx={{ width: 30, height: 30, bgcolor: SIDEBAR.accent, fontSize: '0.8rem', fontWeight: 600 }}>
              {userDisplayName.charAt(0).toUpperCase()}
            </Avatar>
            {!collapsed && (
              <Box sx={{ overflow: 'hidden' }}>
                <Typography variant="body2" fontWeight={600} noWrap sx={{ color: '#fff', fontSize: '0.8125rem' }}>{userDisplayName}</Typography>
                {userRole && <Typography variant="caption" noWrap sx={{ color: SIDEBAR.caption, fontSize: '0.6875rem' }}>{userRole}</Typography>}
              </Box>
            )}
          </Box>
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
        <AppBar position="sticky" sx={{ bgcolor: SHELL_BG, color: '#fff' }}>
          <Toolbar sx={{ minHeight: '56px !important' }}>
            {isMobile && (
              <IconButton edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 1, color: '#fff' }}>
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="h6" fontWeight={600} sx={{ flex: 1, fontSize: '0.9375rem' }}>{title}</Typography>
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
