'use client';
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack,
  Chip, Divider, Button, Skeleton, TextField, InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { publicApi } from '@/lib/supabase';
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
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [searched, setSearched] = useState(false);

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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Enter your phone number to find your orders.
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

      {loading && Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={100} sx={{ mb: 2 }} />
      ))}

      {!loading && searched && orders.length === 0 && (
        <Box textAlign="center" py={6}>
          <ReceiptLongIcon sx={{ fontSize: 60, color: 'grey.400', mb: 1 }} />
          <Typography color="text.secondary">No orders found for this phone number.</Typography>
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
                label={order.status.replace('_', ' ')}
                color={STATUS_COLORS[order.status] || 'default'}
                size="small"
              />
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {formatDateTime(order.created_at)} · {order.order_type.replace('_', ' ')}
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
