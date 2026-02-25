import React, { useState } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Typography, Tabs, Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DataTable, type Column } from '@paxrest/ui';
import { formatCurrency } from '@paxrest/shared-utils';
import { usePaginated, useApi } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

export default function SuppliersPage() {
  return (
    <BranchGuard>
      <SuppliersContent />
    </BranchGuard>
  );
}

function SuppliersContent() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Suppliers" />
        <Tab label="Purchase Orders" />
      </Tabs>
      {tab === 0 && <SuppliersTab />}
      {tab === 1 && <PurchaseOrdersTab />}
    </Box>
  );
}

function SuppliersTab() {
  const { activeBranchId } = useAuth();
  const { data, loading, refetch } = useApi<{ suppliers: any[] }>('suppliers', 'list', undefined, [activeBranchId]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('suppliers', 'upsert', { body: form, branchId: activeBranchId! });
      toast.success('Supplier saved'); setDialog(false); refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Name' },
    { id: 'contact_person', label: 'Contact' },
    { id: 'phone', label: 'Phone' },
    { id: 'email', label: 'Email' },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm({ name: '', contact_person: '', phone: '', email: '', address: '' }); setDialog(true); }}>
          Add Supplier
        </Button>
      </Box>
      <DataTable columns={columns} rows={data?.suppliers ?? []} loading={loading} onRowClick={(r) => { setForm(r); setDialog(true); }} rowKey={(r) => r.id} />
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{(form as any).id ? 'Edit Supplier' : 'New Supplier'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}><TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Contact Person" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Grid>
            <Grid size={12}><TextField fullWidth label="Address" multiline rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Grid>
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

function PurchaseOrdersTab() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const { items, total, loading, page, pageSize, setPage, setPageSize, refetch } = usePaginated<any>('suppliers', 'purchase-orders');

  const columns: Column[] = [
    { id: 'supplier', label: 'Supplier', render: (r) => r.suppliers?.name ?? '—' },
    { id: 'status', label: 'Status' },
    { id: 'total_amount', label: 'Total', render: (r) => formatCurrency(r.total_amount ?? 0, currency) },
    { id: 'items_count', label: 'Items', render: (r) => r.purchase_order_items?.length ?? 0 },
    { id: 'created_at', label: 'Created', render: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <DataTable columns={columns} rows={items} totalRows={total} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} onPageSizeChange={setPageSize} rowKey={(r) => r.id} />
  );
}
