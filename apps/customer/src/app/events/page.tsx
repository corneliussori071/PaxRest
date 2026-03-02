'use client';
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent, CardMedia,
  CardActions, Button, Chip, Stack, Skeleton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, CircularProgress,
  IconButton, Alert, List, ListItem, ListItemText,
} from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
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

  useEffect(() => {
    if (!branchId) return;
    const fetchRooms = async () => {
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
    fetchRooms();
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
            From intimate boardroom meetings to grand banquets — enquire about our available spaces.
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
                              {room.floor_section} · Room {room.room_number}
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
                        sx={isAvailable ? { bgcolor: '#1C2B4A', '&:hover': { bgcolor: '#253559' } } : { borderColor: '#E0DBD0', color: 'text.disabled' }}
                      >
                        {isAvailable ? 'Enquire Now' : sc.label}
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Container>

      <EnquiryDialog
        room={selectedRoom}
        branchId={branchId ?? ''}
        onClose={() => setSelectedRoom(null)}
      />
    </Box>
  );
}

interface EnquiryDialogProps {
  room: Room | null;
  branchId: string;
  onClose: () => void;
}

function EnquiryDialog({ room, branchId, onClose }: EnquiryDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [guests, setGuests] = useState('');
  const [eventType, setEventType] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error('Please provide your name and phone number.');
      return;
    }
    setSubmitting(true);
    try {
      const parts = [
        `Room: ${room?.category} Room ${room?.room_number}`,
        eventDate ? `Date: ${eventDate}` : null,
        guests ? `Guests: ${guests}` : null,
        eventType ? `Event type: ${eventType}` : null,
        notes ? `Details: ${notes}` : null,
        email ? `Email: ${email}` : null,
      ].filter(Boolean);

      await publicApi('/customer/special-request', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          item_id: null,
          item_name: `Event Enquiry — ${room?.category} Room ${room?.room_number}`,
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_address: null,
          order_type: 'dine_in',
          special_request_notes: parts.join(' | '),
        }),
      });
      toast.success('Your enquiry has been received. We will contact you within 24 hours.');
      onClose();
      setName(''); setPhone(''); setEmail(''); setEventDate(''); setGuests(''); setEventType(''); setNotes('');
    } catch {
      toast.error('Could not submit enquiry. Please email us at dining@paxhotel.com');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!room} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A' }}>Event Enquiry</Typography>
          {room && (
            <Typography variant="caption" color="text.secondary">
              {room.category} Room {room.room_number} · up to {room.max_occupants} guests · {formatCurrency(room.cost_amount)}/{room.cost_duration}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Stack direction="row" spacing={1.5}>
            <TextField label="Full Name" size="small" fullWidth required value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Phone" size="small" fullWidth required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Stack>
          <TextField label="Email (optional)" size="small" fullWidth type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Preferred Event Date" type="date" size="small" fullWidth value={eventDate} onChange={(e) => setEventDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <Stack direction="row" spacing={1.5}>
            <TextField label="Expected Guests" type="number" size="small" fullWidth value={guests} onChange={(e) => setGuests(e.target.value)} />
            <TextField label="Event Type" size="small" fullWidth placeholder="e.g. Conference" value={eventType} onChange={(e) => setEventType(e.target.value)} />
          </Stack>
          <TextField label="Additional details" size="small" fullWidth multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catering requirements, AV equipment, setup preferences..." />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2.5, borderTop: '1px solid #E0DBD0' }}>
        <Button onClick={onClose} disabled={submitting} sx={{ color: 'text.secondary' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !name.trim() || !phone.trim()}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{ bgcolor: '#1C2B4A', '&:hover': { bgcolor: '#253559' } }}
        >
          {submitting ? 'Sending...' : 'Submit Enquiry'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
