import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Tabs, Tab, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Chip, Typography, IconButton,
  Menu, MenuItem, FormControl, InputLabel, Select, Alert,
  CircularProgress, Divider, Stack, InputAdornment,
  Table, TableHead, TableRow, TableCell, TableBody, Card, CardContent, CardActions,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import TimerIcon from '@mui/icons-material/Timer';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { DataTable, StatusBadge, type Column } from '@paxrest/ui';
import { usePaginated, useApi, useRealtime } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import { formatCurrency } from '@paxrest/shared-utils';
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
  const { profile } = useAuth();
  const isRider = profile?.role === 'rider';
  const [tab, setTab] = useState(0);

  // Riders see only their deliveries — no Riders/Zones management tabs
  if (isRider) return <RiderDeliveriesView />;

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
  const { activeBranchId, activeBranch, company } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? '';
  const [statusFilter, setStatusFilter] = useState('');
  const { items, total, loading, page, pageSize, setPage, setPageSize, refetch } =
    usePaginated<any>('delivery', 'deliveries', statusFilter ? { status: statusFilter } : undefined);

  useRealtime('deliveries', activeBranchId ? { column: 'branch_id', value: activeBranchId } : undefined, () => refetch());

  const [reassignDlg, setReassignDlg] = useState<any>(null);
  const [detailDlg, setDetailDlg] = useState<any>(null);

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
    {
      id: 'customer', label: 'Customer', render: (r) => {
        const name = r.customer_name || r.orders?.customer_name || '';
        const phone = r.customer_phone || '';
        const rawAddr = r.delivery_address;
        const address = rawAddr
          ? typeof rawAddr === 'object'
            ? [rawAddr.street, rawAddr.city].filter(Boolean).join(', ')
            : String(rawAddr)
          : '';
        return (
          <Box>
            <Typography variant="body2" fontWeight={600}>{name || '—'}</Typography>
            {phone && <Typography variant="caption" color="text.secondary" display="block">{phone}</Typography>}
            {address && <Typography variant="caption" color="text.secondary" display="block">{address}</Typography>}
          </Box>
        );
      },
    },
    { id: 'rider', label: 'Rider', render: (r) => r.rider?.name ?? r.rider_name ?? <Typography variant="caption" color="warning.main">Unassigned</Typography> },
    { id: 'rider_response', label: 'Response', render: (r) => {
      if (!r.rider_id) return null;
      const color = r.rider_response === 'accepted' ? 'success' : r.rider_response === 'declined' ? 'error' : 'default';
      return <Chip label={r.rider_response ?? 'pending'} color={color} size="small" variant="outlined" />;
    }},
    { id: 'zone', label: 'Zone', render: (r) => r.zone?.name ?? '—' },
    {
      id: 'eta', label: 'ETA',
      render: (r) => {
        const isActive = ['assigned', 'picked_up', 'in_transit'].includes(r.status);
        if (r.estimated_delivery_time && isActive) {
          return <EtaCountdown target={r.estimated_delivery_time} />;
        }
        if (r.zone?.estimated_minutes && !r.estimated_delivery_time) {
          return <Typography variant="caption" color="text.secondary">~{r.zone.estimated_minutes} min</Typography>;
        }
        return r.estimated_delivery_time ? new Date(r.estimated_delivery_time).toLocaleTimeString() : '';
      },
    },
    { id: 'created_at', label: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    {
      id: 'actions', label: '', render: (r) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <IconButton size="small" title="View details" onClick={() => setDetailDlg(r)}>
            <VisibilityIcon fontSize="small" />
          </IconButton>
          <DeliveryActionsMenu
            row={r}
            onReassign={() => setReassignDlg(r)}
            onStatusChange={handleStatusChange}
            onCancel={handleCancel}
          />
        </Stack>
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

      {detailDlg && (
        <DeliveryDetailDialog
          delivery={detailDlg}
          currency={currency}
          onClose={() => setDetailDlg(null)}
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
  const { activeBranchId, activeBranch, company } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? '';
  const { items, loading, refetch } = usePaginated<any>('delivery', 'zones');
  const [dialog, setDialog] = useState(false);
  const emptyForm = { name: '', delivery_fee: 0, min_order_amount: 0, estimated_minutes: 30 };
  const [form, setForm] = useState<any>(emptyForm);

  const handleSave = async () => {
    try {
      await api('delivery', 'zones', { body: form, branchId: activeBranchId! });
      toast.success('Zone saved'); setDialog(false); setForm(emptyForm); refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Zone' },
    { id: 'delivery_fee', label: 'Fee', render: (r) => `${currency} ${Number(r.delivery_fee).toFixed(2)}` },
    { id: 'min_order_amount', label: 'Min Order', render: (r) => `${currency} ${Number(r.min_order_amount).toFixed(2)}` },
    { id: 'estimated_minutes', label: 'Est. Minutes' },
    { id: 'is_active', label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={() => { setForm(emptyForm); setDialog(true); }}>Add Zone</Button>
      </Box>
      <DataTable columns={columns} rows={items} loading={loading} rowKey={(r) => r.id} onRowClick={(r) => { setForm(r); setDialog(true); }} />
      <Dialog open={dialog} onClose={() => { setDialog(false); setForm(emptyForm); }} maxWidth="xs" fullWidth>
        <DialogTitle>Delivery Zone</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField
                fullWidth label="Delivery Fee" type="number" value={form.delivery_fee}
                onChange={(e) => setForm({ ...form, delivery_fee: Number(e.target.value) })}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> } }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                fullWidth label="Min Order" type="number" value={form.min_order_amount}
                onChange={(e) => setForm({ ...form, min_order_amount: Number(e.target.value) })}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> } }}
              />
            </Grid>
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

// ──────────────────────────────────────────────────────────────────────────────
// ETA Countdown — counts down to estimated_delivery_time
// ──────────────────────────────────────────────────────────────────────────────

function EtaCountdown({ target }: { target: string }) {
  const [remaining, setRemaining] = useState('');
  const [overdue, setOverdue] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) {
        const abs = Math.abs(diff);
        const mins = Math.floor(abs / 60000);
        const secs = Math.floor((abs % 60000) / 1000);
        setRemaining(`-${mins}:${String(secs).padStart(2, '0')}`);
        setOverdue(true);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setRemaining(`${mins}:${String(secs).padStart(2, '0')}`);
        setOverdue(false);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <Chip
      icon={<TimerIcon />}
      label={remaining}
      size="small"
      color={overdue ? 'error' : 'primary'}
      variant="outlined"
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Delivery Detail Dialog — shows full order info per delivery
// ──────────────────────────────────────────────────────────────────────────────

function DeliveryDetailDialog({ delivery, currency, onClose }: { delivery: any; currency: string; onClose: () => void }) {
  const d = delivery;
  const order = d.orders ?? {};
  const items = order.order_items ?? [];
  const addr = d.delivery_address;
  const addressStr = addr
    ? typeof addr === 'object' ? [addr.street, addr.city].filter(Boolean).join(', ') : String(addr)
    : '—';
  const isActive = ['assigned', 'picked_up', 'in_transit'].includes(d.status);
  const fmt = (v: number) => formatCurrency(v, currency);

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Delivery — Order #{d.order_number}</Typography>
          <Chip label={d.status.replace(/_/g, ' ')} color={DELIVERY_STATUS_COLORS[d.status] ?? 'default'} size="small" />
        </Stack>
      </DialogTitle>
      <DialogContent>
        {/* Customer */}
        <Typography variant="subtitle2" sx={{ mt: 1 }}>Customer</Typography>
        <Typography variant="body2">{d.customer_name || order.customer_name || '—'}</Typography>
        {(d.customer_phone || order.customer_phone) && (
          <Typography variant="body2" color="text.secondary">{d.customer_phone || order.customer_phone}</Typography>
        )}
        <Typography variant="body2" color="text.secondary">{addressStr}</Typography>

        <Divider sx={{ my: 1.5 }} />

        {/* Rider */}
        <Typography variant="subtitle2">Rider</Typography>
        <Typography variant="body2">{d.rider?.name ?? d.rider_name ?? 'Unassigned'}</Typography>
        {d.rider_response && (
          <Chip
            label={d.rider_response}
            size="small"
            variant="outlined"
            color={d.rider_response === 'accepted' ? 'success' : d.rider_response === 'declined' ? 'error' : 'default'}
            sx={{ mt: 0.5 }}
          />
        )}
        {d.decline_reason && (
          <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
            Reason: {d.decline_reason}
          </Typography>
        )}

        <Divider sx={{ my: 1.5 }} />

        {/* Zone & ETA */}
        <Stack direction="row" spacing={2} alignItems="center">
          <Box>
            <Typography variant="subtitle2">Zone</Typography>
            <Typography variant="body2">{d.zone?.name ?? '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2">ETA</Typography>
            {d.estimated_delivery_time && isActive ? (
              <EtaCountdown target={d.estimated_delivery_time} />
            ) : d.zone?.estimated_minutes ? (
              <Typography variant="body2">~{d.zone.estimated_minutes} min</Typography>
            ) : (
              <Typography variant="body2">—</Typography>
            )}
          </Box>
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        {/* Order items */}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Order Items</Typography>
        {items.length > 0 ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Unit</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it: any, i: number) => (
                <TableRow key={i}>
                  <TableCell>{it.menu_item_name}</TableCell>
                  <TableCell align="right">{it.quantity}</TableCell>
                  <TableCell align="right">{fmt(it.unit_price)}</TableCell>
                  <TableCell align="right">{fmt(it.item_total ?? it.unit_price * it.quantity)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3} align="right"><strong>Order Total</strong></TableCell>
                <TableCell align="right"><strong>{fmt(order.total ?? 0)}</strong></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary">No item details available.</Typography>
        )}

        {d.notes && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2">Notes</Typography>
            <Typography variant="body2">{d.notes}</Typography>
          </>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="caption" color="text.secondary">
          Created: {new Date(d.created_at).toLocaleString()}
          {d.actual_pickup_time && ` · Picked up: ${new Date(d.actual_pickup_time).toLocaleTimeString()}`}
          {d.actual_delivery_time && ` · Delivered: ${new Date(d.actual_delivery_time).toLocaleTimeString()}`}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// RIDER VIEW — riders only see their assigned deliveries + accept/decline
// ──────────────────────────────────────────────────────────────────────────────

function RiderDeliveriesView() {
  const { activeBranchId, profile, activeBranch, company } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? '';
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailDlg, setDetailDlg] = useState<any>(null);
  const [declineDlg, setDeclineDlg] = useState<any>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const data = await api<{ deliveries: any[] }>('delivery', 'my-deliveries', {
        branchId: activeBranchId ?? undefined,
      });
      setDeliveries(data.deliveries ?? []);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDeliveries(); }, [activeBranchId]);
  useRealtime('deliveries', profile?.id ? { column: 'rider_id', value: profile.id } : undefined, () => fetchDeliveries());

  const handleAccept = async (deliveryId: string) => {
    setSubmitting(true);
    try {
      await api('delivery', 'accept-assignment', {
        method: 'POST',
        body: { delivery_id: deliveryId },
        branchId: activeBranchId ?? undefined,
      });
      toast.success('Delivery accepted');
      fetchDeliveries();
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleDecline = async () => {
    if (!declineDlg) return;
    if (!declineReason.trim()) { toast.error('Reason is required'); return; }
    setSubmitting(true);
    try {
      await api('delivery', 'decline-assignment', {
        method: 'POST',
        body: { delivery_id: declineDlg.id, reason: declineReason.trim() },
        branchId: activeBranchId ?? undefined,
      });
      toast.success('Delivery declined');
      setDeclineDlg(null);
      setDeclineReason('');
      fetchDeliveries();
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleStatusChange = async (deliveryId: string, oldStatus: string, newStatus: string) => {
    setSubmitting(true);
    try {
      await api('delivery', 'update-status', {
        method: 'POST',
        body: { delivery_id: deliveryId, old_status: oldStatus, new_status: newStatus },
        branchId: activeBranchId ?? undefined,
      });
      toast.success('Status updated');
      fetchDeliveries();
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const NEXT_STATUS: Record<string, { status: string; label: string }> = {
    assigned: { status: 'picked_up', label: 'Mark Picked Up' },
    picked_up: { status: 'in_transit', label: 'Start Delivery' },
    in_transit: { status: 'delivered', label: 'Mark Delivered' },
  };

  const fmt = (v: number) => formatCurrency(v, currency);

  // Separate active from completed/cancelled
  const active = deliveries.filter((d) => !['delivered', 'cancelled', 'returned', 'failed'].includes(d.status));
  const past = deliveries.filter((d) => ['delivered', 'cancelled', 'returned', 'failed'].includes(d.status));

  if (loading) return <CircularProgress sx={{ mt: 4, display: 'block', mx: 'auto' }} />;

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>My Deliveries</Typography>

      {active.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>No active deliveries assigned to you.</Alert>
      )}

      {active.map((d) => {
        const order = d.orders ?? {};
        const items = order.order_items ?? [];
        const addr = d.delivery_address;
        const addressStr = addr
          ? typeof addr === 'object' ? [addr.street, addr.city].filter(Boolean).join(', ') : String(addr)
          : '';
        const next = NEXT_STATUS[d.status];
        const isPending = d.rider_response === 'pending' || !d.rider_response;
        const isActive = ['assigned', 'picked_up', 'in_transit'].includes(d.status);

        return (
          <Card key={d.id} sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>Order #{d.order_number}</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label={d.status.replace(/_/g, ' ')} color={DELIVERY_STATUS_COLORS[d.status] ?? 'default'} size="small" />
                  {d.estimated_delivery_time && isActive && <EtaCountdown target={d.estimated_delivery_time} />}
                </Stack>
              </Stack>

              <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                <Typography variant="body2"><strong>Customer:</strong> {d.customer_name || '—'} {d.customer_phone ? `• ${d.customer_phone}` : ''}</Typography>
                {addressStr && <Typography variant="body2" color="text.secondary">{addressStr}</Typography>}
                {d.zone?.name && (
                  <Typography variant="body2" color="text.secondary">
                    Zone: {d.zone.name}
                    {d.zone.estimated_minutes && !d.estimated_delivery_time ? ` (~${d.zone.estimated_minutes} min)` : ''}
                  </Typography>
                )}
              </Stack>

              {/* Order items summary */}
              {items.length > 0 && (
                <Box sx={{ mt: 1.5, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                    Items ({items.length})
                  </Typography>
                  {items.map((it: any, i: number) => (
                    <Typography key={i} variant="caption" display="block">
                      {it.quantity}× {it.menu_item_name} — {fmt(it.item_total ?? it.unit_price * it.quantity)}
                    </Typography>
                  ))}
                  <Divider sx={{ my: 0.5 }} />
                  <Typography variant="body2" fontWeight={700}>Total: {fmt(order.total ?? 0)}</Typography>
                </Box>
              )}

              {d.notes && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Notes: {d.notes}
                </Typography>
              )}
            </CardContent>

            <CardActions sx={{ px: 2, pb: 1.5, gap: 1 }}>
              <Button size="small" startIcon={<VisibilityIcon />} onClick={() => setDetailDlg(d)}>Details</Button>

              {/* Accept / Decline — only when response is pending */}
              {isPending && d.status === 'assigned' && (
                <>
                  <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />}
                    onClick={() => handleAccept(d.id)} disabled={submitting}>
                    Accept
                  </Button>
                  <Button size="small" variant="outlined" color="error" startIcon={<CancelIcon />}
                    onClick={() => { setDeclineDlg(d); setDeclineReason(''); }} disabled={submitting}>
                    Decline
                  </Button>
                </>
              )}

              {/* Status progression — only after accepted */}
              {d.rider_response === 'accepted' && next && (
                <Button size="small" variant="contained"
                  onClick={() => handleStatusChange(d.id, d.status, next.status)} disabled={submitting}>
                  {next.label}
                </Button>
              )}
            </CardActions>
          </Card>
        );
      })}

      {/* Past deliveries */}
      {past.length > 0 && (
        <>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 3, mb: 1 }}>
            Completed ({past.length})
          </Typography>
          {past.map((d) => (
            <Card key={d.id} sx={{ mb: 1, opacity: 0.7 }}>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2">Order #{d.order_number} — {d.customer_name}</Typography>
                  <Chip label={d.status.replace(/_/g, ' ')} color={DELIVERY_STATUS_COLORS[d.status] ?? 'default'} size="small" />
                </Stack>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {/* Decline dialog */}
      <Dialog open={!!declineDlg} onClose={() => setDeclineDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Decline Delivery — Order #{declineDlg?.order_number}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth multiline rows={3} label="Reason for declining *"
            placeholder="Enter your reason…"
            value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeclineDlg(null)} disabled={submitting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDecline} disabled={submitting || !declineReason.trim()}>
            {submitting ? <CircularProgress size={20} /> : 'Decline'}
          </Button>
        </DialogActions>
      </Dialog>

      {detailDlg && (
        <DeliveryDetailDialog
          delivery={detailDlg}
          currency={currency}
          onClose={() => setDetailDlg(null)}
        />
      )}
    </Box>
  );
}
