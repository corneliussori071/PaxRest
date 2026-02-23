'use client';
import React, { useState } from 'react';
import {
  AppBar, Toolbar, Container, Typography, IconButton, Badge,
  Box, Button, Drawer, List, ListItemButton, ListItemIcon,
  ListItemText, Divider, Stack, Avatar,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import HomeIcon from '@mui/icons-material/Home';
import HistoryIcon from '@mui/icons-material/History';
import LoyaltyIcon from '@mui/icons-material/Loyalty';
import PersonIcon from '@mui/icons-material/Person';
import CloseIcon from '@mui/icons-material/Close';
import Link from 'next/link';
import { useCartStore } from '@/stores/cart';

const NAV = [
  { label: 'Home', href: '/', icon: <HomeIcon /> },
  { label: 'Menu', href: '/menu', icon: <RestaurantMenuIcon /> },
  { label: 'My Orders', href: '/orders', icon: <HistoryIcon /> },
  { label: 'Loyalty', href: '/loyalty', icon: <LoyaltyIcon /> },
];

export default function CustomerHeader() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const itemCount = useCartStore((s) => s.itemCount);

  return (
    <>
      <AppBar position="sticky" color="default" elevation={1} sx={{ bgcolor: '#fff' }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ gap: 1 }}>
            <IconButton edge="start" onClick={() => setDrawerOpen(true)} sx={{ display: { md: 'none' } }}>
              <MenuIcon />
            </IconButton>

            <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
              <RestaurantMenuIcon color="primary" />
              <Typography variant="h6" fontWeight={700} color="primary">PaxRest</Typography>
            </Link>

            {/* Desktop nav */}
            <Stack direction="row" spacing={1} sx={{ ml: 4, display: { xs: 'none', md: 'flex' } }}>
              {NAV.map((n) => (
                <Button key={n.href} component={Link} href={n.href} color="inherit" startIcon={n.icon}>{n.label}</Button>
              ))}
            </Stack>

            <Box sx={{ flexGrow: 1 }} />

            <IconButton component={Link} href="/cart">
              <Badge badgeContent={itemCount} color="primary">
                <ShoppingCartIcon />
              </Badge>
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Mobile drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 280, pt: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2 }}>
            <Typography variant="h6" fontWeight={700} color="primary">PaxRest</Typography>
            <IconButton onClick={() => setDrawerOpen(false)}><CloseIcon /></IconButton>
          </Box>
          <Divider sx={{ my: 1 }} />
          <List>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                <ListItemButton onClick={() => setDrawerOpen(false)}>
                  <ListItemIcon>{n.icon}</ListItemIcon>
                  <ListItemText primary={n.label} />
                </ListItemButton>
              </Link>
            ))}
          </List>
        </Box>
      </Drawer>
    </>
  );
}
