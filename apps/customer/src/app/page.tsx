'use client';
import React from 'react';
import { Box, Container, Typography, Grid, Button, Stack } from '@mui/material';
import Link from 'next/link';

export default function HomePage() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero */}
      <Box sx={{
        position: 'relative',
        background: 'linear-gradient(135deg, #0E1B32 0%, #1C2B4A 55%, #253559 100%)',
        py: { xs: 10, md: 16 }, px: 2, overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', bottom: -60, right: -80, width: 420, height: 420, borderRadius: '50%', border: '60px solid rgba(201,151,58,0.08)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', top: -40, left: -60, width: 280, height: 280, borderRadius: '50%', border: '40px solid rgba(201,151,58,0.05)', pointerEvents: 'none' }} />
        <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1 }}>
          <Typography variant="overline" sx={{ color: '#C9973A', letterSpacing: '0.2em', display: 'block', mb: 2 }}>Fine Dining & Room Service</Typography>
          <Typography variant="h1" sx={{ fontFamily: '"Playfair Display", serif', color: '#fff', fontWeight: 700, lineHeight: 1.1, mb: 2, fontSize: { xs: '2.8rem', md: '4.5rem' } }}>Pax Hotel</Typography>
          <Box component="span" sx={{ display: 'block', width: 64, height: 2, bgcolor: '#C9973A', mb: 3 }} />
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.75)', fontWeight: 300, mb: 5, maxWidth: 520, lineHeight: 1.7 }}>
            Exceptional cuisine crafted from seasonal ingredients. Dine with us, order to your room, or arrange a private event.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button component={Link} href="/menu" variant="contained" size="large" sx={{ bgcolor: '#C9973A', color: '#fff', px: 4, py: 1.5, letterSpacing: '0.06em', '&:hover': { bgcolor: '#B5832A' } }}>Explore Menu</Button>
            <Button component={Link} href="/reservations" variant="outlined" size="large" sx={{ borderColor: 'rgba(255,255,255,0.45)', color: '#fff', px: 4, py: 1.5, letterSpacing: '0.06em', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}>Reserve a Table</Button>
          </Stack>
        </Container>
      </Box>

      {/* Services */}
      <Container maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
        <Box sx={{ textAlign: 'center', mb: 7 }}>
          <Typography variant="overline" sx={{ color: '#C9973A', letterSpacing: '0.15em' }}>A Complete Experience</Typography>
          <Typography variant="h4" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A', mt: 1 }}>More Than a Meal</Typography>
        </Box>
        <Grid container spacing={4}>
          {[
            { title: 'Dining Room', body: 'Savour a curated menu in our elegantly appointed restaurant, open for breakfast, lunch and dinner.', cta: 'View Menu', href: '/menu' },
            { title: 'Room Service', body: 'Our full menu is available for in-room dining, 24 hours a day. Order directly through this portal.', cta: 'Order Now', href: '/menu' },
            { title: 'Private Events', body: 'From intimate dinners to corporate banquets, our team will tailor every detail to your occasion.', cta: 'Enquire', href: '/contact' },
          ].map((s) => (
            <Grid key={s.title} size={{ xs: 12, md: 4 }}>
              <Box sx={{ p: 4, height: '100%', border: '1px solid #E0DBD0', borderRadius: 2, display: 'flex', flexDirection: 'column', bgcolor: '#fff', transition: 'box-shadow 0.2s, transform 0.2s', '&:hover': { boxShadow: '0 8px 32px rgba(28,43,74,0.10)', transform: 'translateY(-2px)' } }}>
                <Box sx={{ width: 36, height: 3, bgcolor: '#C9973A', mb: 3, borderRadius: 1 }} />
                <Typography variant="h6" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A', mb: 1.5 }}>{s.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1, lineHeight: 1.8, mb: 3 }}>{s.body}</Typography>
                <Button component={Link} href={s.href} variant="text" sx={{ color: '#1C2B4A', fontWeight: 600, letterSpacing: '0.06em', p: 0, alignSelf: 'flex-start', '&:hover': { bgcolor: 'transparent', color: '#C9973A' } }}>{s.cta} &rarr;</Button>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* CTA Banner */}
      <Box sx={{ bgcolor: '#F8F6F0', borderTop: '1px solid #E0DBD0', borderBottom: '1px solid #E0DBD0', py: { xs: 6, md: 8 } }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <Typography variant="h5" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A', mb: 2 }}>Ready to order?</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>Browse our seasonal menu and add items to your order in just a few steps.</Typography>
          <Button component={Link} href="/menu" variant="contained" size="large" sx={{ bgcolor: '#1C2B4A', px: 6, py: 1.5, '&:hover': { bgcolor: '#253559' }, letterSpacing: '0.06em' }}>View Full Menu</Button>
        </Container>
      </Box>
    </Box>
  );
}
