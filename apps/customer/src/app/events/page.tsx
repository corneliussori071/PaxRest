'use client';
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent, CardMedia,
  CardActions, Button, Chip, Stack, Skeleton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, CircularProgress,
  IconButton, Alert, MenuItem,
} from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { publicApi } from '@/lib/supabase';
import { useCartStore } from '@/stores/cart';
import { formatCurrency } from '@paxrest/shared-utils';
import toast from 'react-hot-toast';

interface Room {
  id: string;
  room_number: string;
  floor_section: string | null;
  max_occupants: number;
  category: string;
  cost_amount: number;
  cost_duration: string;
  benefits: string[];
  media_url: string | null;
  media_type: string | null;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  available: { label: 'Available', color: '#2E7D32', bg: '#E8F5E9' },
  occupied: { label: 'Occupied', color: '#9A3412', bg: '#FEF9C3' },
  reserved: { label: 'Reserved', color: '#1D4ED8', bg: '#EFF6FF' },
  maintenance: { label: 'Maintenance', color: '#6B7280', bg: '#F3F4F6' },
};

export default function EventsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const branchId = useCartStore((s) => s.branchId);

  const fetchRooms = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await publicApi<{ rooms: Room[] }>(`/customer/rooms?branch_id=${encodeURIComponent(branchId)}`);
      setRooms(res.data?.rooms ?? []);
    } catch {
      toast.error('Unable to load rooms. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ bgcolor: '#1C2B4A', py: { xs: 5, md: 7 }, px: 2 }}>
        <Container maxWidth="lg">
          <Typography variant="overline" sx={{ color: '#C9973A', letterSpacing: '0.15em', display: 'block', mb: 1 }}>
            Private Events & Accommodation
          </Typography>
          <Typography variant="h3" sx={{ color: '#fff', fontFamily: '"Playfair Display", serif', mb: 1 }}>
            Halls &amp; Suites
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 520 }}>
            From intimate boardroom meetings to grand banquets â€” book one of our available spaces.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 5 }}>
        {!branchId ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>Please select a branch first to see available rooms.</Alert>
        ) : loading ? (
          <Grid container spacing={3}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton variant="rounded" height={340} />
              </Grid>
            ))}
          </Grid>
        ) : rooms.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>No rooms listed yet.</Typography>
            <Typography variant="body2" color="text.secondary">
              Please contact us directly at <strong>dining@paxhotel.com</strong> to enquire about event spaces.
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {rooms.map((room) => {
              const sc = STATUS_CONFIG[room.status] ?? STATUS_CONFIG.available;
              const isAvailable = room.status === 'available';
              const benefits: string[] = Array.isArray(room.benefits) ? room.benefits : [];

              return (
                <Grid key={room.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #E0DBD0', borderRadius: 2, opacity: isAvailable ? 1 : 0.7 }}>
                    {/* Media */}
                    <Box sx={{ height: 200, bgcolor: '#F3EFE8', overflow: 'hidden', position: 'relative' }}>
                      {room.media_url ? (
                        room.media_type === 'video' ? (
                          <Box component="video" src={room.media_url} muted loop autoPlay playsInline sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <CardMedia component="img" image={room.media_url} alt={room.category} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                          <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: '#E8E0D4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: '#C9973A', opacity: 0.5 }} />
                          </Box>
                        </Box>
                      )}
                      {/* Status badge */}
                      <Box sx={{ position: 'absolute', top: 10, right: 10, px: 1.5, py: 0.4, borderRadius: 1, bgcolor: sc.bg, border: `1px solid ${sc.color}30` }}>
                        <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: sc.color, letterSpacing: '0.04em' }}>{sc.label}</Typography>
                      </Box>
                    </Box>

                    <CardContent sx={{ flex: 1 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                        <Box>
                          <Typography variant="subtitle1" fontWeight={600} sx={{ color: '#1C2B4A', fontFamily: '"Playfair Display", serif' }}>
                            {room.category.charAt(0).toUpperCase() + room.category.slice(1)} Room
                          </Typography>
                          {room.floor_section && (
                            <Typography variant="caption" color="text.secondary">
                              {room.floor_section} Â· Room {room.room_number}
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#C9973A' }}>
                            {formatCurrency(room.cost_amount)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">per {room.cost_duration}</Typography>
                        </Box>
                      </Stack>

                      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ color: 'text.secondary', mb: benefits.length ? 1.5 : 0 }}>
                        <PeopleOutlineIcon sx={{ fontSize: '1rem' }} />
                        <Typography variant="body2">Up to {room.max_occupants} guests</Typography>
                      </Stack>

                      {benefits.length > 0 && (
                        <Stack spacing={0.5}>
                          {benefits.slice(0, 3).map((b, i) => (
                            <Stack key={i} direction="row" alignItems="center" spacing={0.75}>
                              <CheckIcon sx={{ fontSize: '0.8rem', color: '#C9973A' }} />
                              <Typography variant="caption" color="text.secondary">{b}</Typography>
                            </Stack>
                          ))}
                          {benefits.length > 3 && (
                            <Typography variant="caption" color="text.disabled">+{benefits.length - 3} more inclusions</Typography>
                          )}
                        </Stack>
                      )}
                    </CardContent>

                    <CardActions sx={{ px: 2, pb: 2 }}>
                      <Button
                        fullWidth
                        variant={isAvailable ? 'contained' : 'outlined'}
                        disabled={!isAvailable}
                        onClick={() => isAvailable && setSelectedRoom(room)}
                        size="small"
                        startIcon={isAvailable ? <EventAvailableIcon /> : undefined}
                        sx={isAvailable ? { bgcolor: '#1C2B4A', '&:hover': { bgcolor: '#253559' } } : { borderColor: '#E0DBD0', color: 'text.disabled' }}
                      >
                        {isAvailable ? 'Book Now' : sc.label}
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Container>

      <BookingDialog
        room={selectedRoom}
        branchId={branchId ?? ''}
        onClose={() => setSelectedRoom(null)}
        onBooked={() => { setSelectedRoom(null); fetchRooms(); }}
      />
    </Box>
  );
}

// ── Duration helpers (ported from POS accommodation logic) ───────────────────
function calcDuration(ciStr: string, coStr: string, unit: string): number {
  if (!ciStr || !coStr) return 0;
  const ci = new Date(ciStr).getTime();
  const co = new Date(coStr).getTime();
  if (isNaN(ci) || isNaN(co) || co <= ci) return 0;
  const diffMs = co - ci;
  if (unit === 'hour') return Math.max(1, Math.ceil(diffMs / 3_600_000));
  if (unit === 'day')  return Math.max(1, Math.ceil(diffMs / 86_400_000));
  // night: use calendar-day midnight boundaries
  const ciMid = new Date(new Date(ciStr).toDateString()).getTime();
  const coMid = new Date(new Date(coStr).toDateString()).getTime();
  return Math.max(1, Math.round((coMid - ciMid) / 86_400_000));
}

function addDurationToDate(baseIso: string, count: number, unit: string): string {
  if (!baseIso || count < 1) return '';
  const d = new Date(baseIso);
  if (isNaN(d.getTime())) return '';
  if (unit === 'hour') d.setHours(d.getHours() + count);
  else d.setDate(d.getDate() + count);
  return d.toISOString().slice(0, 16);
}

interface BookingDialogProps {
  room: Room | null;
  branchId: string;
  onClose: () => void;
  onBooked: () => void;
}

function BookingDialog({ room, branchId, onClose, onBooked }: BookingDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [durationCount, setDurationCount] = useState(1);
  const [durationUnit, setDurationUnit] = useState(room?.cost_duration ?? 'night');
  const [numGuests, setNumGuests] = useState(1);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync durationUnit to room's cost_duration whenever room changes
  React.useEffect(() => {
    setDurationUnit(room?.cost_duration ?? 'night');
  }, [room?.id]);

  const maxGuests = room?.max_occupants ?? 100;

  // Auto-calculate duration from check-in + check-out dates
  const autoDuration = calcDuration(checkIn, checkOut, durationUnit);
  const effectiveDuration = autoDuration > 0 ? autoDuration : durationCount;
  const totalCost = Number(room?.cost_amount ?? 0) * effectiveDuration;
  const unitLabel = durationUnit === 'hour' ? 'hour' : durationUnit === 'day' ? 'day' : 'night';

  const handleCheckInChange = (val: string) => {
    setCheckIn(val);
    // Clear checkOut so auto-calc triggers fresh
    setCheckOut('');
  };

  const handleCheckOutChange = (val: string) => {
    setCheckOut(val);
  };

  const handleDurationCountChange = (val: number) => {
    const count = Math.max(1, val);
    setDurationCount(count);
    // If check-in is set but no check-out, auto-set check-out
    if (checkIn && !checkOut) {
      setCheckOut(addDurationToDate(checkIn, count, durationUnit));
    }
  };

  const handleDurationUnitChange = (val: string) => {
    setDurationUnit(val);
    if (checkIn && durationCount > 0 && !checkOut) {
      setCheckOut(addDurationToDate(checkIn, durationCount, val));
    }
  };

  const reset = () => {
    setName(''); setPhone(''); setEmail('');
    setCheckIn(''); setCheckOut('');
    setDurationCount(1); setDurationUnit(room?.cost_duration ?? 'night');
    setNumGuests(1); setNotes('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error('Please provide your name and phone number.');
      return;
    }
    if (numGuests < 1 || numGuests > maxGuests) {
      toast.error(`Number of guests must be between 1 and ${maxGuests}.`);
      return;
    }
    if (effectiveDuration < 1) {
      toast.error(`Duration must be at least 1 ${unitLabel}.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await publicApi<{ order_number: string }>('/customer/book-room', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          room_id: room?.id,
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_email: email.trim() || null,
          check_in: checkIn || null,
          check_out: checkOut || null,
          duration_count: effectiveDuration,
          duration_unit: durationUnit,
          num_occupants: numGuests,
          notes: notes.trim() || null,
        }),
      });
      const ref = res.data?.order_number ?? '';
      toast.success(`Room reserved! Booking reference: #${ref}. Staff will confirm shortly.`);
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
    <Dialog open={!!room} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A' }}>Book This Space</Typography>
          {room && (
            <Typography variant="caption" color="text.secondary">
              {room.category} Room {room.room_number} · up to {room.max_occupants} guests · {formatCurrency(room.cost_amount)}/{room.cost_duration}
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

          {/* Check-in / check-out — auto-calculates duration + cost */}
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Check-in"
              type="datetime-local"
              size="small"
              fullWidth
              value={checkIn}
              onChange={(e) => handleCheckInChange(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Check-out"
              type="datetime-local"
              size="small"
              fullWidth
              value={checkOut}
              onChange={(e) => handleCheckOutChange(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          {/* Duration row — manual fallback; syncs with dates */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              label="Duration"
              type="number"
              size="small"
              sx={{ flex: 1 }}
              value={autoDuration > 0 ? autoDuration : durationCount}
              disabled={autoDuration > 0}
              onChange={(e) => handleDurationCountChange(parseInt(e.target.value, 10))}
              slotProps={{ htmlInput: { min: 1 } }}
              helperText={autoDuration > 0 ? 'Auto from dates' : 'Manual entry'}
            />
            <TextField
              select
              label="Unit"
              size="small"
              sx={{ flex: 1 }}
              value={durationUnit}
              onChange={(e) => handleDurationUnitChange(e.target.value)}
            >
              <MenuItem value="hour">Hour(s)</MenuItem>
              <MenuItem value="day">Day(s)</MenuItem>
              <MenuItem value="night">Night(s)</MenuItem>
            </TextField>
            <TextField
              label="Guests"
              type="number"
              size="small"
              sx={{ flex: 1 }}
              value={numGuests}
              onChange={(e) => setNumGuests(Math.max(1, Math.min(maxGuests, parseInt(e.target.value, 10) || 1)))}
              slotProps={{ htmlInput: { min: 1, max: maxGuests } }}
            />
          </Stack>

          {/* Live cost summary */}
          <Box sx={{ p: 1.5, bgcolor: '#1C2B4A', borderRadius: 1 }}>
            <Typography variant="h6" fontWeight={700} sx={{ color: '#C9973A' }}>
              {formatCurrency(totalCost)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              {effectiveDuration} {unitLabel}{effectiveDuration !== 1 ? 's' : ''} × {formatCurrency(room?.cost_amount ?? 0)} per {room?.cost_duration ?? unitLabel}
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
            placeholder="Catering requirements, AV setup, special requests..."
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2.5, borderTop: '1px solid #E0DBD0' }}>
        <Button onClick={handleClose} disabled={submitting} sx={{ color: 'text.secondary' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : <EventAvailableIcon />}
          sx={{ bgcolor: '#1C2B4A', '&:hover': { bgcolor: '#253559' } }}
        >
          {submitting ? 'Booking...' : `Confirm · ${formatCurrency(totalCost)}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

