import React, { useState } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Typography, Tabs, Tab, Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DataTable, type Column } from '@paxrest/ui';
import { formatCurrency } from '@paxrest/shared-utils';
import { usePaginated, useApi } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function CustomersPage() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Customers" />
        <Tab label="Loyalty Program" />
        <Tab label="Transactions" />
      </Tabs>
      {tab === 0 && <CustomersTab branchId={activeBranchId!} />}
      {tab === 1 && <LoyaltyTab branchId={activeBranchId!} />}
      {tab === 2 && <TransactionsTab branchId={activeBranchId!} />}
    </Box>
  );
}

function CustomersTab({ branchId }: { branchId: string }) {
  const {
    items, total, loading, page, pageSize,
    setPage, setPageSize, setSearch, refetch,
  } = usePaginated<any>('loyalty', 'customers');

  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('loyalty', 'customers', { body: form, branchId });
      toast.success('Customer saved'); setDialog(false); refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Name' },
    { id: 'phone', label: 'Phone' },
    { id: 'email', label: 'Email' },
    { id: 'loyalty_points', label: 'Points', render: (r) => <Typography fontWeight={600}>{r.loyalty_points ?? 0}</Typography> },
    { id: 'total_spent', label: 'Total Spent', render: (r) => r.total_spent ?? 0 },
    { id: 'visit_count', label: 'Visits' },
  ];

  return (
    <>
      <DataTable
        columns={columns} rows={items} totalRows={total}
        page={page} pageSize={pageSize} loading={loading}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        searchable onSearchChange={setSearch}
        rowKey={(r) => r.id}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm({ name: '', phone: '', email: '' }); setDialog(true); }}>Add Customer</Button>}
      />
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Customer</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} sx={{ mb: 2 }} />
          <TextField fullWidth label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function LoyaltyTab({ branchId }: { branchId: string }) {
  const { data, loading, refetch } = useApi<{ program: any }>('loyalty', 'program', undefined, [branchId]);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (data?.program) setForm(data.program);
  }, [data]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api('loyalty', 'program', { body: form, branchId });
      toast.success('Loyalty program updated'); refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (loading || !form) return <Typography>Loading…</Typography>;

  return (
    <Box sx={{ maxWidth: 500 }}>
      <Grid container spacing={2}>
        <Grid size={6}>
          <TextField fullWidth label="Points per unit currency" type="number" value={form.points_per_currency ?? 1} onChange={(e) => setForm({ ...form, points_per_currency: Number(e.target.value) })} />
        </Grid>
        <Grid size={6}>
          <TextField fullWidth label="Currency per point (redeem)" type="number" value={form.currency_per_point ?? 0.01} onChange={(e) => setForm({ ...form, currency_per_point: Number(e.target.value) })} />
        </Grid>
        <Grid size={6}>
          <TextField fullWidth label="Min redeem points" type="number" value={form.min_redeem_points ?? 100} onChange={(e) => setForm({ ...form, min_redeem_points: Number(e.target.value) })} />
        </Grid>
        <Grid size={12}>
          <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
        </Grid>
      </Grid>
    </Box>
  );
}

function TransactionsTab({ branchId }: { branchId: string }) {
  const { items, total, loading, page, pageSize, setPage, setPageSize } = usePaginated<any>('loyalty', 'transactions');

  const columns: Column[] = [
    { id: 'customer', label: 'Customer', render: (r) => r.customers?.name ?? '—' },
    { id: 'type', label: 'Type', render: (r) => r.transaction_type },
    { id: 'points', label: 'Points', render: (r) => <Typography color={r.points > 0 ? 'success.main' : 'error.main'} fontWeight={600}>{r.points > 0 ? '+' : ''}{r.points}</Typography> },
    { id: 'description', label: 'Description' },
    { id: 'created_at', label: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return <DataTable columns={columns} rows={items} totalRows={total} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} onPageSizeChange={setPageSize} rowKey={(r) => r.id} />;
}
