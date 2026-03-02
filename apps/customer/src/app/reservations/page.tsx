'use client';
import React, { useEffect, useState, useMemo } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent, CardActions,
  Button, Chip, Stack, Skeleton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, FormControl, FormLabel, RadioGroup,
  FormControlLabel, Radio, CircularProgress, IconButton, Alert,
} from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import CloseIcon from '@mui/icons-material/Close';
import { publicApi } from '@/lib/supabase';
import { useCartStore } from '@/stores/cart';
import toast from 'react-hot-toast';

interface Table {
  id: string;
  table_number: string;
  name: string;
  capacity: number;
  section: string | null;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
}

const STATUS_CONFIG = {
  available: { label: 'Available', color: '#2E7D32', bg: '#E8F5E9' },
  occupied: { label: 'Occupied', color: '#9A3412', bg: '#FEF9C3' },
  reserved: { label: 'Reserved', color: '#1D4ED8', bg: '#EFF6FF' },
  cleaning: { label: 'Being Set Up', color: '#6B7280', bg: '#F3F4F6' },
};

export default function ReservationsPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const branchId = useCartStore((s) => s.branchId);

  useEffect(() => {
    if (!branchId) return;
    const fetchTables = async () => {
      setLoading(true);
      try {
        const res = await publicApi<{ tables: Table[] }>(`/customer/tables?branch_id=${encodeURIComponent(branchId)}`);
        setTables(res.data?.tables ?? []);
      } catch {
        toast.error('Unable to load tables. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchTables();
  }, [branchId]);

  const sections = useMemo(() => {
    const s = new Set(tables.map((t) => t.section ?? 'Main'));
    return Array.from(s);
  }, [tables]);

  const tablesBySection = useMemo(() => {
    const map: Record<string, Table[]> = {};
    tables.forEach((t) => {
      const sec = t.section ?? 'Main';
      if (!map[sec]) map[sec] = [];
      map[sec].push(t);
    });
    return map;
  }, [tables]);

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ bgcolor: '#1C2B4A', py: { xs: 5, md: 7 }, px: 2 }}>
        <Container maxWidth="lg">
          <Typography variant="overline" sx={{ color: '#C9973A', letterSpacing: '0.15em', display: 'block', mb: 1 }}>
            Dine With Us
          </Typography>
          <Typography variant="h3" sx={{ color: '#fff', fontFamily: '"Playfair Display", serif', mb: 1 }}>
            Reserve a Table
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 480 }}>
            Browse available seating and let us know when you&apos;d like to arrive.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 5 }}>
        {!branchId ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>Please select a branch first to see available tables.</Alert>
        ) : loading ? (
          <Grid container spacing={3}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton variant="rounded" height={180} />
              </Grid>
            ))}
          </Grid>
        ) : tables.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <TableRestaurantIcon sx={{ fontSize: 64, color: '#E0DBD0', mb: 2 }} />
            <Typography color="text.secondary">No tables configured yet. Please call us to reserve.</Typography>
          </Box>
        ) : (
          sections.map((sec) => (
            <Box key={sec} sx={{ mb: 6 }}>
              <Box sx={{ mb: 3, pb: 2, borderBottom: '1px solid #E0DBD0' }}>
                <Typography variant="h6" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A' }}>{sec}</Typography>
              </Box>
              <Grid container spacing={3}>
                {(tablesBySection[sec] ?? []).map((table) => {
                  const sc = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.available;
                  const isAvailable = table.status === 'available';
                  return (
                    <Grid key={table.id} size={{ xs: 12, sm: 6, md: 4 }}>
                      <Card sx={{
                        height: '100%', display: 'flex', flexDirection: 'column',
                        opacity: isAvailable ? 1 : 0.7,
                        border: '1px solid #E0DBD0', borderRadius: 2,
                      }}>
                        <CardContent sx={{ flex: 1 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                            <Typography variant="h6" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A' }}>
                              {table.name || `Table ${table.table_number}`}
                            </Typography>
                            <Chip
                              label={sc.label}
                              size="small"
                              sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 600, fontSize: '0.7rem', border: `1px solid ${sc.color}30` }}
                            />
                          </Stack>
                          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ color: 'text.secondary' }}>
                            <PeopleOutlineIcon sx={{ fontSize: '1rem' }} />
                            <Typography variant="body2">Seats {table.capacity}</Typography>
                          </Stack>
                          {table.table_number && (
                            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                              Table #{table.table_number}
                            </Typography>
                          )}
                        </CardContent>
                        <CardActions sx={{ px: 2, pb: 2 }}>
                          <Button
                            fullWidth
                            variant={isAvailable ? 'contained' : 'outlined'}
                            disabled={!isAvailable}
                            onClick={() => isAvailable && setSelectedTable(table)}
                            size="small"
                            sx={isAvailable ? { bgcolor: '#1C2B4A', '&:hover': { bgcolor: '#253559' } } : { borderColor: '#E0DBD0', color: 'text.disabled' }}
                          >
                            {isAvailable ? 'Request Reservation' : sc.label}
                          </Button>
                        </CardActions>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          ))
        )}
      </Container>

      <ReservationDialog
        table={selectedTable}
        branchId={branchId ?? ''}
        onClose={() => setSelectedTable(null)}
      />
    </Box>
  );
}

interface ReservationDialogProps {
  table: Table | null;
  branchId: string;
  onClose: () => void;
}

function ReservationDialog({ table, branchId, onClose }: ReservationDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [guests, setGuests] = useState('2');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim() || !date || !time) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      await publicApi('/customer/special-request', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          item_id: null,
          item_name: `Table Reservation — ${table?.name || `Table ${table?.table_number}`}`,
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_address: null,
          order_type: 'dine_in',
          special_request_notes: `Table reservation: ${table?.name} (${table?.table_number}) | Date: ${date} at ${time} | Guests: ${guests}${notes ? ` | Notes: ${notes}` : ''}`,
        }),
      });
      toast.success('Reservation request submitted. Our team will confirm shortly.');
      onClose();
      setName(''); setPhone(''); setDate(''); setTime(''); setGuests('2'); setNotes('');
    } catch {
      toast.error('Could not submit reservation. Please call us directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!table} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A' }}>
            Request a Reservation
          </Typography>
          {table && (
            <Typography variant="caption" color="text.secondary">
              {table.name || `Table ${table.table_number}`} — seats {table.capacity}
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
          <Stack direction="row" spacing={1.5}>
            <TextField label="Date" type="date" size="small" fullWidth required value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Time" type="time" size="small" fullWidth required value={time} onChange={(e) => setTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
          <TextField label="Number of Guests" type="number" size="small" fullWidth value={guests} onChange={(e) => setGuests(e.target.value)} slotProps={{ input: { inputProps: { min: 1, max: table?.capacity ?? 20 } } }} />
          <TextField label="Special requests (optional)" size="small" fullWidth multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. anniversary dinner, high chair needed" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2.5, borderTop: '1px solid #E0DBD0' }}>
        <Button onClick={onClose} disabled={submitting} sx={{ color: 'text.secondary' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !name.trim() || !phone.trim() || !date || !time}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{ bgcolor: '#1C2B4A', '&:hover': { bgcolor: '#253559' } }}
        >
          {submitting ? 'Submitting...' : 'Request Reservation'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
