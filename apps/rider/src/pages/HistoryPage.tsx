import React, { useEffect, useState } from 'react';
import {
  Container, Typography, Card, CardContent, Stack, Chip,
  Skeleton, Box, Divider, Tabs, Tab,
} from '@mui/material';
import { api } from '@/lib/supabase';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';
import type { DeliveryStatus } from '@paxrest/shared-types';

interface DeliverySummary {
  id: string;
  order_number: number;
  status: DeliveryStatus;
  delivery_address: any;
  customer_name: string;
  order_total: number;
  created_at: string;
  delivered_at: string | null;
}

export default function HistoryPage() {
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0); // 0=completed, 1=cancelled

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await api<{ data: DeliverySummary[] }>('/delivery/my-deliveries?page_size=50');
      if (res.data?.data) setDeliveries(res.data.data);
      setLoading(false);
    })();
  }, []);

  const filtered = deliveries.filter((d) =>
    tab === 0
      ? d.status === 'delivered'
      : d.status === 'cancelled',
  );

  const todayCount = deliveries.filter((d) => {
    const dt = new Date(d.created_at);
    const now = new Date();
    return dt.toDateString() === now.toDateString() && d.status === 'delivered';
  }).length;

  const totalEarnings = deliveries
    .filter((d) => d.status === 'delivered')
    .reduce((s, d) => s + (d.order_total * 0.1), 0); // 10% rider commission placeholder

  return (
    <Container maxWidth="sm" sx={{ py: 2, pb: 10 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>Delivery History</Typography>

      {/* Summary */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
            <Typography variant="h5" fontWeight={700}>{todayCount}</Typography>
            <Typography variant="caption" color="text.secondary">Today</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
            <Typography variant="h5" fontWeight={700}>{deliveries.filter((d) => d.status === 'delivered').length}</Typography>
            <Typography variant="caption" color="text.secondary">Total</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
            <Typography variant="h5" fontWeight={700}>{formatCurrency(totalEarnings)}</Typography>
            <Typography variant="caption" color="text.secondary">Est. Earnings</Typography>
          </CardContent>
        </Card>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Completed" />
        <Tab label="Cancelled" />
      </Tabs>

      {loading && Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={80} sx={{ mb: 1 }} />
      ))}

      {!loading && filtered.length === 0 && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">No deliveries</Typography>
        </Box>
      )}

      {filtered.map((d) => (
        <Card key={d.id} sx={{ mb: 1.5 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle2" fontWeight={600}>Order #{d.order_number}</Typography>
                <Typography variant="caption" color="text.secondary">{d.customer_name}</Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="subtitle2" fontWeight={600}>{formatCurrency(d.order_total)}</Typography>
                <Typography variant="caption" color="text.secondary">{formatDateTime(d.created_at)}</Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Container>
  );
}
