'use client';
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent, CardMedia,
  CardActions, Button, Stack, Skeleton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, CircularProgress,
  IconButton, Alert, MenuItem,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SpaIcon from '@mui/icons-material/Spa';
import { publicApi } from '@/lib/supabase';
import { useCartStore } from '@/stores/cart';
import { formatCurrency } from '@paxrest/shared-utils';
import toast from 'react-hot-toast';

interface OtherService {
  id: string;
  name: string;
  description: string | null;
  charge_amount: number;
  charge_duration: string;
  media_url: string | null;
  media_type: string | null;
  is_available: boolean;
}

const DURATION_LABELS: Record<string, string> = {
  once: 'flat rate',
  hourly: 'hour',
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  per_session: 'session',
};

function durationLabel(d: string): string {
  return DURATION_LABELS[d] ?? d;
}

export default function ServicesPage() {
  const [services, setServices] = useState<OtherService[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<OtherService | null>(null);
  const branchId = useCartStore((s) => s.branchId);

  const fetchServices = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await publicApi<{ services: OtherService[] }>(`/customer/services?branch_id=${encodeURIComponent(branchId)}`);
      setServices(res.data?.services ?? []);
    } catch {
      toast.error('Unable to load services. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ bgcolor: '#1C2B4A', py: { xs: 5, md: 7 }, px: 2 }}>
        <Container maxWidth="lg">
          <Typography variant="overline" sx={{ color: '#C9973A', letterSpacing: '0.15em', display: 'block', mb: 1 }}>
            Experiences &amp; Wellness
          </Typography>
          <Typography variant="h3" sx={{ color: '#fff', fontFamily: '"Playfair Display", serif', mb: 1 }}>
            Our Services
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 520 }}>
            Explore our range of premium services — from spa treatments to leisure activities.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 5 }}>
        {!branchId ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>Please select a branch first to see available services.</Alert>
        ) : loading ? (
          <Grid container spacing={3}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton variant="rounded" height={300} />
              </Grid>
            ))}
          </Grid>
        ) : services.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>No services listed yet.</Typography>
            <Typography variant="body2" color="text.secondary">
              Please contact us directly to enquire about available services.
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {services.map((svc) => {
              const available = svc.is_available;
              return (
                <Grid key={svc.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #E0DBD0', borderRadius: 2, opacity: available ? 1 : 0.6 }}>
                    {/* Media */}
                    <Box sx={{ height: 200, bgcolor: '#F3EFE8', overflow: 'hidden', position: 'relative' }}>
                      {svc.media_url ? (
                        svc.media_type === 'video' ? (
                          <Box component="video" src={svc.media_url} muted loop autoPlay playsInline sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <CardMedia component="img" image={svc.media_url} alt={svc.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          <SpaIcon sx={{ fontSize: 48, color: '#C9973A', opacity: 0.4 }} />
                        </Box>
                      )}
                      {/* Availability badge */}
                      <Box sx={{ position: 'absolute', top: 10, right: 10, px: 1.5, py: 0.4, borderRadius: 1, bgcolor: available ? '#E8F5E9' : '#F3F4F6', border: `1px solid ${available ? '#2E7D3230' : '#6B728030'}` }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: available ? '#2E7D32' : '#6B7280', letterSpacing: '0.04em' }}>
                          {available ? 'Available' : 'Unavailable'}
                        </Typography>
                      </Box>
                    </Box>

                    <CardContent sx={{ flex: 1 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                        <Typography variant="subtitle1" fontWeight={600} sx={{ color: '#1C2B4A', fontFamily: '"Playfair Display", serif' }}>
                          {svc.name}
                        </Typography>
                        <Box sx={{ textAlign: 'right', flexShrink: 0, ml: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#C9973A' }}>
                            {formatCurrency(svc.charge_amount)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">per {durationLabel(svc.charge_duration)}</Typography>
                        </Box>
                      </Stack>
                      {svc.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {svc.description}
                        </Typography>
                      )}
                    </CardContent>

                    <CardActions sx={{ px: 2, pb: 2 }}>
                      <Button
                        fullWidth
                        variant={available ? 'contained' : 'outlined'}
                        disabled={!available}
                        onClick={() => available && setSelectedService(svc)}
                        size="small"
                        startIcon={available ? <SpaIcon /> : undefined}
                        sx={available ? { bgcolor: '#1C2B4A', '&:hover': { bgcolor: '#253559' } } : { borderColor: '#E0DBD0', color: 'text.disabled' }}
                      >
                        {available ? 'Book Now' : 'Unavailable'}
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Container>

      <ServiceBookingDialog
        service={selectedService}
        branchId={branchId ?? ''}
        onClose={() => setSelectedService(null)}
        onBooked={() => { setSelectedService(null); fetchServices(); }}
      />
    </Box>
  );
}

// ── Duration helpers ─────────────────────────────────────────────────────────

function addDuration(base: Date, count: number, unit: string): Date {
  const d = new Date(base);
  switch (unit) {
    case 'hourly':      d.setHours(d.getHours() + count); break;
    case 'daily':       d.setDate(d.getDate() + count); break;
    case 'weekly':      d.setDate(d.getDate() + count * 7); break;
    case 'monthly':     d.setMonth(d.getMonth() + count); break;
    default:            d.setHours(d.getHours() + count); break; // per_session / once treated as hourly
  }
  return d;
}

// ── ServiceBookingDialog ─────────────────────────────────────────────────────

interface ServiceBookingDialogProps {
  service: OtherService | null;
  branchId: string;
  onClose: () => void;
  onBooked: () => void;
}

function ServiceBookingDialog({ service, branchId, onClose, onBooked }: ServiceBookingDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [startDate, setStartDate] = useState('');
  const [durationCount, setDurationCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const unitLabel = durationLabel(service?.charge_duration ?? 'once');
  const unitPrice = Number(service?.charge_amount ?? 0);
  const isOnce = service?.charge_duration === 'once' || service?.charge_duration === 'per_session';
  const effectiveDuration = isOnce ? 1 : Math.max(1, durationCount);
  const totalCost = unitPrice * effectiveDuration;

  const endDateIso = startDate && !isOnce
    ? addDuration(new Date(startDate), effectiveDuration, service?.charge_duration ?? 'hourly').toISOString().slice(0, 16)
    : '';

  const reset = () => {
    setName(''); setPhone(''); setEmail('');
    setStartDate(''); setDurationCount(1); setNotes('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error('Please provide your name and phone number.');
      return;
    }
    if (effectiveDuration < 1) {
      toast.error('Duration must be at least 1.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await publicApi<{ order_number: string }>('/customer/book-service', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          service_id: service?.id,
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_email: email.trim() || null,
          duration_count: effectiveDuration,
          duration_unit: service?.charge_duration ?? 'once',
          scheduled_start: startDate || null,
          scheduled_end: endDateIso || null,
          notes: notes.trim() || null,
        }),
      });
      const ref = res.data?.order_number ?? '';
      toast.success(`Service booked! Reference: #${ref}`);
      reset();
      onBooked();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not complete booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!(name.trim() && phone.trim() && effectiveDuration >= 1 && !submitting);

  return (
    <Dialog open={!!service} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A' }}>Book Service</Typography>
          {service && (
            <Typography variant="caption" color="text.secondary">
              {service.name} · {formatCurrency(unitPrice)}/{unitLabel}
            </Typography>
          )}
        </Box>
        <IconButton onClick={handleClose} size="small"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Stack direction="row" spacing={1.5}>
            <TextField label="Full Name *" size="small" fullWidth required value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Phone *" size="small" fullWidth required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Stack>
          <TextField label="Email (optional)" size="small" fullWidth type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

          {/* Start date/time */}
          <TextField
            label="Preferred Start Date & Time"
            type="datetime-local"
            size="small"
            fullWidth
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {/* Duration (hidden for once / per_session) */}
          {!isOnce && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <TextField
                label="Duration"
                type="number"
                size="small"
                sx={{ flex: 1 }}
                value={durationCount}
                onChange={(e) => setDurationCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                slotProps={{ htmlInput: { min: 1 } }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1, whiteSpace: 'nowrap' }}>
                {unitLabel}(s)
              </Typography>
            </Stack>
          )}

          {/* End date (auto-calculated) */}
          {endDateIso && (
            <TextField
              label="Estimated End"
              type="datetime-local"
              size="small"
              fullWidth
              value={endDateIso}
              disabled
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Auto-calculated from start + duration"
            />
          )}

          {/* Live cost summary */}
          <Box sx={{ p: 1.5, bgcolor: '#1C2B4A', borderRadius: 1 }}>
            <Typography variant="h6" fontWeight={700} sx={{ color: '#C9973A' }}>
              {formatCurrency(totalCost)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              {isOnce
                ? `Flat rate`
                : `${effectiveDuration} ${unitLabel}${effectiveDuration !== 1 ? 's' : ''} × ${formatCurrency(unitPrice)} per ${unitLabel}`}
            </Typography>
          </Box>

          <TextField
            label="Additional notes"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any special requests or requirements..."
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2.5, borderTop: '1px solid #E0DBD0' }}>
        <Button onClick={handleClose} disabled={submitting} sx={{ color: 'text.secondary' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : <SpaIcon />}
          sx={{ bgcolor: '#1C2B4A', '&:hover': { bgcolor: '#253559' } }}
        >
          {submitting ? 'Booking...' : `Confirm · ${formatCurrency(totalCost)}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
