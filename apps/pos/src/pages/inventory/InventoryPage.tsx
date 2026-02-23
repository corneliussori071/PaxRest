import React, { useState } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Tabs, Tab, Chip,
  Typography, FormControlLabel, Switch,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import WarningIcon from '@mui/icons-material/Warning';
import { DataTable, type Column } from '@paxrest/ui';
import { formatCurrency } from '@paxrest/shared-utils';
import { usePaginated, useApi } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function InventoryPage() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Stock" />
        <Tab label="Movements" />
        <Tab label="Wastage" />
        <Tab label="Low Stock" />
      </Tabs>
      {tab === 0 && <StockTab branchId={activeBranchId!} currency={currency} />}
      {tab === 1 && <MovementsTab branchId={activeBranchId!} />}
      {tab === 2 && <WastageTab branchId={activeBranchId!} />}
      {tab === 3 && <LowStockTab branchId={activeBranchId!} />}
    </Box>
  );
}

/* ─── Stock Tab ─── */
function StockTab({ branchId, currency }: { branchId: string; currency: string }) {
  const {
    items, total, loading, page, pageSize, sortBy, sortDir,
    setPage, setPageSize, onSortChange, setSearch, refetch,
  } = usePaginated<any>('inventory', 'items');

  const [dialog, setDialog] = useState(false);
  const [adjustDialog, setAdjustDialog] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', unit: '', category: '', quantity: 0, low_stock_threshold: 10, cost_per_unit: 0 });
  const [adjustForm, setAdjustForm] = useState({ quantity_change: 0, reason: '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('inventory', 'items', {
        body: { ...form, id: form.id || undefined },
        branchId,
      });
      toast.success('Item saved');
      setDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleAdjust = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api('inventory', 'adjust', {
        body: { inventory_item_id: selected.id, quantity_change: adjustForm.quantity_change, reason: adjustForm.reason },
        branchId,
      });
      toast.success('Stock adjusted');
      setAdjustDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Item' },
    { id: 'category', label: 'Category', width: 120 },
    { id: 'quantity', label: 'Qty', width: 80, render: (r) => (
      <Typography fontWeight={600} color={r.quantity <= r.low_stock_threshold ? 'error' : 'text.primary'}>
        {r.quantity} {r.unit}
      </Typography>
    )},
    { id: 'cost_per_unit', label: 'Cost', width: 100, render: (r) => formatCurrency(r.cost_per_unit, currency) },
    { id: 'actions', label: '', width: 80, sortable: false, render: (r) => (
      <Button size="small" onClick={(e) => { e.stopPropagation(); setSelected(r); setAdjustForm({ quantity_change: 0, reason: '' }); setAdjustDialog(true); }}>
        Adjust
      </Button>
    )},
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm({ name: '', unit: 'kg', category: '', quantity: 0, low_stock_threshold: 10, cost_per_unit: 0 }); setDialog(true); }}>
          Add Item
        </Button>
      </Box>
      <DataTable
        columns={columns} rows={items} totalRows={total}
        page={page} pageSize={pageSize} loading={loading}
        sortBy={sortBy} sortDir={sortDir}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={onSortChange} searchable onSearchChange={setSearch}
        onRowClick={(r) => { setForm(r); setDialog(true); }}
        rowKey={(r) => r.id}
      />

      {/* Upsert Dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{form.id ? 'Edit Item' : 'New Item'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={8}><TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid size={4}><TextField fullWidth label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Category" value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Cost/Unit" type="number" value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: Number(e.target.value) })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Low Stock Threshold" type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Adjust Dialog */}
      <Dialog open={adjustDialog} onClose={() => setAdjustDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Adjust Stock: {selected?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Current: {selected?.quantity} {selected?.unit}
          </Typography>
          <TextField fullWidth label="Quantity Change (+/-)" type="number" value={adjustForm.quantity_change} onChange={(e) => setAdjustForm({ ...adjustForm, quantity_change: Number(e.target.value) })} sx={{ mb: 2 }} />
          <TextField fullWidth label="Reason" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdjust} disabled={saving}>Adjust</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ─── Movements Tab ─── */
function MovementsTab({ branchId }: { branchId: string }) {
  const { items, total, loading, page, pageSize, setPage, setPageSize } = usePaginated<any>('inventory', 'movements');

  const columns: Column[] = [
    { id: 'inventory_item_name', label: 'Item', render: (r) => r.inventory_items?.name ?? '—' },
    { id: 'movement_type', label: 'Type', render: (r) => <Chip size="small" label={r.movement_type?.replace('_', ' ')} /> },
    { id: 'quantity_change', label: 'Change', render: (r) => (
      <Typography color={r.quantity_change > 0 ? 'success.main' : 'error.main'} fontWeight={600}>
        {r.quantity_change > 0 ? '+' : ''}{r.quantity_change}
      </Typography>
    )},
    { id: 'performed_by_name', label: 'By' },
    { id: 'created_at', label: 'Time', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return <DataTable columns={columns} rows={items} totalRows={total} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} onPageSizeChange={setPageSize} rowKey={(r) => r.id} />;
}

/* ─── Wastage Tab ─── */
function WastageTab({ branchId }: { branchId: string }) {
  const { items, total, loading, page, pageSize, setPage, setPageSize, refetch } = usePaginated<any>('inventory', 'wastage');
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ inventory_item_id: '', quantity: 0, wastage_type: 'expired', reason: '' });
  const [saving, setSaving] = useState(false);

  const handleRecord = async () => {
    setSaving(true);
    try {
      await api('inventory', 'wastage', { body: form, branchId });
      toast.success('Wastage recorded');
      setDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns: Column[] = [
    { id: 'item', label: 'Item', render: (r) => r.inventory_items?.name ?? '—' },
    { id: 'quantity', label: 'Qty' },
    { id: 'wastage_type', label: 'Type', render: (r) => <Chip size="small" label={r.wastage_type} /> },
    { id: 'reason', label: 'Reason' },
    { id: 'recorded_by_name', label: 'By' },
    { id: 'created_at', label: 'Time', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" color="warning" startIcon={<WarningIcon />} onClick={() => setDialog(true)}>
          Record Wastage
        </Button>
      </Box>
      <DataTable columns={columns} rows={items} totalRows={total} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} onPageSizeChange={setPageSize} rowKey={(r) => r.id} />
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Record Wastage</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Inventory Item ID" value={form.inventory_item_id} onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })} sx={{ mt: 1, mb: 2 }} helperText="Enter item UUID" />
          <TextField fullWidth label="Quantity" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} sx={{ mb: 2 }} />
          <TextField fullWidth label="Type" select value={form.wastage_type} onChange={(e) => setForm({ ...form, wastage_type: e.target.value })} sx={{ mb: 2 }} slotProps={{ select: { native: true } }}>
            <option value="expired">Expired</option>
            <option value="damaged">Damaged</option>
            <option value="spoiled">Spoiled</option>
            <option value="overcooked">Overcooked</option>
            <option value="dropped">Dropped</option>
            <option value="other">Other</option>
          </TextField>
          <TextField fullWidth label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleRecord} disabled={saving}>Record</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ─── Low Stock Tab ─── */
function LowStockTab({ branchId }: { branchId: string }) {
  const { data, loading } = useApi<{ items: any[] }>('inventory', 'low-stock', undefined, [branchId]);

  const columns: Column[] = [
    { id: 'name', label: 'Item' },
    { id: 'quantity', label: 'Current Qty', render: (r) => <Typography color="error" fontWeight={600}>{r.quantity} {r.unit}</Typography> },
    { id: 'low_stock_threshold', label: 'Threshold' },
  ];

  return <DataTable columns={columns} rows={data?.items ?? []} loading={loading} rowKey={(r) => r.id} emptyMessage="All items are above threshold" />;
}
