import React, { useState } from 'react';
import {
  Box, Tabs, Tab, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Chip, Typography,
} from '@mui/material';
import { DataTable, StatusBadge, type Column } from '@paxrest/ui';
import { usePaginated } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function DeliveryPage() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Deliveries" />
        <Tab label="Riders" />
        <Tab label="Zones" />
      </Tabs>
      {tab === 0 && <DeliveriesTab />}
      {tab === 1 && <RidersTab />}
      {tab === 2 && <ZonesTab />}
    </Box>
  );
}

function DeliveriesTab() {
  const { activeBranchId } = useAuth();
  const { items, total, loading, page, pageSize, setPage, setPageSize, refetch } = usePaginated<any>('delivery', 'deliveries');
  const [assignDialog, setAssignDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [selectedRider, setSelectedRider] = useState('');

  const handleAssign = async () => {
    try {
      await api('delivery', 'assign', { body: { order_id: selectedOrder, rider_id: selectedRider }, branchId: activeBranchId! });
      toast.success('Delivery assigned');
      setAssignDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const columns: Column[] = [
    { id: 'order_number', label: 'Order', render: (r) => `#${r.orders?.order_number ?? '—'}` },
    { id: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} type="delivery" /> },
    { id: 'rider', label: 'Rider', render: (r) => r.riders?.profiles?.full_name ?? 'Unassigned' },
    { id: 'estimated_delivery_time', label: 'ETA', render: (r) => r.estimated_delivery_time ? new Date(r.estimated_delivery_time).toLocaleTimeString() : '—' },
    { id: 'created_at', label: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={() => setAssignDialog(true)}>Assign Delivery</Button>
      </Box>
      <DataTable columns={columns} rows={items} totalRows={total} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} onPageSizeChange={setPageSize} rowKey={(r) => r.id} />
      <Dialog open={assignDialog} onClose={() => setAssignDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign Delivery</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Order ID" value={selectedOrder} onChange={(e) => setSelectedOrder(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Rider ID" value={selectedRider} onChange={(e) => setSelectedRider(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAssign}>Assign</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function RidersTab() {
  const { activeBranchId } = useAuth();
  const { items, total, loading, page, pageSize, setPage, setPageSize, refetch } = usePaginated<any>('delivery', 'riders');
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ profile_id: '', vehicle_type: 'motorcycle', vehicle_plate: '', phone: '' });

  const handleSave = async () => {
    try {
      await api('delivery', 'riders', { body: form, branchId: activeBranchId! });
      toast.success('Rider saved'); setDialog(false); refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Name', render: (r) => r.profiles?.full_name ?? '—' },
    { id: 'vehicle_type', label: 'Vehicle' },
    { id: 'vehicle_plate', label: 'Plate' },
    { id: 'is_available', label: 'Available', render: (r) => r.is_available ? <Chip size="small" color="success" label="Yes" /> : <Chip size="small" label="No" /> },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={() => setDialog(true)}>Add Rider</Button>
      </Box>
      <DataTable columns={columns} rows={items} totalRows={total} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} onPageSizeChange={setPageSize} rowKey={(r) => r.id} />
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Rider</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Profile/User ID" value={form.profile_id} onChange={(e) => setForm({ ...form, profile_id: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Vehicle Type" value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} sx={{ mb: 2 }} />
          <TextField fullWidth label="Vehicle Plate" value={form.vehicle_plate} onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })} sx={{ mb: 2 }} />
          <TextField fullWidth label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function ZonesTab() {
  const { activeBranchId } = useAuth();
  const { items, loading, refetch } = usePaginated<any>('delivery', 'zones');
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ name: '', delivery_fee: 0, min_order_amount: 0, estimated_minutes: 30 });

  const handleSave = async () => {
    try {
      await api('delivery', 'zones', { body: form, branchId: activeBranchId! });
      toast.success('Zone saved'); setDialog(false); refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Zone' },
    { id: 'delivery_fee', label: 'Fee' },
    { id: 'min_order_amount', label: 'Min Order' },
    { id: 'estimated_minutes', label: 'Est. Minutes' },
    { id: 'is_active', label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={() => setDialog(true)}>Add Zone</Button>
      </Box>
      <DataTable columns={columns} rows={items} loading={loading} rowKey={(r) => r.id} onRowClick={(r) => { setForm(r); setDialog(true); }} />
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delivery Zone</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <Grid container spacing={2}>
            <Grid size={6}><TextField fullWidth label="Fee" type="number" value={form.delivery_fee} onChange={(e) => setForm({ ...form, delivery_fee: Number(e.target.value) })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Min Order" type="number" value={form.min_order_amount} onChange={(e) => setForm({ ...form, min_order_amount: Number(e.target.value) })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Est. Minutes" type="number" value={form.estimated_minutes} onChange={(e) => setForm({ ...form, estimated_minutes: Number(e.target.value) })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
