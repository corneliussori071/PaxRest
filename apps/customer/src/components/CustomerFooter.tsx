'use client';
import React from 'react';
import { Box, Container, Typography, Grid, Link as MuiLink, Stack, Divider } from '@mui/material';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';

export default function CustomerFooter() {
  return (
    <Box sx={{ bgcolor: 'grey.100', mt: 'auto', pt: 6, pb: 3 }}>
      <Container maxWidth="lg">
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack direction="row" alignItems="center" spacing={1} mb={1}>
              <RestaurantMenuIcon color="primary" />
              <Typography variant="h6" fontWeight={700} color="primary">PaxRest</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              The complete restaurant ordering platform. Browse menus, order online, and enjoy great food.
            </Typography>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>Quick Links</Typography>
            <Stack spacing={0.5}>
              <MuiLink href="/" underline="hover" color="text.secondary" variant="body2">Home</MuiLink>
              <MuiLink href="/menu" underline="hover" color="text.secondary" variant="body2">Menu</MuiLink>
              <MuiLink href="/orders" underline="hover" color="text.secondary" variant="body2">My Orders</MuiLink>
            </Stack>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>Support</Typography>
            <Stack spacing={0.5}>
              <MuiLink href="#" underline="hover" color="text.secondary" variant="body2">Help Center</MuiLink>
              <MuiLink href="#" underline="hover" color="text.secondary" variant="body2">Contact Us</MuiLink>
              <MuiLink href="#" underline="hover" color="text.secondary" variant="body2">Privacy Policy</MuiLink>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>Download Our App</Typography>
            <Typography variant="body2" color="text.secondary">
              Coming soon on iOS and Android.
            </Typography>
          </Grid>
        </Grid>
        <Divider sx={{ my: 3 }} />
        <Typography variant="body2" color="text.secondary" textAlign="center">
          &copy; {new Date().getFullYear()} PaxRest. All rights reserved.
        </Typography>
      </Container>
    </Box>
  );
}
