'use client';
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack,
  Stepper, Step, StepLabel, Chip, Divider, Button, Skeleton,
  LinearProgress,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { publicApi, supabase } from '@/lib/supabase';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';
import type { OrderStatus } from '@paxrest/shared-types';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const ORDER_STEPS = [
  { status: 'pending' as OrderStatus, label: 'Order Placed', icon: <AccessTimeIcon /> },
  { status: 'confirmed' as OrderStatus, label: 'Confirmed', icon: <CheckCircleIcon /> },
  { status: 'preparing' as OrderStatus, label: 'Preparing', icon: <RestaurantIcon /> },
  { status: 'ready' as OrderStatus, label: 'Ready', icon: <DoneAllIcon /> },
  { status: 'out_for_delivery' as OrderStatus, label: 'On the Way', icon: <LocalShippingIcon /> },
  { status: 'delivered' as OrderStatus, label: 'Delivered', icon: <DoneAllIcon /> },
];

const PICKUP_STEPS = ORDER_STEPS.filter((s) => s.status !== 'out_for_delivery');

interface OrderDetail {
  id: string;
  order_number: number;
  status: OrderStatus;
  order_type: string;
  subtotal: number;
  tax: number;
  discount: number;
  delivery_fee: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: { name: string; quantity: number; unit_price: number; modifiers: any[] }[];
}

export default function TrackOrderPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch order
  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await publicApi<OrderDetail>(`/orders/get?id=${orderId}`);
        if (res.data) setOrder(res.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  // Realtime subscription for order status updates
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-track-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      }, (payload) => {
        setOrder((prev) => prev ? { ...prev, ...payload.new } as OrderDetail : null);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Skeleton variant="rounded" height={200} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={300} />
      </Container>
    );
  }

  if (!order) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>Order not found</Typography>
        <Button component={Link} href="/menu" variant="contained">Browse Menu</Button>
      </Container>
    );
  }

  const steps = order.order_type === 'delivery' ? ORDER_STEPS : PICKUP_STEPS;
  const activeStepIdx = steps.findIndex((s) => s.status === order.status);
  const isCancelled = order.status === 'cancelled';
  const isComplete = order.status === 'delivered' || order.status === 'completed';

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Order #{order.order_number}
      </Typography>

      {/* Status banner */}
      <Card sx={{
        mb: 3,
        bgcolor: isCancelled ? 'error.light' : isComplete ? 'success.light' : 'primary.light',
        color: '#fff',
      }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={700}>
            {isCancelled ? '❌ Order Cancelled' : isComplete ? '✅ Order Complete' : '⏳ ' + (steps[activeStepIdx]?.label || order.status)}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9, mt: 1 }}>
            Placed {formatDateTime(order.created_at)}
          </Typography>
        </CardContent>
      </Card>

      {/* Progress stepper */}
      {!isCancelled && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stepper activeStep={activeStepIdx} alternativeLabel>
              {steps.map((step) => (
                <Step key={step.status} completed={steps.indexOf(step) <= activeStepIdx}>
                  <StepLabel>{step.label}</StepLabel>
                </Step>
              ))}
            </Stepper>
            {!isComplete && <LinearProgress sx={{ mt: 2, borderRadius: 2 }} />}
          </CardContent>
        </Card>
      )}

      {/* Order items */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Order Items</Typography>
          {order.items?.map((item, idx) => (
            <Stack key={idx} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
              <Typography variant="body2">{item.quantity}× {item.name}</Typography>
              <Typography variant="body2" fontWeight={600}>{formatCurrency(item.unit_price * item.quantity)}</Typography>
            </Stack>
          ))}
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" justifyContent="space-between">
            <Typography>Subtotal</Typography>
            <Typography fontWeight={600}>{formatCurrency(order.subtotal)}</Typography>
          </Stack>
          {order.delivery_fee > 0 && (
            <Stack direction="row" justifyContent="space-between">
              <Typography>Delivery Fee</Typography>
              <Typography fontWeight={600}>{formatCurrency(order.delivery_fee)}</Typography>
            </Stack>
          )}
          {order.discount > 0 && (
            <Stack direction="row" justifyContent="space-between">
              <Typography>Discount</Typography>
              <Typography fontWeight={600} color="success.main">-{formatCurrency(order.discount)}</Typography>
            </Stack>
          )}
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="h6" fontWeight={700}>Total</Typography>
            <Typography variant="h6" fontWeight={700} color="primary">{formatCurrency(order.total)}</Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Delivery / contact info */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Details</Typography>
          <Stack spacing={0.5}>
            <Typography variant="body2"><strong>Type:</strong> {order.order_type.replace('_', ' ').toUpperCase()}</Typography>
            <Typography variant="body2"><strong>Customer:</strong> {order.customer_name}</Typography>
            <Typography variant="body2"><strong>Phone:</strong> {order.customer_phone}</Typography>
            {order.notes && <Typography variant="body2"><strong>Notes:</strong> {order.notes}</Typography>}
          </Stack>
        </CardContent>
      </Card>

      <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
        <Button component={Link} href="/menu" variant="outlined" fullWidth>Order Again</Button>
        <Button component={Link} href="/orders" variant="contained" fullWidth>My Orders</Button>
      </Stack>
    </Container>
  );
}
