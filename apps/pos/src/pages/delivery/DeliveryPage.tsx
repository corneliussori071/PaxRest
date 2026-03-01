import React, { useState } from 'react';
import {
  Box, Tabs, Tab, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Chip, Typography, IconButton,
  Menu, MenuItem, FormControl, InputLabel, Select, Alert,
  CircularProgress, Divider, Stack,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import { DataTable, StatusBadge, type Column } from '@paxrest/ui';
import { usePaginated, useApi } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

// Status-to-color map for delivery
const DELIVERY_STATUS_COLORS: Record<string, 'default' | 'warning' | 'primary' | 'success' | 'error' | 'info'> = {
  pending_assignment: 'warning',
  assigned: 'info',
  picked_up: 'primary',
  in_transit: 'primary',
  delivered: 'success',
  failed: 'error',
  returned: 'default',
  cancelled: 'error',
};

const TERMINAL_STATUSES = ['assigned', 'picked_up', 'in_transit'];

export default function DeliveryPage() {
  return (
    <BranchGuard>
      <DeliveryContent />
    </BranchGuard>
  );
}

function DeliveryContent() {
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

// 
// DELIVERIES TAB
// 

function DeliveriesTab() {
  const { activeBranchId } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const { items, total, loading, page, pageSize, setPage, setPageSize, refetch } =
    usePaginated<any>('delivery', 'deliveries', statusFilter ? { status: statusFilter } : undefined);

  const [reassignDlg, setReassignDlg] = useState<any>(null);

  const handleStatusChange = async (deliveryId: string, oldStatus: string, newStatus: string) => {
    if (!confirm(`Mark delivery as ${newStatus.replace(/_/g, ' ')}?`)) return;
    try {
      await api('delivery', 'update-status', {
        method: 'POST',
        body: { delivery_id: deliveryId, old_status: oldStatus, new_status: newStatus },
        branchId: activeBranchId!,
      });
      toast.success('Status updated');
      refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleCancel = async (deliveryId: string, oldStatus: string) => {
    if (!confirm('Cancel this delivery? The order will need to be reassigned manually.')) return;
    try {
      await api('delivery', 'update-status', {
        method: 'POST',
        body: { delivery_id: deliveryId, old_status: oldStatus, new_status: 'cancelled' },
        branchId: activeBranchId!,
      });
      toast.success('Delivery cancelled');
      refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const columns: Column[] = [
    { id: 'order_number', label: 'Order', render: (r) => `#${r.order_number ?? r.orders?.order_number ?? ''}` },
    {
      id: 'status', label: 'Status', render: (r) => (
        <Chip
          label={r.status.replace(/_/g, ' ')}
          color={DELIVERY_STATUS_COLORS[r.status] ?? 'default'}
          size="small"
        />
      ),
    },
    { id: 'customer', label: 'Customer', render: (r) => r.customer_name || r.orders?.customer_name || '' },
    { id: 'rider', label: 'Rider', render: (r) => r.rider?.name ?? r.rider_name ?? <Typography variant="caption" color="warning.main">Unassigned</Typography> },
    { id: 'rider_response', label: 'Response', render: (r) => {
      if (!r.rider_id) return null;
      const color = r.rider_response === 'accepted' ? 'success' : r.rider_response === 'declined' ? 'error' : 'default';
      return <Chip label={r.rider_response ?? 'pending'} color={color} size="small" variant="outlined" />;
    }},
    {
      id: 'estimated_delivery_time', label: 'ETA',
      render: (r) => r.estimated_delivery_time ? new Date(r.estimated_delivery_time).toLocaleTimeString() : '',
    },
    { id: 'created_at', label: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    {
      id: 'actions', label: '', render: (r) => (
        <DeliveryActionsMenu
          row={r}
          onReassign={() => setReassignDlg(r)}
          onStatusChange={handleStatusChange}
          onCancel={handleCancel}
        />
      ),
    },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Filter by status</InputLabel>
          <Select label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value=""><em>All</em></MenuItem>
            {Object.keys(DELIVERY_STATUS_COLORS).map((s) => (
              <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <DataTable
        columns={columns} rows={items} totalRows={total} page={page}
        pageSize={pageSize} loading={loading}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        rowKey={(r) => r.id}
      />

      {reassignDlg && (
        <ReassignDialog
          delivery={reassignDlg}
          onClose={() => setReassignDlg(null)}
          onSaved={() => { setReassignDlg(null); refetch(); }}
        />
      )}
    </>
  );
}

function DeliveryActionsMenu({ row, onReassign, onStatusChange, onCancel }: {
  row: any;
  onReassign: () => void;
  onStatusChange: (id: string, old: string, next: string) => void;
  onCancel: (id: string, old: string) => void;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const s = row.status;

  const act = (fn: () => void) => { setAnchor(null); fn(); };

  return (
    <>
      <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {/* Reassign  available if not yet delivered/cancelled */}
        {!['delivered', 'cancelled', 'returned', 'failed'].includes(s) && (
          <MenuItem onClick={() => act(onReassign)}> Reassign Rider</MenuItem>
        )}
        {/* Progress actions */}
        {s === 'assigned' && (
          <MenuItem onClick={() => act(() => onStatusChange(row.id, s, 'picked_up'))}> Mark Picked Up</MenuItem>
        )}
        {s === 'picked_up' && (
          <MenuItem onClick={() => act(() => onStatusChange(row.id, s, 'in_transit'))}> Mark In Transit</MenuItem>
        )}
        {(s === 'in_transit' || s === 'picked_up' || s === 'assigned') && (
          <MenuItem onClick={() => act(() => onStatusChange(row.id, s, 'delivered'))}> Mark Delivered</MenuItem>
        )}
        {s === 'pending_assignment' && (
          <MenuItem onClick={() => act(onReassign)}> Assign Rider</MenuItem>
        )}
        {/* Cancel  not if already terminal */}
        {!['delivered', 'cancelled', 'returned', 'failed'].includes(s) && (
          <>
            <Divider />
            <MenuItem onClick={() => act(() => onCancel(row.id, s))} sx={{ color: 'error.main' }}>
               Cancel Delivery
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
}

function ReassignDialog({ delivery, onClose, onSaved }: { delivery: any; onClose: () => void; onSaved: () => void }) {
  const { activeBranchId } = useAuth();
  const { data: ridersData } = useApi<{ riders: any[] }>('delivery', 'riders');
  const riders = (ridersData?.riders ?? []).filter((r: any) => r.is_available && r.is_active);
  const [riderId, setRiderId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!riderId) { toast.error('Select a rider'); return; }
    setSaving(true);
    try {
      await api('delivery', 'reassign', {
        method: 'POST',
        body: { delivery_id: delivery.id, rider_id: riderId },
        branchId: activeBranchId!,
      });
      toast.success('Reassigned');
      onSaved();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open fullWidth maxWidth="xs" onClose={onClose}>
      <DialogTitle>Reassign Rider  Order #{delivery.order_number}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {riders.length === 0
          ? <Alert severity="warning">No available riders at this time.</Alert>
          : (
            <FormControl fullWidth size="small">
              <InputLabel>Select Rider</InputLabel>
              <Select label="Select Rider" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                {riders.map((r: any) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name}  {r.vehicle_type} {r.license_plate ? `(${r.license_plate})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )
        }
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || riders.length === 0}>
          {saving ? <CircularProgress size={20} /> : 'Reassign'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// 
// RIDERS TAB
// 

function RidersTab() {
  const { activeBranchId } = useAuth();
  const { data, loading, refetch } = useApi<{ riders: any[] }>('delivery', 'riders');
  const riders = data?.riders ?? [];

  const [editVehicleDlg, setEditVehicleDlg] = useState<any>(null);
  const [assignmentsDlg, setAssignmentsDlg] = useState<any>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggleAvailability = async (rider: any) => {
    setTogglingId(rider.id);
    try {
      await api('delivery', 'toggle-availability', {
        method: 'POST',
        body: { rider_id: rider.id, is_available: !rider.is_available },
        branchId: activeBranchId!,
      });
      toast.success(`${rider.name} marked as ${!rider.is_available ? 'available' : 'unavailable'}`);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setTogglingId(null); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Name', render: (r) => (
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2">{r.name}</Typography>
        {r.is_on_delivery && <Chip label="On delivery" size="small" color="primary" variant="outlined" />}
      </Stack>
    )},
    { id: 'phone', label: 'Phone', render: (r) => r.phone || '' },
    { id: 'vehicle_type', label: 'Vehicle', render: (r) => r.vehicle_type ?? '' },
    { id: 'license_plate', label: 'Plate', render: (r) => r.license_plate ?? '' },
    { id: 'is_available', label: 'Availability', render: (r) => (
      <Chip
        label={r.is_available ? 'Available' : 'Unavailable'}
        color={r.is_available ? 'success' : 'default'}
        size="small"
        onClick={() => handleToggleAvailability(r)}
        disabled={togglingId === r.id}
        clickable
      />
    )},
    { id: 'stats', label: 'Deliveries', render: (r) => `${r.active_deliveries_count} active / ${r.total_deliveries} total` },
    { id: 'actions', label: '', render: (r) => (
      <Stack direction="row" spacing={0.5}>
        <IconButton size="small" title="View assignments" onClick={() => setAssignmentsDlg(r)}>
          <AssignmentIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" title="Edit vehicle details" onClick={() => setEditVehicleDlg(r)}>
          <DirectionsBikeIcon fontSize="small" />
        </IconButton>
      </Stack>
    )},
  ];

  if (loading) return <CircularProgress sx={{ mt: 4, display: 'block', mx: 'auto' }} />;

  return (
    <>
      {riders.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Riders are automatically listed here when staff are assigned the <strong>Rider</strong> role in Staff Management.
          No riders found for this branch.
        </Alert>
      )}

      <DataTable
        columns={columns}
        rows={riders}
        totalRows={riders.length}
        rowKey={(r) => r.id}
      />

      {editVehicleDlg && (
        <EditVehicleDialog
          rider={editVehicleDlg}
          onClose={() => setEditVehicleDlg(null)}
          onSaved={() => { setEditVehicleDlg(null); refetch(); }}
        />
      )}

      {assignmentsDlg && (
        <RiderAssignmentsDialog
          rider={assignmentsDlg}
          onClose={() => setAssignmentsDlg(null)}
        />
      )}
    </>
  );
}

function EditVehicleDialog({ rider, onClose, onSaved }: { rider: any; onClose: () => void; onSaved: () => void }) {
  const { activeBranchId } = useAuth();
  const [form, setForm] = useState({
    vehicle_type: rider.vehicle_type ?? 'motorcycle',
    license_plate: rider.license_plate ?? '',
    max_concurrent_deliveries: rider.max_concurrent_deliveries ?? 3,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('delivery', 'riders', {
        method: 'POST',
        body: { id: rider.id, ...form },
        branchId: activeBranchId!,
      });
      toast.success('Vehicle details updated');
      onSaved();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open fullWidth maxWidth="xs" onClose={onClose}>
      <DialogTitle>Vehicle Details  {rider.name}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Vehicle Type</InputLabel>
          <Select label="Vehicle Type" value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
            {['motorcycle', 'bicycle', 'car', 'on_foot'].map((v) => (
              <MenuItem key={v} value={v}>{v.replace(/_/g, ' ')}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          fullWidth size="small" label="License Plate" sx={{ mb: 2 }}
          value={form.license_plate}
          onChange={(e) => setForm({ ...form, license_plate: e.target.value })}
        />
        <TextField
          fullWidth size="small" label="Max Concurrent Deliveries" type="number"
          inputProps={{ min: 1, max: 10 }}
          value={form.max_concurrent_deliveries}
          onChange={(e) => setForm({ ...form, max_concurrent_deliveries: parseInt(e.target.value) || 3 })}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RiderAssignmentsDialog({ rider, onClose }: { rider: any; onClose: () => void }) {
  const { activeBranchId } = useAuth();
  const { items, loading, refetch } = usePaginated<any>('delivery', 'deliveries', { rider_id: rider.id });

  const handleStatusChange = async (deliveryId: string, oldStatus: string, newStatus: string) => {
    try {
      await api('delivery', 'update-status', {
        method: 'POST',
        body: { delivery_id: deliveryId, old_status: oldStatus, new_status: newStatus },
        branchId: activeBranchId!,
      });
      toast.success('Updated');
      refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <Dialog open fullWidth maxWidth="md" onClose={onClose}>
      <DialogTitle>Assignments  {rider.name}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {loading
          ? <CircularProgress sx={{ display: 'block', mx: 'auto' }} />
          : items.length === 0
            ? <Typography color="text.secondary">No deliveries assigned to this rider.</Typography>
            : items.map((d: any) => (
              <Box key={d.id} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="body2" fontWeight={600}>Order #{d.order_number}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {d.customer_name}  {new Date(d.created_at).toLocaleString()}
                    </Typography>
                    {d.decline_reason && (
                      <Typography variant="caption" color="error" display="block">Declined: {d.decline_reason}</Typography>
                    )}
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      label={d.status.replace(/_/g, ' ')}
                      color={DELIVERY_STATUS_COLORS[d.status] ?? 'default'}
                      size="small"
                    />
                    {TERMINAL_STATUSES.includes(d.status) && (
                      <Button size="small" variant="outlined" color="success"
                        onClick={() => handleStatusChange(d.id, d.status, 'delivered')}>
                        Delivered
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Box>
            ))
        }
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// 
// ZONES TAB  (unchanged from original)
// 

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
