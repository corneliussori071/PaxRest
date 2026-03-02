'use client';
import React from 'react';
import { Box, Container, Typography, Grid, Link as MuiLink, Stack, Divider } from '@mui/material';

export default function CustomerFooter() {
  return (
    <Box sx={{ bgcolor: '#1C2B4A', pt: 7, pb: 4, mt: 'auto' }}>
      <Container maxWidth="lg">
        <Grid container spacing={5}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="h5" sx={{ fontFamily: '"Playfair Display", serif', color: '#fff', mb: 0.5 }}>Pax Hotel</Typography>
            <Box sx={{ width: 36, height: 2, bgcolor: '#C9973A', mb: 2 }} />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, maxWidth: 280 }}>
              Exceptional hospitality and cuisine at the heart of the city. We look forward to welcoming you.
            </Typography>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Typography variant="overline" sx={{ color: '#C9973A', letterSpacing: '0.12em', display: 'block', mb: 2 }}>Dining</Typography>
            <Stack spacing={1}>
              {[{ label: 'Menu', href: '/menu' }, { label: 'Reservations', href: '/reservations' }, { label: 'Events & Suites', href: '/events' }, { label: 'My Orders', href: '/orders' }].map((l) => (
                <MuiLink key={l.label} href={l.href} underline="hover" variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', '&:hover': { color: '#C9973A' } }}>{l.label}</MuiLink>
              ))}
            </Stack>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Typography variant="overline" sx={{ color: '#C9973A', letterSpacing: '0.12em', display: 'block', mb: 2 }}>Account</Typography>
            <Stack spacing={1}>
              {[{ label: 'Sign In', href: '/login' }, { label: 'Register', href: '/register' }, { label: 'My Account', href: '/account' }].map((l) => (
                <MuiLink key={l.label} href={l.href} underline="hover" variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', '&:hover': { color: '#C9973A' } }}>{l.label}</MuiLink>
              ))}
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="overline" sx={{ color: '#C9973A', letterSpacing: '0.12em', display: 'block', mb: 2 }}>Contact</Typography>
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>123 Harmony Avenue<br />Accra, Ghana</Typography>
              <MuiLink href="tel:+233000000000" underline="hover" variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', '&:hover': { color: '#C9973A' } }}>+233 000 000 000</MuiLink>
              <MuiLink href="mailto:dining@paxhotel.com" underline="hover" variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', '&:hover': { color: '#C9973A' } }}>dining@paxhotel.com</MuiLink>
            </Stack>
          </Grid>
        </Grid>
        <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.1)' }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={1}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>&copy; {new Date().getFullYear()} Pax Hotel. All rights reserved.</Typography>
          <Stack direction="row" spacing={2}>
            {['Privacy Policy', 'Terms of Service'].map((t) => (
              <MuiLink key={t} href="#" underline="hover" variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', '&:hover': { color: '#C9973A' } }}>{t}</MuiLink>
            ))}
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
