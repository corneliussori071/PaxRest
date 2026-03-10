import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Stack, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, Alert, LinearProgress, Chip,
  FormControl, InputLabel, Select, Switch, FormControlLabel, IconButton,
  TablePagination, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Paper, Tabs, Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ExtensionIcon from '@mui/icons-material/Extension';
import TimerIcon from '@mui/icons-material/Timer';
import SpaIcon from '@mui/icons-material/Spa';
import PeopleIcon from '@mui/icons-material/People';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MenuItem from '@mui/material/MenuItem';
import { formatCurrency } from '@paxrest/shared-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { api, supabase } from '@/lib/supabase';
import { useRealtime } from '@/hooks';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

/* ─── Constants ─── */
const CHARGE_DURATIONS = [
  { value: 'once', label: 'Once (Flat fee)' },
  { value: 'per_session', label: 'Per Session' },
  { value: 'hourly', label: 'Per Hour' },
  { value: 'daily', label: 'Per Day' },
  { value: 'weekly', label: 'Per Week' },
  { value: 'monthly', label: 'Per Month' },
];

const ALLOWED_MEDIA_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
];
const MAX_MEDIA_SIZE = 15 * 1024 * 1024; // 15 MB

export default function OtherServicesPage() {
  return <BranchGuard><OtherServicesContent /></BranchGuard>;
}

