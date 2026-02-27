import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Grid, Paper, Typography, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField,
  Tabs, Tab, IconButton, Avatar, MenuItem, TablePagination,
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import PeopleIcon from '@mui/icons-material/People';
import { TABLE_STATUS_COLORS } from '@paxrest/ui';
import { useAuth } from '@/contexts/AuthContext';
import { api, supabase } from '@/lib/supabase';
import { useRealtime } from '@/hooks';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

/* ─── Types ─── */
interface TableData {
  id: string;
  table_number: string;
  name: string;
  capacity: number;
  section?: string;
  status: string;
  image_url?: string | null;
  notes?: string | null;
  assigned_customer_name?: string | null;
  num_people?: number | null;
  current_order?: { id: string; order_number: number; total_amount: number } | null;
}

interface LayoutSection {
  section: string;
  tables: TableData[];
  available: number;
  total: number;
}

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  dirty: 'Dirty',
  maintenance: 'Maintenance',
};
const STATUS_KEYS = Object.keys(STATUS_LABELS);

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

export default function TablesPage() {
  return <BranchGuard><TablesContent /></BranchGuard>;
}

/* ─── Upload helper (same pattern as MenuManagementPage) ─── */
async function uploadTableImage(file: File, branchId: string): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeFile = new File([file], sanitized, { type: file.type });

  const fd = new FormData();
  fd.append('file', safeFile);
  fd.append('category', 'table');
  fd.append('reference_type', 'table');

  const res = await fetch(`${supabaseUrl}/functions/v1/file-upload/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'x-branch-id': branchId,
    },
    body: fd,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? json.error ?? 'Upload failed');
  return json.file.url;
}

/* ─── Main Content ─── */
function TablesContent() {
  const { activeBranchId } = useAuth();
  const [sections, setSections] = useState<LayoutSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalForStatus, setTotalForStatus] = useState(0);

  // Add/Edit dialog state
  const [editDialog, setEditDialog] = useState(false);
  const [form, setForm] = useState<any>({
    table_number: '1', name: '', capacity: 4, section: 'Main', notes: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Assign dialog state
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignTable, setAssignTableData] = useState<TableData | null>(null);
  const [assignForm, setAssignForm] = useState({ num_people: 1, customer_name: '', status: 'occupied' });
  const [assigning, setAssigning] = useState(false);

  /* ─── Fetch ─── */
  const fetchLayout = async () => {
    try {
      const currentStatus = STATUS_KEYS[tab];
      const data = await api<{ sections: LayoutSection[]; totalForStatus: number }>('tables', 'layout', {
        params: {
          status: currentStatus,
          page: String(page + 1),
          page_size: String(pageSize),
        },
        branchId: activeBranchId!,
      });
      setSections(data.sections ?? []);
      setTotalForStatus(data.totalForStatus ?? 0);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { if (activeBranchId) { setLoading(true); fetchLayout(); } }, [activeBranchId, tab, page, pageSize]);

  useRealtime('tables', activeBranchId ? { column: 'branch_id', value: activeBranchId } : undefined, () => {
    fetchLayout();
  });

  /* ─── Status change (quick action chips) ─── */
  const handleStatusChange = async (tableId: string, status: string) => {
    try {
      await api('tables', 'update-status', { body: { table_id: tableId, status }, branchId: activeBranchId! });
      toast.success(`Table updated to ${status}`);
      fetchLayout();
    } catch (err: any) { toast.error(err.message); }
  };

  /* ─── Image select ─── */
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Only JPEG, PNG, WebP, and GIF images are allowed');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB`);
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  /* ─── Save table ─── */
  const handleSaveTable = async () => {
    if (!form.table_number || !form.name) {
      toast.error('Table number and name are required');
      return;
    }
    setSaving(true);
    try {
      let image_url = form.image_url ?? undefined;

      // Upload image first if selected
      if (imageFile && activeBranchId) {
        image_url = await uploadTableImage(imageFile, activeBranchId);
      }

      await api('tables', 'upsert', {
        body: { ...form, image_url },
        branchId: activeBranchId!,
      });
      toast.success('Table saved');
      setEditDialog(false);
      setImageFile(null);
      setImagePreview(null);
      fetchLayout();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  /* ─── Assign table ─── */
  const openAssignDialog = (table: TableData) => {
    setAssignTableData(table);
    setAssignForm({ num_people: 1, customer_name: '', status: 'occupied' });
    setAssignDialog(true);
  };

  const handleAssign = async () => {
    if (!assignTable) return;
    if (assignForm.num_people > assignTable.capacity) {
      toast.error(`People count exceeds table capacity (${assignTable.capacity})`);
      return;
    }
    setAssigning(true);
    try {
      await api('tables', 'assign', {
        body: {
          table_id: assignTable.id,
          num_people: assignForm.num_people,
          customer_name: assignForm.customer_name || undefined,
          status: assignForm.status,
        },
        branchId: activeBranchId!,
      });
      toast.success('Table assigned');
      setAssignDialog(false);
      fetchLayout();
    } catch (err: any) { toast.error(err.message); }
    finally { setAssigning(false); }
  };

  /* ─── Open Add dialog ─── */
  const openAddDialog = () => {
    setForm({ table_number: '1', name: '', capacity: 4, section: 'Main', notes: '' });
    setImageFile(null);
    setImagePreview(null);
    setEditDialog(true);
  };

  /* ─── Current status tab ─── */
  const currentStatus = STATUS_KEYS[tab];
  const currentSection = sections.find((s) => s.section === currentStatus);
  const currentTables = currentSection?.tables ?? [];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" fontWeight={700}>Tables</Typography>
        <Button variant="contained" onClick={openAddDialog}>Add Table</Button>
      </Box>

      {/* Status tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => { setTab(v); setPage(0); }}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2 }}
      >
        {STATUS_KEYS.map((s) => {
          const sec = sections.find((sc) => sc.section === s);
          const count = sec?.total ?? 0;
          return (
            <Tab
              key={s}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: TABLE_STATUS_COLORS[s] }} />
                  {STATUS_LABELS[s]}
                  <Chip size="small" label={count} sx={{ ml: 0.5, height: 20, minWidth: 24 }} />
                </Box>
              }
            />
          );
        })}
      </Tabs>

      {/* Table grid */}
      {loading ? <Typography>Loading…</Typography> : currentTables.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No tables with status "{STATUS_LABELS[currentStatus]}"
        </Typography>
      ) : (
        <Grid container spacing={1.5}>
          {currentTables.map((table) => (
            <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={table.id}>
              <Paper
                sx={{
                  p: 2, textAlign: 'center', borderRadius: 2,
                  border: '2px solid',
                  borderColor: TABLE_STATUS_COLORS[table.status] ?? '#9E9E9E',
                  bgcolor: `${TABLE_STATUS_COLORS[table.status] ?? '#9E9E9E'}15`,
                  '&:hover': { boxShadow: 2 },
                }}
              >
                {/* Table image or fallback */}
                {table.image_url ? (
                  <Avatar
                    src={table.image_url}
                    variant="rounded"
                    sx={{ width: 56, height: 56, mx: 'auto', mb: 1 }}
                  />
                ) : (
                  <Avatar variant="rounded" sx={{ width: 56, height: 56, mx: 'auto', mb: 1, bgcolor: TABLE_STATUS_COLORS[table.status] ?? '#9E9E9E' }}>
                    {(table.name || `T${table.table_number}`).charAt(0)}
                  </Avatar>
                )}

                <Typography variant="subtitle1" fontWeight={700}>
                  {table.name || `T${table.table_number}`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  #{table.table_number} · {table.capacity} seats
                </Typography>

                {/* Assignment info */}
                {table.assigned_customer_name && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                    {table.assigned_customer_name}
                  </Typography>
                )}
                {table.num_people && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3 }}>
                    <PeopleIcon sx={{ fontSize: 14 }} /> {table.num_people}/{table.capacity}
                  </Typography>
                )}

                {/* Notes */}
                {table.notes && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.3, fontStyle: 'italic' }} noWrap>
                    {table.notes}
                  </Typography>
                )}

                {/* Status chip */}
                <Chip
                  size="small" label={table.status.replace('_', ' ')}
                  sx={{ mt: 1, bgcolor: TABLE_STATUS_COLORS[table.status], color: '#fff', display: 'block' }}
                />

                {table.current_order && (
                  <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mt: 0.5 }}>
                    #{table.current_order.order_number}
                  </Typography>
                )}

                {/* Action buttons */}
                <Box sx={{ mt: 1, display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {table.status === 'available' && (
                    <Chip size="small" label="Assign" variant="outlined" color="primary"
                      onClick={() => openAssignDialog(table)} />
                  )}
                  {table.status === 'occupied' && (
                    <>
                      <Chip size="small" label="Dirty" variant="outlined"
                        onClick={() => handleStatusChange(table.id, 'dirty')} />
                      <Chip size="small" label="Free" variant="outlined" color="success"
                        onClick={() => handleStatusChange(table.id, 'available')} />
                    </>
                  )}
                  {table.status === 'reserved' && (
                    <>
                      <Chip size="small" label="Seat" variant="outlined" color="primary"
                        onClick={() => handleStatusChange(table.id, 'occupied')} />
                      <Chip size="small" label="Free" variant="outlined" color="success"
                        onClick={() => handleStatusChange(table.id, 'available')} />
                    </>
                  )}
                  {table.status === 'dirty' && (
                    <Chip size="small" label="Clean" variant="outlined" color="success"
                      onClick={() => handleStatusChange(table.id, 'available')} />
                  )}
                  {table.status === 'maintenance' && (
                    <Chip size="small" label="Activate" variant="outlined" color="success"
                      onClick={() => handleStatusChange(table.id, 'available')} />
                  )}
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Pagination */}
      {totalForStatus > 0 && (
        <TablePagination
          component="div" count={totalForStatus} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
        />
      )}

      {/* ─── Add / Edit Table Dialog ─── */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Table</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={6}>
              <TextField fullWidth label="Number" value={form.table_number}
                onChange={(e) => setForm({ ...form, table_number: e.target.value })} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Capacity" type="number" value={form.capacity}
                inputProps={{ min: 1 }}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Section" value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth label="Notes (optional)" value={form.notes}
                multiline rows={2}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Grid>

            {/* Image upload */}
            <Grid size={12}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={handleImageSelect}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {imagePreview ? (
                  <Avatar src={imagePreview} variant="rounded" sx={{ width: 64, height: 64 }} />
                ) : (
                  <Avatar variant="rounded" sx={{ width: 64, height: 64, bgcolor: 'action.hover' }}>
                    <AddPhotoAlternateIcon />
                  </Avatar>
                )}
                <Box>
                  <Button size="small" variant="outlined" onClick={() => fileInputRef.current?.click()}>
                    {imagePreview ? 'Change Image' : 'Upload Image'}
                  </Button>
                  <Typography variant="caption" display="block" color="text.secondary">
                    Max 5MB · JPEG, PNG, WebP, GIF
                  </Typography>
                </Box>
                {imagePreview && (
                  <IconButton size="small" onClick={() => { setImageFile(null); setImagePreview(null); }}>
                    ✕
                  </IconButton>
                )}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTable} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Assign Table Dialog ─── */}
      <Dialog open={assignDialog} onClose={() => setAssignDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign Table — {assignTable?.name || `T${assignTable?.table_number}`}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Number of People"
                type="number"
                value={assignForm.num_people}
                inputProps={{ min: 1, max: assignTable?.capacity ?? 99 }}
                helperText={`Max capacity: ${assignTable?.capacity ?? '-'}`}
                onChange={(e) => setAssignForm({ ...assignForm, num_people: Number(e.target.value) })}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Customer Name (optional)"
                value={assignForm.customer_name}
                onChange={(e) => setAssignForm({ ...assignForm, customer_name: e.target.value })}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                select
                label="Status"
                value={assignForm.status}
                onChange={(e) => setAssignForm({ ...assignForm, status: e.target.value })}
              >
                <MenuItem value="occupied">Occupied</MenuItem>
                <MenuItem value="reserved">Reserved</MenuItem>
                <MenuItem value="dirty">Dirty</MenuItem>
                <MenuItem value="maintenance">Maintenance</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAssign} disabled={assigning}>
            {assigning ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
