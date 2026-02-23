'use client';
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent,
  CardMedia, Button, TextField, InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { publicApi } from '@/lib/supabase';
import Link from 'next/link';

export default function HomePage() {
  // In a real app, this would fetch companies with public menus.
  // For now, show a landing page.

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero */}
      <Box sx={{
        bgcolor: 'primary.main', color: '#fff',
        py: { xs: 6, md: 10 }, px: 2, textAlign: 'center',
      }}>
        <Container maxWidth="sm">
          <Typography variant="h3" fontWeight={700} gutterBottom>
            Order Your Favorite Food
          </Typography>
          <Typography variant="h6" sx={{ opacity: 0.9, mb: 4 }}>
            Browse menus, customize your order, and get it delivered or pick up.
          </Typography>
          <TextField
            fullWidth
            placeholder="Search restaurants or dishes…"
            variant="outlined"
            sx={{
              bgcolor: '#fff', borderRadius: 2,
              '& .MuiOutlinedInput-root': { borderRadius: 2 },
            }}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
              },
            }}
          />
        </Container>
      </Box>

      {/* Featured */}
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Popular Restaurants
        </Typography>
        <Grid container spacing={3}>
          {/* Placeholder cards — in production these come from an API */}
          {[
            { name: 'Demo Restaurant Group', slug: 'demo', desc: 'Burgers, Salads, Juices & more' },
          ].map((r) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={r.slug}>
              <Card sx={{ '&:hover': { boxShadow: 4 }, transition: 'box-shadow 0.2s' }}>
                <Box sx={{ height: 160, bgcolor: 'primary.light', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <StorefrontIcon sx={{ fontSize: 64, color: '#fff' }} />
                </Box>
                <CardContent>
                  <Typography variant="h6" fontWeight={600}>{r.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{r.desc}</Typography>
                  <Button component={Link} href="/menu" variant="contained" fullWidth>View Menu</Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
