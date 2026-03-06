'use client';
import React, { useState } from 'react';
import {
  AppBar, Toolbar, Container, Typography, IconButton, Badge,
  Box, Button, Drawer, List, ListItemButton, ListItemText,
  Divider, Stack, Chip, Tooltip,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import CloseIcon from '@mui/icons-material/Close';
import Link from 'next/link';
import { useCartStore } from '@/stores/cart';
import { useCustomerAuth } from '@/stores/customerAuth';

const NAV = [
  { label: 'Dining', href: '/menu' },
  { label: 'Reservations', href: '/reservations' },
  { label: 'Events & Suites', href: '/events' },
  { label: 'Services', href: '/services' },
  { label: 'My Orders', href: '/orders' },
];

export default function CustomerHeader() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const itemCount = useCartStore((s) => s.itemCount);
  const branchName = useCartStore((s) => s.branchName);
  const clearBranch = useCartStore((s) => s.setBranch);
  const profile = useCustomerAuth((s) => s.profile);

  const handleChangeBranch = () => clearBranch('', '', '');

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: '#fff', borderBottom: '1px solid #E0DBD0' }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ height: 72, gap: 2 }}>
            {/* Mobile menu */}
            <IconButton
              edge="start"
              onClick={() => setDrawerOpen(true)}
              sx={{ display: { md: 'none' }, color: 'text.primary' }}
            >
              <MenuIcon />
            </IconButton>

            {/* Brand */}
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                <Typography
                  sx={{
                    fontFamily: '"Playfair Display", Georgia, serif',
                    fontWeight: 700,
                    fontSize: '1.35rem',
                    color: '#1C2B4A',
                    letterSpacing: '0.02em',
                  }}
                >
                  Pax
                </Typography>
                <Typography
                  sx={{
                    fontFamily: '"Playfair Display", Georgia, serif',
                    fontWeight: 400,
                    fontStyle: 'italic',
                    fontSize: '1.35rem',
                    color: '#C9973A',
                    letterSpacing: '0.02em',
                  }}
                >
                  Hotel
                </Typography>
              </Box>
            </Link>

            {/* Desktop nav */}
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ ml: 5, display: { xs: 'none', md: 'flex' } }}
            >
              {NAV.map((n) => (
                <Button
                  key={n.href}
                  component={Link}
                  href={n.href}
                  sx={{
                    color: 'text.primary',
                    fontWeight: 400,
                    fontSize: '0.875rem',
                    letterSpacing: '0.04em',
                    px: 2,
                    '&:hover': { color: '#C9973A', bgcolor: 'transparent' },
                  }}
                >
                  {n.label}
                </Button>
              ))}
            </Stack>

            <Box sx={{ flexGrow: 1 }} />

            {/* Branch */}
            {branchName && (
              <Tooltip title="Change location">
                <Chip
                  icon={<LocationOnOutlinedIcon sx={{ fontSize: '0.9rem !important' }} />}
                  label={branchName}
                  size="small"
                  onClick={handleChangeBranch}
                  sx={{
                    display: { xs: 'none', sm: 'flex' },
                    bgcolor: 'transparent',
                    border: '1px solid #E0DBD0',
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    '&:hover': { borderColor: '#C9973A', color: '#C9973A' },
                  }}
                />
              </Tooltip>
            )}

            {/* Account */}
            <Button
              component={Link}
              href="/account"
              startIcon={<PersonOutlineIcon sx={{ fontSize: '1.1rem !important' }} />}
              sx={{
                color: 'text.primary',
                fontWeight: 400,
                fontSize: '0.875rem',
                display: { xs: 'none', sm: 'flex' },
                '&:hover': { color: '#C9973A', bgcolor: 'transparent' },
              }}
            >
              {profile?.name ?? 'Account'}
            </Button>

            {/* Cart */}
            <IconButton
              component={Link}
              href="/cart"
              sx={{ color: '#1C2B4A' }}
            >
              <Badge
                badgeContent={itemCount}
                sx={{
                  '& .MuiBadge-badge': {
                    bgcolor: '#C9973A',
                    color: '#fff',
                    fontSize: '0.65rem',
                    minWidth: 18,
                    height: 18,
                  },
                }}
              >
                <ShoppingCartIcon sx={{ fontSize: '1.3rem' }} />
              </Badge>
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Mobile Drawer */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 280, bgcolor: '#1C2B4A' } }}
      >
        <Box sx={{ p: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
            <Box>
              <Typography sx={{ fontFamily: '"Playfair Display", serif', color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>
                Pax <Box component="span" sx={{ fontStyle: 'italic', color: '#C9973A' }}>Hotel</Box>
              </Typography>
            </Box>
            <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: '#fff' }}>
              <CloseIcon />
            </IconButton>
          </Stack>

          <List disablePadding>
            {NAV.map((n) => (
              <ListItemButton
                key={n.href}
                component={Link}
                href={n.href}
                onClick={() => setDrawerOpen(false)}
                sx={{
                  color: '#E8E0D4',
                  borderRadius: 1,
                  mb: 0.5,
                  '&:hover': { color: '#C9973A', bgcolor: 'rgba(255,255,255,0.05)' },
                }}
              >
                <ListItemText
                  primary={n.label}
                  slotProps={{ primary: { sx: { fontWeight: 400, fontSize: '0.95rem', letterSpacing: '0.04em' } } }}
                />
              </ListItemButton>
            ))}

            <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.12)' }} />

            <ListItemButton
              component={Link}
              href="/account"
              onClick={() => setDrawerOpen(false)}
              sx={{ color: '#E8E0D4', borderRadius: 1, '&:hover': { color: '#C9973A', bgcolor: 'rgba(255,255,255,0.05)' } }}
            >
              <ListItemText
                primary={profile?.name ?? 'Account'}
                slotProps={{ primary: { sx: { fontWeight: 400, fontSize: '0.95rem', letterSpacing: '0.04em' } } }}
              />
            </ListItemButton>

            {branchName && (
              <Box sx={{ mt: 2, px: 2 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Location
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: '#C9973A', cursor: 'pointer', mt: 0.5 }}
                  onClick={() => { handleChangeBranch(); setDrawerOpen(false); }}
                >
                  {branchName} (change)
                </Typography>
              </Box>
            )}
          </List>
        </Box>
      </Drawer>
    </>
  );
}
