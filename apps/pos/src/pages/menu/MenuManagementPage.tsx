import React, { useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Tabs, Tab, Switch, FormControlLabel, Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DataTable, type Column } from '@paxrest/ui';
import { formatCurrency } from '@paxrest/shared-utils';
import { usePaginated, useApi } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function MenuManagementPage() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Categories" />
        <Tab label="Items" />
        <Tab label="Modifier Groups" />
      </Tabs>

      {tab === 0 && <CategoriesTab branchId={activeBranchId!} />}
      {tab === 1 && <ItemsTab branchId={activeBranchId!} currency={currency} />}
      {tab === 2 && <ModifierGroupsTab branchId={activeBranchId!} />}
    </Box>
  );
}

/* ─── Categories Tab ─── */
function CategoriesTab({ branchId }: { branchId: string }) {
  const { data, loading, refetch } = useApi<{ categories: any[] }>('menu', 'categories', undefined, [branchId]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('menu', 'categories', {
        body: { id: form.id || undefined, name: form.name, sort_order: form.sort_order },
        branchId,
      });
      toast.success('Category saved');
      setDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Name' },
    { id: 'sort_order', label: 'Order', width: 80 },
    { id: 'is_active', label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No', width: 80 },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm({ id: '', name: '', sort_order: 0 }); setDialog(true); }}>
          Add Category
        </Button>
      </Box>
      <DataTable
        columns={columns}
        rows={data?.categories ?? []}
        loading={loading}
        onRowClick={(r) => { setForm({ id: r.id, name: r.name, sort_order: r.sort_order }); setDialog(true); }}
        rowKey={(r) => r.id}
      />
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{form.id ? 'Edit Category' : 'New Category'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Sort Order" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ─── Items Tab ─── */
function ItemsTab({ branchId, currency }: { branchId: string; currency: string }) {
  const {
    items, total, loading, page, pageSize, sortBy, sortDir,
    setPage, setPageSize, onSortChange, setSearch, refetch,
  } = usePaginated<any>('menu', 'items');

  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState<any>({
    id: '', name: '', description: '', base_price: 0,
    category_id: '', kitchen_station: 'kitchen',
    is_available: true, is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('menu', 'items', {
        body: { ...form, id: form.id || undefined },
        branchId,
      });
      toast.success('Item saved');
      setDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Item' },
    { id: 'base_price', label: 'Price', render: (r) => formatCurrency(r.base_price, currency), width: 100 },
    { id: 'kitchen_station', label: 'Station', width: 100 },
    { id: 'is_available', label: 'Available', render: (r) => r.is_available ? 'Yes' : 'No', width: 80 },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm({ id: '', name: '', description: '', base_price: 0, category_id: '', kitchen_station: 'kitchen', is_available: true, is_active: true }); setDialog(true); }}>
          Add Item
        </Button>
      </Box>
      <DataTable
        columns={columns}
        rows={items}
        totalRows={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        sortBy={sortBy}
        sortDir={sortDir}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSortChange={onSortChange}
        searchable
        onSearchChange={setSearch}
        onRowClick={(r) => { setForm(r); setDialog(true); }}
        rowKey={(r) => r.id}
      />
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{form.id ? 'Edit Item' : 'New Item'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}><TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid size={12}><TextField fullWidth label="Description" multiline rows={2} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Base Price" type="number" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: Number(e.target.value) })} /></Grid>
            <Grid size={6}>
              <TextField fullWidth label="Station" select value={form.kitchen_station} onChange={(e) => setForm({ ...form, kitchen_station: e.target.value })} slotProps={{ select: { native: true } }}>
                <option value="kitchen">Kitchen</option>
                <option value="bar">Bar</option>
                <option value="shisha">Shisha</option>
              </TextField>
            </Grid>
            <Grid size={6}><FormControlLabel control={<Switch checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} />} label="Available" /></Grid>
            <Grid size={6}><FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Active" /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ─── Modifier Groups Tab ─── */
function ModifierGroupsTab({ branchId }: { branchId: string }) {
  const { data, loading, refetch } = useApi<{ modifier_groups: any[] }>('menu', 'modifier-groups', undefined, [branchId]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState<any>({ id: '', name: '', min_select: 0, max_select: 1, is_required: false });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('menu', 'modifier-groups', {
        body: { ...form, id: form.id || undefined },
        branchId,
      });
      toast.success('Modifier group saved');
      setDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Name' },
    { id: 'min_select', label: 'Min', width: 60 },
    { id: 'max_select', label: 'Max', width: 60 },
    { id: 'is_required', label: 'Required', render: (r) => r.is_required ? 'Yes' : 'No', width: 80 },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm({ id: '', name: '', min_select: 0, max_select: 1, is_required: false }); setDialog(true); }}>
          Add Group
        </Button>
      </Box>
      <DataTable
        columns={columns}
        rows={data?.modifier_groups ?? []}
        loading={loading}
        onRowClick={(r) => { setForm(r); setDialog(true); }}
        rowKey={(r) => r.id}
      />
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{form.id ? 'Edit Modifier Group' : 'New Modifier Group'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <Grid container spacing={2}>
            <Grid size={6}><TextField fullWidth label="Min Select" type="number" value={form.min_select} onChange={(e) => setForm({ ...form, min_select: Number(e.target.value) })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Max Select" type="number" value={form.max_select} onChange={(e) => setForm({ ...form, max_select: Number(e.target.value) })} /></Grid>
          </Grid>
          <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} />} label="Required" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