function OtherServicesContent() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const branchId = activeBranchId ?? '';
  const { currencyCode: currency } = useCurrency();
  const [topTab, setTopTab] = useState(0); // 0 = Create, 1 = Users

  return (
    <Box>
      <Tabs value={topTab} onChange={(_, v) => setTopTab(v)} sx={{ mb: 2 }}>
        <Tab icon={<SpaIcon />} iconPosition="start" label="Create" />
        <Tab icon={<PeopleIcon />} iconPosition="start" label="Users" />
      </Tabs>

      {topTab === 0 && <CreateTab branchId={branchId} currency={currency} />}
      {topTab === 1 && <UsersTab branchId={branchId} currency={currency} />}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Create Tab — existing CRUD for services
   ═══════════════════════════════════════════════════════ */
function CreateTab({ branchId, currency }: { branchId: string; currency: string }) {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');

  // Dialog state
  const [dialog, setDialog] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    charge_amount: '',
    charge_duration: 'once' as string,
    is_available: true,
    media_url: '',
    media_type: '' as string,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { fmt } = useCurrency();

  /* ─── Fetch ─── */
  const fetchServices = useCallback(async () => {
    try {
      const params: Record<string, string> = {
        page: String(page + 1),
        page_size: String(pageSize),
      };
      if (search) params.search = search;
      const data = await api<{ services: any[]; total: number }>(
        'other-services', 'list', { params, branchId },
      );
      setServices(data.services ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, search]);

  useEffect(() => { setLoading(true); fetchServices(); }, [fetchServices]);

  /* ─── Dialog helpers ─── */
  const openNew = () => {
    setEditingService(null);
    setForm({
      name: '', description: '', charge_amount: '',
      charge_duration: 'once', is_available: true,
      media_url: '', media_type: '',
    });
    setDialog(true);
  };

  const openEdit = (svc: any) => {
    setEditingService(svc);
    setForm({
      name: svc.name ?? '',
      description: svc.description ?? '',
      charge_amount: String(svc.charge_amount ?? ''),
      charge_duration: svc.charge_duration ?? 'once',
      is_available: svc.is_available !== false,
      media_url: svc.media_url ?? '',
      media_type: svc.media_type ?? '',
    });
    setDialog(true);
  };

  /* ─── File Upload (sanitised via file-upload edge function) ─── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Frontend validation
    if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Allowed: JPEG, PNG, WebP, GIF, MP4, WebM');
      return;
    }
    if (file.size > MAX_MEDIA_SIZE) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 15MB`);
      return;
    }

    // Sanitize filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file, safeName);
      formData.append('category', 'other-services');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${supabaseUrl}/functions/v1/file-upload/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'x-branch-id': branchId,
        },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? json.error ?? 'Upload failed');

      setForm((prev) => ({
        ...prev,
        media_url: json.file.url,
        media_type: file.type.startsWith('video/') ? 'video' : 'image',
      }));
      toast.success('File uploaded');
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  /* ─── Save ─── */
  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Service name is required');
    if (!form.charge_amount || Number(form.charge_amount) <= 0) return toast.error('Charge amount must be positive');

    setSaving(true);
    try {
      if (editingService) {
        await api('other-services', 'update', {
          body: {
            service_id: editingService.id,
            name: form.name.trim(),
            description: form.description.trim() || null,
            charge_amount: Number(form.charge_amount),
            charge_duration: form.charge_duration,
            is_available: form.is_available,
            media_url: form.media_url || null,
            media_type: form.media_type || null,
          },
          branchId,
        });
        toast.success('Service updated');
      } else {
        await api('other-services', 'create', {
          body: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            charge_amount: Number(form.charge_amount),
            charge_duration: form.charge_duration,
            is_available: form.is_available,
            media_url: form.media_url || null,
            media_type: form.media_type || null,
          },
          branchId,
        });
        toast.success('Service created');
      }
      setDialog(false);
      fetchServices();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  /* ─── Delete ─── */
  const handleDelete = async (serviceId: string) => {
    if (!window.confirm('Delete this service?')) return;
    try {
      await api('other-services', 'delete', { body: { service_id: serviceId }, branchId });
      toast.success('Service deleted');
      fetchServices();
    } catch (err: any) { toast.error(err.message); }
  };

  /* ─── Toggle Availability ─── */
  const handleToggle = async (svc: any) => {
    try {
      await api('other-services', 'toggle-availability', {
        body: { service_id: svc.id, is_available: !svc.is_available },
        branchId,
      });
      toast.success(svc.is_available ? 'Service marked unavailable' : 'Service is now available');
      fetchServices();
    } catch (err: any) { toast.error(err.message); }
  };

  if (loading && services.length === 0) return <LinearProgress />;

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small" placeholder="Search services…" sx={{ minWidth: 220 }}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          />
          <Typography variant="body2" color="text.secondary">{total} service{total !== 1 ? 's' : ''}</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>Create Service</Button>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {/* Services Grid */}
      {services.length === 0 && !loading ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No services yet. Click "Create Service" to add your first service (e.g. Swimming Pool, Hot Tub, Scenery Tour).
        </Alert>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {services.map((svc) => (
            <Card
              key={svc.id}
              sx={{
                width: 280,
                borderLeft: `4px solid ${svc.is_available ? '#4CAF50' : '#9E9E9E'}`,
                opacity: svc.is_available ? 1 : 0.6,
              }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                {/* Media */}
                {svc.media_url && (
                  <Box sx={{ width: '100%', height: 120, borderRadius: 1, overflow: 'hidden', mb: 1 }}>
                    {svc.media_type === 'video' ? (
                      <video src={svc.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                    ) : (
                      <img src={svc.media_url} alt={svc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </Box>
                )}

                {/* Name + Availability */}
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight={700} noWrap sx={{ flex: 1 }}>{svc.name}</Typography>
                  <Chip
                    size="small"
                    label={svc.is_available ? 'Available' : 'Unavailable'}
                    color={svc.is_available ? 'success' : 'default'}
                    sx={{ ml: 1 }}
                  />
                </Stack>

                {/* Description */}
                {svc.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {svc.description}
                  </Typography>
                )}

                {/* Price & Duration */}
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  <strong>{fmt(svc.charge_amount)}</strong>{' '}
                  <Typography component="span" variant="caption" color="text.secondary">
                    / {CHARGE_DURATIONS.find((d) => d.value === svc.charge_duration)?.label ?? svc.charge_duration}
                  </Typography>
                </Typography>

                {/* Actions */}
                <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                  <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => openEdit(svc)}>Edit</Button>
                  <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => handleDelete(svc.id)}>Delete</Button>
                  <Button
                    size="small" variant="outlined"
                    color={svc.is_available ? 'warning' : 'success'}
                    onClick={() => handleToggle(svc)}
                  >
                    {svc.is_available ? 'Disable' : 'Enable'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Pagination */}
      {total > 0 && (
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingService ? 'Edit Service' : 'Create New Service'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* File Upload */}
            <Box>
              <Button
                variant="outlined" component="label" startIcon={<CloudUploadIcon />}
                disabled={uploading} fullWidth
              >
                {uploading ? 'Uploading…' : 'Upload Image/Video (max 15MB)'}
                <input type="file" hidden accept="image/*,video/*" onChange={handleFileUpload} />
              </Button>
              {form.media_url && (
                <Box sx={{ mt: 1, position: 'relative' }}>
                  {form.media_type === 'video' ? (
                    <video src={form.media_url} style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 8 }} controls />
                  ) : (
                    <img src={form.media_url} alt="Service" style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 8 }} />
                  )}
                  <IconButton
                    size="small" sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'background.paper' }}
                    onClick={() => setForm({ ...form, media_url: '', media_type: '' })}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
            </Box>

            {/* Name */}
            <TextField
              label="Service Name *" fullWidth
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Swimming Pool, Hot Tub Bath, Scenery Tour"
            />

            {/* Description */}
            <TextField
              label="Description" fullWidth multiline rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the service offered…"
            />

            {/* Charge & Duration */}
            <Stack direction="row" spacing={1}>
              <TextField
                label="Charge Amount *" type="number" sx={{ flex: 1 }}
                value={form.charge_amount}
                onChange={(e) => setForm({ ...form, charge_amount: e.target.value })}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <FormControl sx={{ minWidth: 160 }}>
                <InputLabel>Duration *</InputLabel>
                <Select
                  value={form.charge_duration}
                  label="Duration *"
                  onChange={(e) => setForm({ ...form, charge_duration: e.target.value })}
                >
                  {CHARGE_DURATIONS.map((d) => (
                    <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            {/* Availability toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={form.is_available}
                  onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
                />
              }
              label="Available for ordering"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {editingService ? 'Update' : 'Create Service'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Users Tab — sub-tabs: Starting / In-Used
   ═══════════════════════════════════════════════════════ */
function UsersTab({ branchId, currency }: { branchId: string; currency: string }) {
  const { fmt } = useCurrency();
  const [subTab, setSubTab] = useState<'starting' | 'inuse'>('starting');

  return (
    <Box>
      <Stack direction="row" spacing={0} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Button
          variant="text"
          onClick={() => setSubTab('starting')}
          startIcon={<PlayArrowIcon />}
          sx={{
            borderBottom: subTab === 'starting' ? '2px solid' : '2px solid transparent',
            borderColor: subTab === 'starting' ? 'primary.main' : 'transparent',
            borderRadius: 0, px: 2, py: 0.75,
            color: subTab === 'starting' ? 'primary.main' : 'text.secondary',
            fontWeight: subTab === 'starting' ? 700 : 400,
          }}
        >
          Starting
        </Button>
        <Button
          variant="text"
          onClick={() => setSubTab('inuse')}
          startIcon={<TimerIcon />}
          sx={{
            borderBottom: subTab === 'inuse' ? '2px solid' : '2px solid transparent',
            borderColor: subTab === 'inuse' ? 'success.main' : 'transparent',
            borderRadius: 0, px: 2, py: 0.75,
            color: subTab === 'inuse' ? 'success.main' : 'text.secondary',
            fontWeight: subTab === 'inuse' ? 700 : 400,
          }}
        >
          In-Used
        </Button>
      </Stack>

      {subTab === 'starting' && <StartingSubTab branchId={branchId} />}
      {subTab === 'inuse' && <InUsedSubTab branchId={branchId} fmt={fmt} />}
    </Box>
  );
}

/* ─────────────────────────────────────────────────────────
   Starting Sub-Tab
   Lists pending_start service bookings; staff can start the service
   ───────────────────────────────────────────────────────── */
function StartingSubTab({ branchId }: { branchId: string }) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [actualStart, setActualStart] = useState('');
  const [startNotes, setStartNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ bookings: any[]; total: number }>('other-services', 'list-pending-starts', {
        params: { page: String(page + 1), page_size: String(pageSize), search },
        branchId,
      });
      setBookings(data.bookings ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, search]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);
  useRealtime('service_bookings', branchId ? { column: 'branch_id', value: branchId } : undefined, () => fetchBookings());

  const openDialog = (booking: any) => {
    setSelectedBooking(booking);
    const defaultStart = booking.scheduled_start
      ? new Date(booking.scheduled_start).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16);
    setActualStart(defaultStart);
    setStartNotes(booking.notes ?? '');
    setDialogOpen(true);
  };

  const handleStart = async () => {
    if (!selectedBooking) return;
    setSubmitting(true);
    try {
      await api('other-services', 'start-service', {
        body: {
          booking_id: selectedBooking.id,
          actual_start: actualStart ? new Date(actualStart).toISOString() : undefined,
          notes: startNotes || undefined,
        },
        branchId,
      });
      toast.success(`${selectedBooking.customer_name} — ${selectedBooking.service_name} started`);
      setDialogOpen(false);
      fetchBookings();
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
        <TextField
          size="small" placeholder="Search customer or service…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          sx={{ width: 280 }}
        />
        <Typography variant="body2" color="text.secondary">{total} pending start{total !== 1 ? 's' : ''}</Typography>
      </Stack>

      {loading ? <LinearProgress /> : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>Order #</TableCell>
                  <TableCell>Service</TableCell>
                  <TableCell>Scheduled Start</TableCell>
                  <TableCell>Scheduled End</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography color="text.secondary" sx={{ py: 3 }}>No pending starts</Typography>
                    </TableCell>
                  </TableRow>
                ) : bookings.map((b) => (
                  <TableRow key={b.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{b.customer_name ?? 'Walk In Customer'}</Typography>
                    </TableCell>
                    <TableCell><Typography variant="body2">{b.order_number ?? '—'}</Typography></TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <SpaIcon fontSize="small" color="secondary" />
                        <Typography variant="body2" fontWeight={600}>{b.service_name}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {b.scheduled_start
                        ? <><Typography variant="body2">{new Date(b.scheduled_start).toLocaleDateString()}</Typography>
                            <Typography variant="caption" color="text.secondary">{new Date(b.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography></>
                        : <Typography variant="body2" color="text.secondary">—</Typography>}
                    </TableCell>
                    <TableCell>
                      {b.scheduled_end
                        ? <><Typography variant="body2">{new Date(b.scheduled_end).toLocaleDateString()}</Typography>
                            <Typography variant="caption" color="text.secondary">{new Date(b.scheduled_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography></>
                        : <Typography variant="body2" color="text.secondary">—</Typography>}
                    </TableCell>
                    <TableCell>
                      {b.duration_count ? (
                        <Typography variant="body2">{b.duration_count} {b.duration_unit}{b.duration_count !== 1 ? 's' : ''}</Typography>
                      ) : '—'}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small" variant="contained" color="success"
                        startIcon={<PlayArrowIcon />}
                        onClick={() => openDialog(b)}
                      >
                        Start
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {total > pageSize && (
            <TablePagination
              component="div" count={total} page={page} rowsPerPage={pageSize}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50]}
            />
          )}
        </>
      )}

      {/* Start Service Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon color="success" />
          Start Service — {selectedBooking?.customer_name ?? 'Customer'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <SpaIcon color="secondary" />
              <Typography fontWeight={600}>{selectedBooking?.service_name}</Typography>
            </Stack>
            {selectedBooking?.duration_count && (
              <Typography variant="body2" color="text.secondary">
                Duration: {selectedBooking.duration_count} {selectedBooking.duration_unit}{selectedBooking.duration_count !== 1 ? 's' : ''}
              </Typography>
            )}
            <TextField
              label="Actual Start Date & Time"
              type="datetime-local"
              fullWidth size="small"
              value={actualStart}
              onChange={(e) => setActualStart(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Notes (optional)"
              fullWidth size="small"
              multiline rows={2}
              value={startNotes}
              onChange={(e) => setStartNotes(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" disabled={submitting} onClick={handleStart}>
            {submitting ? 'Starting…' : 'Confirm Start'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ─────────────────────────────────────────────────────────
   In-Used Sub-Tab
   Lists in_use service bookings with countdown timers,
   actions: Extend, End Service
   ───────────────────────────────────────────────────────── */
function InUsedSubTab({ branchId, fmt }: { branchId: string; fmt: (v: number) => string }) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  const [endDialog, setEndDialog] = useState<any>(null);
  const [actualEnd, setActualEnd] = useState('');
  const [endNotes, setEndNotes] = useState('');
  const [endLoading, setEndLoading] = useState(false);

  const [extendDialog, setExtendDialog] = useState<any>(null);
  const [extendCount, setExtendCount] = useState(1);
  const [extendUnit, setExtendUnit] = useState('hourly');
  const [extendNewEnd, setExtendNewEnd] = useState('');
  const [extendNotes, setExtendNotes] = useState('');
  const [extendLoading, setExtendLoading] = useState(false);

  // Clock tick every minute for countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ bookings: any[]; total: number }>('other-services', 'list-in-use', {
        params: { page: String(page + 1), page_size: String(pageSize), search },
        branchId,
      });
      setBookings(data.bookings ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, search]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);
  useRealtime('service_bookings', branchId ? { column: 'branch_id', value: branchId } : undefined, () => fetchBookings());

  const countdown = (endStr: string | null) => {
    if (!endStr) return null;
    const diff = new Date(endStr).getTime() - now;
    if (diff <= 0) return { label: 'Overdue', color: 'error' as const };
    const totalMins = Math.floor(diff / 60000);
    const days = Math.floor(totalMins / 1440);
    const hrs = Math.floor((totalMins % 1440) / 60);
    const mins = totalMins % 60;
    if (days > 0) return { label: `${days}d ${hrs}h`, color: 'success' as const };
    if (hrs > 0) return { label: `${hrs}h ${mins}m`, color: hrs < 2 ? 'warning' as const : 'success' as const };
    return { label: `${mins}m`, color: 'error' as const };
  };

  const openEndDialog = (b: any) => {
    setEndDialog(b);
    setActualEnd(new Date().toISOString().slice(0, 16));
    setEndNotes('');
  };

  const handleEnd = async () => {
    if (!endDialog) return;
    setEndLoading(true);
    try {
      await api('other-services', 'end-service', {
        body: {
          booking_id: endDialog.id,
          actual_end: actualEnd ? new Date(actualEnd).toISOString() : undefined,
          notes: endNotes || undefined,
        },
        branchId,
      });
      toast.success(`${endDialog.customer_name} — ${endDialog.service_name} ended`);
      setEndDialog(null);
      fetchBookings();
    } catch (err: any) { toast.error(err.message); }
    finally { setEndLoading(false); }
  };

  const openExtendDialog = (b: any) => {
    setExtendDialog(b);
    setExtendCount(1);
    setExtendUnit(b.duration_unit ?? b.other_services?.charge_duration ?? 'hourly');
    setExtendNewEnd('');
    setExtendNotes('');
  };

  const handleExtend = async () => {
    if (!extendDialog) return;
    setExtendLoading(true);
    try {
      const res = await api<{ extension_order_number: string; total: number }>(
        'other-services', 'extend-service', {
          body: {
            booking_id: extendDialog.id,
            duration_count: extendCount,
            duration_unit: extendUnit,
            new_end: extendNewEnd ? new Date(extendNewEnd).toISOString() : undefined,
            notes: extendNotes || undefined,
          },
          branchId,
        },
      );
      toast.success(`Extended — Order #${res.extension_order_number} created (${fmt(res.total)})`);
      setExtendDialog(null);
      fetchBookings();
    } catch (err: any) { toast.error(err.message); }
    finally { setExtendLoading(false); }
  };

  const DURATION_LABELS: Record<string, string> = {
    hourly: 'hr', daily: 'day', weekly: 'wk', monthly: 'mo', per_session: 'session', once: '',
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
        <TextField
          size="small" placeholder="Search customer or service…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          sx={{ width: 280 }}
        />
        <Typography variant="body2" color="text.secondary">{total} service{total !== 1 ? 's' : ''} in-use</Typography>
      </Stack>

      {loading ? <LinearProgress /> : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>Service</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell>Ends</TableCell>
                  <TableCell>Time Left</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography color="text.secondary" sx={{ py: 3 }}>No services currently in-use</Typography>
                    </TableCell>
                  </TableRow>
                ) : bookings.map((b) => {
                  const cd = countdown(b.scheduled_end);
                  return (
                    <TableRow key={b.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{b.customer_name ?? 'Walk In Customer'}</Typography>
                        <Typography variant="caption" color="text.secondary">{b.order_number ?? ''}</Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <SpaIcon fontSize="small" color="secondary" />
                          <Typography variant="body2" fontWeight={600}>{b.service_name}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {b.actual_start
                          ? <><Typography variant="body2">{new Date(b.actual_start).toLocaleDateString()}</Typography>
                              <Typography variant="caption" color="text.secondary">{new Date(b.actual_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography></>
                          : <Typography variant="body2" color="text.secondary">—</Typography>}
                      </TableCell>
                      <TableCell>
                        {b.scheduled_end
                          ? <><Typography variant="body2">{new Date(b.scheduled_end).toLocaleDateString()}</Typography>
                              <Typography variant="caption" color="text.secondary">{new Date(b.scheduled_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography></>
                          : <Typography variant="body2" color="text.secondary">Open-ended</Typography>}
                      </TableCell>
                      <TableCell>
                        {b.scheduled_end && cd ? (
                          <Chip size="small" label={cd.label} color={cd.color} />
                        ) : (
                          <Typography variant="body2" color="text.secondary">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {b.duration_count} {DURATION_LABELS[b.duration_unit] ?? b.duration_unit}{b.duration_count !== 1 ? 's' : ''}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Button size="small" variant="outlined" color="primary" onClick={() => openExtendDialog(b)} sx={{ fontSize: 11 }}>
                            Extend
                          </Button>
                          <Button size="small" variant="contained" color="error" startIcon={<StopIcon />} onClick={() => openEndDialog(b)} sx={{ fontSize: 11 }}>
                            End
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {total > pageSize && (
            <TablePagination
              component="div" count={total} page={page} rowsPerPage={pageSize}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50]}
            />
          )}
        </>
      )}

      {/* End Service Dialog */}
      <Dialog open={!!endDialog} onClose={() => setEndDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StopIcon color="error" />
          End Service — {endDialog?.customer_name}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              Service: <strong>{endDialog?.service_name}</strong>
            </Typography>
            <TextField
              label="Actual End Date & Time" type="datetime-local" fullWidth size="small"
              value={actualEnd} onChange={(e) => setActualEnd(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Notes (optional)" fullWidth size="small" multiline rows={2}
              value={endNotes} onChange={(e) => setEndNotes(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEndDialog(null)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={endLoading} onClick={handleEnd}>
            {endLoading ? 'Processing…' : 'Confirm End'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Extend Service Dialog */}
      <Dialog open={!!extendDialog} onClose={() => setExtendDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CalendarTodayIcon color="primary" />
          Extend Service — {extendDialog?.customer_name}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              Service: <strong>{extendDialog?.service_name}</strong>
              {extendDialog?.unit_price && (
                <> · {fmt(Number(extendDialog.unit_price))}/{DURATION_LABELS[extendDialog.duration_unit] ?? extendDialog.duration_unit}</>
              )}
            </Typography>
            {extendDialog?.unit_price && (
              <Alert severity="info">
                Extension total: <strong>{fmt(Number(extendDialog.unit_price) * extendCount)}</strong>
                {' '}({extendCount} {DURATION_LABELS[extendUnit] ?? extendUnit}{extendCount !== 1 ? 's' : ''})
                — a new pending-payment order will be created.
              </Alert>
            )}
            <Stack direction="row" spacing={1}>
              <TextField
                label="Duration" type="number" size="small" sx={{ width: 120 }}
                value={extendCount}
                onChange={(e) => setExtendCount(Math.max(1, Number(e.target.value)))}
                slotProps={{ htmlInput: { min: 1 } }}
              />
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Unit</InputLabel>
                <Select value={extendUnit} label="Unit" onChange={(e) => setExtendUnit(e.target.value)}>
                  <MenuItem value="hourly">Hour(s)</MenuItem>
                  <MenuItem value="daily">Day(s)</MenuItem>
                  <MenuItem value="weekly">Week(s)</MenuItem>
                  <MenuItem value="monthly">Month(s)</MenuItem>
                  <MenuItem value="per_session">Session(s)</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <TextField
              label="New End Date & Time (optional)" type="datetime-local" fullWidth size="small"
              value={extendNewEnd} onChange={(e) => setExtendNewEnd(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="If set, the end date on the booking will be updated"
            />
            <TextField
              label="Notes (optional)" fullWidth size="small" multiline rows={2}
              value={extendNotes} onChange={(e) => setExtendNotes(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExtendDialog(null)}>Cancel</Button>
          <Button variant="contained" color="primary" disabled={extendLoading || extendCount < 1} onClick={handleExtend}>
            {extendLoading ? 'Processing…' : 'Confirm Extension'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
