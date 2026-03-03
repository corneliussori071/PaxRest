import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Stack, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, Alert, LinearProgress, Chip,
  FormControl, InputLabel, Select, Switch, FormControlLabel, IconButton,
  TablePagination,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloseIcon from '@mui/icons-material/Close';
import MenuItem from '@mui/material/MenuItem';
import { formatCurrency } from '@paxrest/shared-utils';
import { useAuth } from '@/contexts/AuthContext';
import { api, supabase } from '@/lib/supabase';
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
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';

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

  const fmt = (n: number) => formatCurrency(n, currency);

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
