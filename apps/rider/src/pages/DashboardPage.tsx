import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack, Chip,
  Button, Grid, Switch, FormControlLabel, Badge, Divider, Avatar,
} from '@mui/material';
import DeliveryDiningIcon from '@mui/icons-material/DeliveryDining';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PhoneIcon from '@mui/icons-material/Phone';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import NavigationIcon from '@mui/icons-material/Navigation';
import { api, supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDateTime, formatRelativeTime } from '@paxrest/shared-utils';
import type { DeliveryStatus } from '@paxrest/shared-types';
import toast from 'react-hot-toast';

interface ActiveDelivery {
  id: string;
  order_id: string;
  order_number: number;
  status: DeliveryStatus;
  pickup_address: string;
  delivery_address: any;
  customer_name: string;
  customer_phone: string;
  estimated_delivery_time: string | null;
  created_at: string;
  order_total: number;
}

const STATUS_COLORS: Record<string, 'warning' | 'info' | 'primary' | 'success'> = {
  assigned: 'warning',
  picked_up: 'info',
  in_transit: 'primary',
  delivered: 'success',
};

const NEXT_STATUS: Partial<Record<DeliveryStatus, { status: DeliveryStatus; label: string }>> = {
  assigned: { status: 'picked_up', label: 'Mark Picked Up' },
  picked_up: { status: 'in_transit', label: 'Start Delivery' },
  in_transit: { status: 'delivered', label: 'Mark Delivered' },
};

export default function DashboardPage() {
  const { rider, refreshRider } = useAuth();
  const [deliveries, setDeliveries] = useState<ActiveDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [geoWatchId, setGeoWatchId] = useState<number | null>(null);

  const fetchDeliveries = useCallback(async () => {
    const res = await api<{ data: ActiveDelivery[] }>('/delivery/my-deliveries?active=true');
    if (res.data?.data) setDeliveries(res.data.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  // Realtime for delivery updates
  useEffect(() => {
    if (!rider) return;
    const channel = supabase
      .channel('rider-deliveries')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'deliveries',
        filter: `rider_id=eq.${rider.id}`,
      }, () => { fetchDeliveries(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [rider, fetchDeliveries]);

  // GPS tracking
  const toggleAvailability = async () => {
    if (!rider) return;
    const newAvailable = !rider.is_available;
    const res = await api('/delivery/riders/' + rider.id, {
      method: 'PUT',
      body: JSON.stringify({ is_available: newAvailable }),
    });
    if (res.error) {
      toast.error('Failed to update availability');
      return;
    }
    await refreshRider();
    if (newAvailable) {
      startGPS();
      toast.success('You are now online');
    } else {
      stopGPS();
      toast.success('You are now offline');
    }
  };

  const startGPS = () => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        api('/delivery/update-location', {
          method: 'POST',
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 },
    );
    setGeoWatchId(id);
  };

  const stopGPS = () => {
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      setGeoWatchId(null);
    }
  };

  useEffect(() => {
    if (rider?.is_available) startGPS();
    return () => stopGPS();
  }, [rider?.is_available]);

  const handleStatusUpdate = async (deliveryId: string, newStatus: DeliveryStatus) => {
    const res = await api(`/delivery/update-status`, {
      method: 'POST',
      body: JSON.stringify({ delivery_id: deliveryId, status: newStatus }),
    });
    if (res.error) {
      toast.error(res.error.message);
    } else {
      toast.success('Status updated');
      fetchDeliveries();
    }
  };

  const activeCount = deliveries.filter((d) =>
    d.status !== 'delivered' && d.status !== 'cancelled',
  ).length;

  return (
    <Container maxWidth="sm" sx={{ py: 2, pb: 10 }}>
      {/* Header card */}
      <Card sx={{ mb: 3, bgcolor: rider?.is_available ? 'success.main' : 'grey.600', color: '#fff' }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" fontWeight={700}>{rider?.full_name ?? 'Rider'}</Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {rider?.vehicle_type} {rider?.vehicle_plate ? `• ${rider.vehicle_plate}` : ''}
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch checked={rider?.is_available ?? false} onChange={toggleAvailability}
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#fff' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'rgba(255,255,255,0.5)' } }} />
              }
              label={rider?.is_available ? 'Online' : 'Offline'}
              sx={{ color: '#fff' }}
            />
          </Stack>
          <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
            <Box>
              <Typography variant="h4" fontWeight={700}>{activeCount}</Typography>
              <Typography variant="caption">Active</Typography>
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={700}>{deliveries.length}</Typography>
              <Typography variant="caption">Today</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Active deliveries */}
      {deliveries.length === 0 && !loading && (
        <Box textAlign="center" py={6}>
          <DeliveryDiningIcon sx={{ fontSize: 64, color: 'grey.400', mb: 1 }} />
          <Typography color="text.secondary">No active deliveries</Typography>
          <Typography variant="body2" color="text.secondary">
            {rider?.is_available ? 'Waiting for new orders…' : 'Go online to receive deliveries'}
          </Typography>
        </Box>
      )}

      {deliveries.map((d) => {
        const next = NEXT_STATUS[d.status as keyof typeof NEXT_STATUS];
        return (
          <Card key={d.id} sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>
                  Order #{d.order_number}
                </Typography>
                <Chip label={d.status.replace('_', ' ')} size="small" color={STATUS_COLORS[d.status] ?? 'default'} />
              </Stack>

              <Stack spacing={1} sx={{ mt: 2 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <LocationOnIcon fontSize="small" color="error" />
                  <Typography variant="body2">
                    {typeof d.delivery_address === 'object' ? d.delivery_address.line1 : d.delivery_address}
                  </Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <PhoneIcon fontSize="small" color="primary" />
                  <Typography variant="body2">{d.customer_name} — {d.customer_phone}</Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <AccessTimeIcon fontSize="small" />
                  <Typography variant="body2" color="text.secondary">
                    {formatRelativeTime(d.created_at)}
                  </Typography>
                </Stack>
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={600}>{formatCurrency(d.order_total)}</Typography>
                {next && (
                  <Button
                    variant="contained" size="small"
                    startIcon={<NavigationIcon />}
                    onClick={() => handleStatusUpdate(d.id, next.status)}
                  >
                    {next.label}
                  </Button>
                )}
                {d.status === 'delivered' && (
                  <Chip label="Completed" color="success" />
                )}
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Container>
  );
}
