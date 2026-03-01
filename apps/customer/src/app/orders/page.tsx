'use client';
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack,
  Chip, Divider, Button, Skeleton, TextField, InputAdornment, Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { publicApi } from '@/lib/supabase';
import { useCustomerAuth } from '@/stores/customerAuth';
import { useCartStore } from '@/stores/cart';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';
import type { OrderStatus } from '@paxrest/shared-types';
import Link from 'next/link';

interface OrderSummary {
  id: string;
  order_number: number;
  status: OrderStatus;
  order_type: string;
  total: number;
  created_at: string;
  item_count: number;
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'> = {
  awaiting_approval: 'warning',
  pending: 'warning',
  confirmed: 'info',
  preparing: 'primary',
  ready: 'success',
  out_for_delivery: 'info',
  delivered: 'success',
  completed: 'success',
  cancelled: 'error',
};

export default function OrdersPage() {
  const { profile } = useCustomerAuth();
  const branchId = useCartStore((s) => s.branchId);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [searched, setSearched] = useState(false);

  // Auto-load account orders when signed in
  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    setSearched(true);
    const params = new URLSearchParams({ page: '1', page_size: '20' });
    if (branchId) params.set('branch_id', branchId);
    publicApi<{ orders: OrderSummary[]; total: number }>(`/customer/my-orders?${params}`)
      .then((res) => setOrders(res.data?.orders ?? []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [profile, branchId]);

  const handleSearch = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await publicApi<{ data: OrderSummary[] }>(`/orders/list?customer_phone=${encodeURIComponent(phone)}&page_size=20`);
      setOrders(res.data?.data ?? []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>My Orders</Typography>

      {/* Phone lookup  only when not signed in */}
      {!profile && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter your phone number to find your orders, or{' '}
            <Link href="/account" style={{ fontWeight: 600 }}>sign in</Link> for full access.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
            <TextField
              fullWidth size="small" placeholder="Phone number"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> },
              }}
            />
            <Button variant="contained" onClick={handleSearch} disabled={loading}>Search</Button>
          </Stack>
        </>
      )}

      {profile && (
        <Alert
          severity="success"
          action={<Button size="small" component={Link} href="/account">My Account</Button>}
          sx={{ mb: 3 }}
        >
          Showing orders for <strong>{profile.name}</strong>
        </Alert>
      )}

      {loading && Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={100} sx={{ mb: 2 }} />
      ))}

      {!loading && searched && orders.length === 0 && (
        <Box textAlign="center" py={6}>
          <ReceiptLongIcon sx={{ fontSize: 60, color: 'grey.400', mb: 1 }} />
          <Typography color="text.secondary">No orders found.</Typography>
        </Box>
      )}

      {orders.map((order) => (
        <Card key={order.id} sx={{ mb: 2, '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s' }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1" fontWeight={700}>
                Order #{order.order_number}
              </Typography>
              <Chip
                label={order.status.replace(/_/g, ' ')}
                color={STATUS_COLORS[order.status] || 'default'}
                size="small"
              />
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {formatDateTime(order.created_at)}  {order.order_type.replace('_', ' ')}
              </Typography>
              <Typography variant="subtitle2" fontWeight={600}>{formatCurrency(order.total)}</Typography>
            </Stack>
            <Button component={Link} href={`/track/${order.id}`} size="small" sx={{ mt: 1 }}>View Details</Button>
          </CardContent>
        </Card>
      ))}
    </Container>
  );
}
