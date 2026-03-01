'use client';
import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack, IconButton,
  Button, Divider, TextField, Chip, Avatar, Grid,
  FormControl, InputLabel, Select, MenuItem as MuiMenuItem,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import { useCartStore, type CartItem } from '@/stores/cart';
import { publicApi } from '@/lib/supabase';
import { formatCurrency } from '@paxrest/shared-utils';
import Link from 'next/link';
import type { OrderType } from '@paxrest/shared-types';

interface DeliveryZone {
  id: string; name: string; delivery_fee: number; estimated_minutes: number;
}

export default function CartPage() {
  const {
    items, orderType, deliveryFee, customerName, customerPhone, notes,
    subtotal, total, itemCount,
    setOrderType, setCustomerName, setCustomerPhone, setNotes,
    updateQuantity, removeItem, setDeliveryAddress,
    branchId, deliveryZoneId, setDeliveryZone,
  } = useCartStore();
  const [address, setAddress] = useState('');
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  // Fetch delivery zones when branchId is available
  useEffect(() => {
    if (!branchId || orderType !== 'delivery') return;
    setZonesLoading(true);
    publicApi<{ zones: DeliveryZone[] }>(`/customer/zones?branch_id=${encodeURIComponent(branchId)}`)
      .then((res) => setZones(res.data?.zones ?? []))
      .catch(() => {})
      .finally(() => setZonesLoading(false));
  }, [branchId, orderType]);

  if (items.length === 0) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <ShoppingCartIcon sx={{ fontSize: 80, color: 'grey.400', mb: 2 }} />
        <Typography variant="h5" fontWeight={600} gutterBottom>Your cart is empty</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Browse the menu and add some delicious items!
        </Typography>
        <Button component={Link} href="/menu" variant="contained" startIcon={<RestaurantMenuIcon />}>Browse Menu</Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>Your Cart</Typography>

      <Grid container spacing={3}>
        {/* Cart items */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              {items.map((item, idx) => (
                <Box key={idx}>
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>{item.name}</Typography>
                      {item.variantLabel && (
                        <Typography variant="body2" color="text.secondary">{item.variantLabel}</Typography>
                      )}
                      {item.modifiers.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {item.modifiers.map((m) => m.name).join(', ')}
                        </Typography>
                      )}
                    </Box>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <IconButton size="small" onClick={() => updateQuantity(idx, Math.max(1, item.quantity - 1))}>
                        <RemoveIcon fontSize="small" />
                      </IconButton>
                      <Typography fontWeight={600}>{item.quantity}</Typography>
                      <IconButton size="small" onClick={() => updateQuantity(idx, item.quantity + 1)}>
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Typography fontWeight={600} sx={{ minWidth: 70, textAlign: 'right' }}>
                      {formatCurrency(
                        (item.basePrice + (item.variantPriceAdjustment ?? 0) + item.modifiers.reduce((s, m) => s + m.price, 0)) * item.quantity,
                      )}
                    </Typography>
                    <IconButton size="small" color="error" onClick={() => removeItem(idx)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  {idx < items.length - 1 && <Divider sx={{ my: 1.5 }} />}
                </Box>
              ))}
            </CardContent>
          </Card>

          {/* Order Type & Details */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>Order Details</Typography>

              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                {[
                  { value: 'delivery' as const, label: '🚚 Delivery' },
                  { value: 'pickup' as const, label: '🏪 Pickup' },
                  { value: 'dine_in' as const, label: '🍽️ Dine In' },
                ].map((t) => (
                  <Chip
                    key={t.value} label={t.label}
                    variant={orderType === t.value ? 'filled' : 'outlined'}
                    color={orderType === t.value ? 'primary' : 'default'}
                    onClick={() => setOrderType(t.value)}
                  />
                ))}
              </Stack>

              {orderType === 'delivery' && (
                <Stack spacing={1.5} sx={{ mb: 2 }}>
                  <FormControl fullWidth size="small" disabled={zonesLoading}>
                    <InputLabel>Delivery Zone</InputLabel>
                    <Select
                      label="Delivery Zone"
                      value={deliveryZoneId ?? ''}
                      onChange={(e) => {
                        const zoneId = e.target.value as string;
                        const zone = zones.find((z) => z.id === zoneId);
                        if (zone) setDeliveryZone(zone.id, zone.delivery_fee);
                      }}
                    >
                      {zonesLoading && <MuiMenuItem disabled>Loading zones…</MuiMenuItem>}
                      {zones.map((z) => (
                        <MuiMenuItem key={z.id} value={z.id}>
                          {z.name} — {formatCurrency(z.delivery_fee)}
                          {z.estimated_minutes ? ` (~${z.estimated_minutes} min)` : ''}
                        </MuiMenuItem>
                      ))}
                      {!zonesLoading && zones.length === 0 && (
                        <MuiMenuItem disabled>No delivery zones available</MuiMenuItem>
                      )}
                    </Select>
                  </FormControl>
                  <TextField
                    fullWidth label="Delivery Address" size="small"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setDeliveryAddress({ line1: e.target.value, city: '', lat: 0, lng: 0 });
                    }}
                    placeholder="Enter your full delivery address"
                  />
                </Stack>
              )}

              <Stack spacing={2}>
                <TextField
                  fullWidth label="Your Name" size="small"
                  value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                />
                <TextField
                  fullWidth label="Phone Number" size="small"
                  value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                />
                <TextField
                  fullWidth label="Special Instructions" size="small" multiline rows={2}
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any allergies or special requests?"
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Order Summary */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ position: { md: 'sticky' }, top: { md: 80 } }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} gutterBottom>Order Summary</Typography>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography>Subtotal ({itemCount} items)</Typography>
                  <Typography fontWeight={600}>{formatCurrency(subtotal)}</Typography>
                </Stack>
                {orderType === 'delivery' && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography>Delivery Fee</Typography>
                    <Typography fontWeight={600}>{formatCurrency(deliveryFee)}</Typography>
                  </Stack>
                )}
                <Divider />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="h6" fontWeight={700}>Total</Typography>
                  <Typography variant="h6" fontWeight={700} color="primary">{formatCurrency(total)}</Typography>
                </Stack>
              </Stack>

              <Button
                component={Link} href="/checkout"
                variant="contained" fullWidth size="large"
                endIcon={<ArrowForwardIcon />}
                sx={{ mt: 3 }}
                disabled={!customerName || !customerPhone || (orderType === 'delivery' && (!address || !deliveryZoneId))}
              >
                Proceed to Checkout
              </Button>
              <Button component={Link} href="/menu" variant="text" fullWidth sx={{ mt: 1 }}>Continue Shopping</Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
