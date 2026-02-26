import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Tabs, Tab, Typography, Button, Card, CardContent,
  Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Select, MenuItem as MuiMenuItem,
  FormControl, InputLabel, ToggleButtonGroup, ToggleButton,
  Badge, Stack, Divider, Avatar, Alert, InputAdornment,
  LinearProgress, List, ListItem, ListItemText, ListItemSecondaryAction,
  Switch, FormControlLabel, Tooltip, Checkbox, Radio, RadioGroup,
  Autocomplete, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import KitchenIcon from '@mui/icons-material/Kitchen';
import PersonIcon from '@mui/icons-material/Person';
import TimerIcon from '@mui/icons-material/Timer';
import RemoveIcon from '@mui/icons-material/Remove';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import InventoryIcon from '@mui/icons-material/Inventory';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PrintIcon from '@mui/icons-material/Print';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';
import LocalDiningIcon from '@mui/icons-material/LocalDining';
import { KDSOrderCard, DataTable, type Column } from '@paxrest/ui';
import {
  formatCurrency,
  MEAL_AVAILABILITY_LABELS,
  MEAL_ASSIGNMENT_STATUS_LABELS,
  AVAILABLE_MEAL_STATUS_OPTIONS,
  AVAILABLE_MEAL_STATUS_LABELS,
} from '@paxrest/shared-utils';
import type { MealAvailability, MealAssignmentStatus, AvailableMealStatus } from '@paxrest/shared-types';
import { usePaginated, useApi, useRealtime } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

const STATIONS = [
  { id: '', label: 'All' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bar', label: 'Bar' },
  { id: 'shisha', label: 'Shisha' },
];

export default function KitchenDisplayPage() {
  return <BranchGuard><KitchenDisplayContent /></BranchGuard>;
}

function KitchenDisplayContent() {
  const { activeBranchId, company, activeBranch, profile } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [tab, setTab] = useState(0);

  const perms = profile?.permissions ?? [];
  // view_kitchen only controls nav-menu visibility (MainLayout).
  // Each tab is gated by its own granular permission — no umbrella fallback.
  const can = (p: string) => perms.includes(p as any);

  // Build visible tabs based on permissions
  const tabs = useMemo(() => {
    const all: { key: string; label: string; icon: React.ReactElement; component: React.ReactNode }[] = [];
    if (can('kitchen_orders'))
      all.push({ key: 'orders', label: 'Pending Orders', icon: <KitchenIcon />, component: <PendingOrdersTab branchId={activeBranchId!} /> });
    if (can('kitchen_assignments'))
      all.push({ key: 'assignments', label: 'Assignments', icon: <PersonIcon />, component: <AssignmentsTab branchId={activeBranchId!} currency={currency} /> });
    if (can('kitchen_make_dish'))
      all.push({ key: 'make_dish', label: 'Make a Dish', icon: <PlayArrowIcon />, component: <MakeDishTab branchId={activeBranchId!} currency={currency} /> });
    if (can('kitchen_available_meals'))
      all.push({ key: 'available', label: 'Available Meals', icon: <ShoppingCartIcon />, component: <AvailableMealsTab branchId={activeBranchId!} currency={currency} /> });
    if (can('kitchen_ingredient_requests'))
      all.push({ key: 'requests', label: 'Ingredient Requests', icon: <InventoryIcon />, component: <IngredientRequestsTab branchId={activeBranchId!} /> });
    return all;
  }, [perms, activeBranchId, currency]);

  // Clamp tab index if permissions change
  const safeTab = Math.min(tab, Math.max(0, tabs.length - 1));

  if (tabs.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">You do not have permissions to view any kitchen tabs. Contact your manager.</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Tabs
        value={safeTab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}
        variant="scrollable" scrollButtons="auto"
      >
        {tabs.map((t) => (
          <Tab key={t.key} label={t.label} icon={t.icon as React.ReactElement} iconPosition="start" />
        ))}
      </Tabs>

      {tabs[safeTab]?.component}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 0 — Pending Orders (KDS cards)
   ═══════════════════════════════════════════════════════ */
function PendingOrdersTab({ branchId }: { branchId: string }) {
  const [station, setStation] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (station) params.station = station;
      const data = await api<{ orders: any[] }>('kitchen', 'orders', { params, branchId });
      setOrders(data.orders ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [station, branchId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    const iv = setInterval(fetchOrders, 15_000);
    return () => clearInterval(iv);
  }, [fetchOrders]);

  useRealtime('orders', branchId ? { column: 'branch_id', value: branchId } : undefined, () => fetchOrders());

  const handleItemReady = async (orderId: string, itemId: string) => {
    try {
      await api('kitchen', 'update-item', { body: { order_item_id: itemId, status: 'ready' }, branchId });
      toast.success('Item marked ready');
      fetchOrders();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleBump = async (orderId: string) => {
    try {
      await api('kitchen', 'bump', { body: { order_id: orderId, station: station || 'kitchen' }, branchId });
      toast.success('Order bumped');
      fetchOrders();
    } catch (err: any) { toast.error(err.message); }
  };

  const now = Date.now();

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <ToggleButtonGroup value={station} exclusive onChange={(_, v) => v !== null && setStation(v)} size="small">
          {STATIONS.map((s) => <ToggleButton key={s.id} value={s.id}>{s.label}</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>

      {loading ? (
        <Typography color="text.secondary">Loading orders…</Typography>
      ) : orders.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No active orders for this station
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {orders.map((order) => {
            const elapsed = order.elapsed_minutes ?? Math.floor((now - new Date(order.created_at).getTime()) / 60_000);
            return (
              <KDSOrderCard
                key={order.id}
                orderNumber={order.order_number}
                orderType={order.order_type}
                tableName={order.table_name}
                customerName={order.customer_name}
                items={(order.items ?? []).map((i: any) => ({
                  id: i.id, name: i.name, quantity: i.quantity,
                  modifiers: [
                    ...(i.modifiers ?? []),
                    ...(i.removed_ingredients?.length ? [`Remove: ${i.removed_ingredients.map((ri: any) => ri.name).join(', ')}`] : []),
                    ...(i.selected_extras?.length ? [`Extras: ${i.selected_extras.map((ex: any) => ex.name).join(', ')}`] : []),
                  ],
                  notes: i.notes, status: i.status,
                }))}
                createdAt={order.created_at}
                elapsedMinutes={elapsed}
                onItemReady={(itemId) => handleItemReady(order.id, itemId)}
                onBump={() => handleBump(order.id)}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 1 — Assignments (list with edit / delete / accept / reject / complete)
   ═══════════════════════════════════════════════════════ */
function AssignmentsTab({ branchId, currency }: { branchId: string; currency: string }) {
  const { profile } = useAuth();
  const perms = profile?.permissions ?? [];
  const myUserId = profile?.id ?? '';
  const isPrivileged = perms.includes('kitchen_make_dish' as any) ||
    perms.includes('kitchen_ingredient_requests' as any) ||
    perms.includes('manage_menu' as any);

  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [now, setNow] = useState(Date.now());

  // Edit dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ assigned_to_name: '', quantity: 1, notes: '', expected_completion_time: '' });
  const [editSaving, setEditSaving] = useState(false);

  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // Reject dialog
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  // View Details dialog
  const [detailDialog, setDetailDialog] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = async (a: any) => {
    setDetailDialog(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const data = await api<{ assignment: any; menu_item: any }>('kitchen', 'assignment-detail', {
        params: { assignment_id: a.id },
        branchId,
      });
      setDetailData(data);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to load details');
      setDetailDialog(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePrintDetail = () => {
    const printArea = document.getElementById('assignment-detail-print');
    if (!printArea) return;
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Assignment Detail</title>
      <style>body{font-family:Arial,sans-serif;padding:20px}
      img{max-width:200px;border-radius:8px}
      table{border-collapse:collapse;width:100%;margin-top:10px}
      th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
      th{background:#f5f5f5}
      .section{margin-top:16px;font-weight:700;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:4px}
      </style></head><body>${printArea.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const fetchAssignments = useCallback(async () => {
    try {
      const params: Record<string, string> = { page_size: '200' };
      if (statusFilter) params.status = statusFilter;
      const data = await api<{ items: any[] }>('kitchen', 'assignments', { params, branchId });
      setAssignments(data.items ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, statusFilter]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);
  useRealtime('meal_assignments', branchId ? { column: 'branch_id', value: branchId } : undefined, () => fetchAssignments());

  // Tick every second to update countdown timers
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Format remaining time as HH:MM:SS or "overdue"
  const formatCountdown = (expectedIso: string) => {
    const diff = new Date(expectedIso).getTime() - now;
    if (diff <= 0) return 'Overdue';
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    return `${h > 0 ? `${h}h ` : ''}${m}m ${s}s`;
  };

  const handleAccept = async (id: string) => {
    try {
      await api('kitchen', 'assignment-respond', { body: { assignment_id: id, status: 'accepted' }, branchId });
      toast.success('Assignment accepted');
      fetchAssignments();
    } catch (err: any) { toast.error(err.message); }
  };

  const openReject = (a: any) => { setRejectTarget(a); setRejectReason(''); setRejectDialog(true); };
  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    try {
      await api('kitchen', 'assignment-respond', {
        body: { assignment_id: rejectTarget.id, status: 'rejected', rejection_reason: rejectReason },
        branchId,
      });
      toast.success('Assignment rejected');
      setRejectDialog(false);
      fetchAssignments();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleComplete = async (id: string) => {
    try {
      await api('kitchen', 'assignment-complete', { body: { assignment_id: id }, branchId });
      toast.success('Dish marked as completed!');
      fetchAssignments();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleMakeAvailable = async (id: string) => {
    try {
      await api('kitchen', 'assignment-make-available', { body: { assignment_id: id }, branchId });
      toast.success('Dish added to Available Meals!');
      fetchAssignments();
    } catch (err: any) { toast.error(err.message); }
  };

  const openEdit = (a: any) => {
    setEditTarget(a);
    setEditForm({
      assigned_to_name: a.assigned_to_name ?? '',
      quantity: a.quantity ?? 1,
      notes: a.notes ?? '',
      expected_completion_time: a.expected_completion_time ? new Date(a.expected_completion_time).toISOString().slice(0, 16) : '',
    });
    setEditDialog(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await api('kitchen', 'assignment-update', {
        body: {
          assignment_id: editTarget.id,
          assigned_to_name: editForm.assigned_to_name || undefined,
          quantity: editForm.quantity,
          notes: editForm.notes,
          expected_completion_time: editForm.expected_completion_time ? new Date(editForm.expected_completion_time).toISOString() : null,
        },
        branchId,
      });
      toast.success('Assignment updated');
      setEditDialog(false);
      fetchAssignments();
    } catch (err: any) { toast.error(err.message); }
    finally { setEditSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api('kitchen', 'assignment-delete', { body: { assignment_id: deleteTarget.id }, branchId });
      toast.success('Assignment deleted');
      setDeleteDialog(false);
      fetchAssignments();
    } catch (err: any) { toast.error(err.message); }
  };

  const statusColor = (s: string) =>
    s === 'pending' ? 'warning' : s === 'accepted' || s === 'in_progress' ? 'info' :
    s === 'completed' ? 'success' : s === 'rejected' ? 'error' :
    s === 'available' ? 'primary' : 'default';

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
        <Typography variant="subtitle2">Filter:</Typography>
        <ToggleButtonGroup
          value={statusFilter} exclusive size="small"
          onChange={(_, v) => { setStatusFilter(v ?? ''); setLoading(true); }}
        >
          <ToggleButton value="">All</ToggleButton>
          <ToggleButton value="pending">Pending</ToggleButton>
          <ToggleButton value="accepted">Accepted</ToggleButton>
          <ToggleButton value="in_progress">In Progress</ToggleButton>
          <ToggleButton value="completed">Completed</ToggleButton>
          <ToggleButton value="rejected">Rejected</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {loading ? <LinearProgress /> : assignments.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No assignments found. Use the "Make a Dish" tab to create assignments.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {assignments.map((a) => {
            const sc = statusColor(a.status);
            const isMyAssignment = a.assigned_to === myUserId;
            const canRespond = isMyAssignment || isPrivileged;
            return (
              <Card key={a.id} sx={{ width: 300, borderLeft: `4px solid`, borderLeftColor: `${sc}.main` }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Typography fontWeight={700}>{a.menu_item_name ?? 'Unknown'}</Typography>
                    {isPrivileged && a.status === 'pending' && (
                      <Stack direction="row" spacing={0}>
                        <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(a)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => { setDeleteTarget(a); setDeleteDialog(true); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      </Stack>
                    )}
                  </Stack>

                  <Stack direction="row" spacing={0.5} sx={{ my: 0.5 }} flexWrap="wrap">
                    <Chip size="small" label={`×${a.quantity}`} />
                    <Chip size="small" label={MEAL_ASSIGNMENT_STATUS_LABELS[a.status as MealAssignmentStatus] ?? a.status} color={sc as any} />
                    {a.station && <Chip size="small" label={a.station} variant="outlined" />}
                  </Stack>

                  <Typography variant="caption" color="text.secondary" display="block">
                    Assigned to: {a.assigned_to_name ?? '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    By: {a.assigned_by_name ?? '—'} · {new Date(a.created_at).toLocaleString()}
                  </Typography>

                  {/* Countdown timer for in-progress assignments */}
                  {a.expected_completion_time && a.status === 'in_progress' && (
                    <Typography
                      variant="caption" fontWeight={700} display="block" sx={{ mt: 0.5 }}
                      color={new Date(a.expected_completion_time).getTime() - now <= 0 ? 'error.main' : 'info.main'}
                    >
                      <TimerIcon sx={{ fontSize: 12, mr: 0.3, verticalAlign: 'middle' }} />
                      {formatCountdown(a.expected_completion_time)}
                    </Typography>
                  )}
                  {a.expected_completion_time && a.status !== 'in_progress' && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      <TimerIcon sx={{ fontSize: 12, mr: 0.3, verticalAlign: 'middle' }} />
                      Expected: {new Date(a.expected_completion_time).toLocaleTimeString()}
                    </Typography>
                  )}

                  {a.notes && <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>📝 {a.notes}</Typography>}
                  {a.rejection_reason && (
                    <Typography variant="caption" display="block" color="error" sx={{ mt: 0.5 }}>
                      Rejection reason: {a.rejection_reason}
                    </Typography>
                  )}

                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => openDetail(a)}>
                      Details
                    </Button>
                    {a.status === 'pending' && canRespond && (
                      <>
                        <Button size="small" variant="contained" color="success" onClick={() => handleAccept(a.id)}>Accept</Button>
                        <Button size="small" variant="outlined" color="error" onClick={() => openReject(a)}>Reject</Button>
                      </>
                    )}
                    {a.status === 'in_progress' && canRespond && (
                      <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={() => handleComplete(a.id)}>
                        Mark Complete
                      </Button>
                    )}
                    {a.status === 'completed' && isPrivileged && (
                      <Button size="small" variant="contained" color="primary" onClick={() => handleMakeAvailable(a.id)}>
                        Make Available
                      </Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Assignment</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Assigned To" sx={{ mt: 1, mb: 2 }}
            value={editForm.assigned_to_name}
            onChange={(e) => setEditForm({ ...editForm, assigned_to_name: e.target.value })}
          />
          <TextField
            fullWidth label="Quantity" type="number" sx={{ mb: 2 }}
            value={editForm.quantity}
            onChange={(e) => setEditForm({ ...editForm, quantity: Math.max(1, Number(e.target.value)) })}
          />
          <TextField
            fullWidth label="Expected Completion" type="datetime-local" sx={{ mb: 2 }}
            value={editForm.expected_completion_time}
            onChange={(e) => setEditForm({ ...editForm, expected_completion_time: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            fullWidth label="Notes" multiline rows={2}
            value={editForm.notes}
            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Assignment?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the assignment for <strong>{deleteTarget?.menu_item_name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog} onClose={() => setRejectDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reject Assignment</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>Rejecting: <strong>{rejectTarget?.menu_item_name}</strong></Typography>
          <TextField
            fullWidth label="Reason for rejection" required multiline rows={2}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleReject} disabled={!rejectReason.trim()}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={detailDialog} onClose={() => setDetailDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <LocalDiningIcon />
            <Typography variant="h6">Assignment Details</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Print"><IconButton onClick={handlePrintDetail} disabled={detailLoading}><PrintIcon /></IconButton></Tooltip>
            <Tooltip title="Close"><IconButton onClick={() => setDetailDialog(false)}><CloseIcon /></IconButton></Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
          ) : detailData ? (
            <Box id="assignment-detail-print">
              {/* Header: image + name */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                {(detailData.menu_item?.media_url || detailData.menu_item?.image_url) && (
                  <Avatar
                    src={detailData.menu_item.media_url ?? detailData.menu_item.image_url}
                    variant="rounded"
                    sx={{ width: 140, height: 140 }}
                  />
                )}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" fontWeight={700}>{detailData.menu_item?.name ?? '—'}</Typography>
                  {detailData.menu_item?.menu_categories?.name && (
                    <Chip size="small" label={detailData.menu_item.menu_categories.name} sx={{ mt: 0.5 }} />
                  )}
                  {detailData.menu_item?.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {detailData.menu_item.description}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }} flexWrap="wrap">
                    {detailData.menu_item?.base_price != null && (
                      <Typography variant="body2"><strong>Price:</strong> {formatCurrency(detailData.menu_item.base_price, currency)}</Typography>
                    )}
                    {detailData.menu_item?.calories != null && (
                      <Typography variant="body2"><strong>Calories:</strong> {detailData.menu_item.calories} kcal</Typography>
                    )}
                    {detailData.menu_item?.preparation_time_min != null && (
                      <Typography variant="body2"><strong>Prep Time:</strong> {detailData.menu_item.preparation_time_min} min</Typography>
                    )}
                    {detailData.menu_item?.station && (
                      <Typography variant="body2"><strong>Station:</strong> {detailData.menu_item.station}</Typography>
                    )}
                  </Stack>
                  {detailData.menu_item?.tags?.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} flexWrap="wrap">
                      {detailData.menu_item.tags.map((t: string) => <Chip key={t} size="small" label={t} variant="outlined" />)}
                    </Stack>
                  )}
                  {detailData.menu_item?.allergens?.length > 0 && (
                    <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
                      <strong>Allergens:</strong> {detailData.menu_item.allergens.join(', ')}
                    </Typography>
                  )}
                </Box>
              </Stack>

              <Divider sx={{ my: 2 }} />

              {/* Assignment Info */}
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Assignment Info</Typography>
              <Grid container spacing={1}>
                <Grid size={{ xs: 6 }}><Typography variant="body2"><strong>Status:</strong> {MEAL_ASSIGNMENT_STATUS_LABELS[detailData.assignment?.status as MealAssignmentStatus] ?? detailData.assignment?.status}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="body2"><strong>Quantity:</strong> {detailData.assignment?.quantity}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="body2"><strong>Assigned To:</strong> {detailData.assignment?.assigned_to_name ?? '—'}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="body2"><strong>Assigned By:</strong> {detailData.assignment?.assigned_by_name ?? '—'}</Typography></Grid>
                <Grid size={{ xs: 6 }}><Typography variant="body2"><strong>Created:</strong> {new Date(detailData.assignment?.created_at).toLocaleString()}</Typography></Grid>
                {detailData.assignment?.expected_completion_time && (
                  <Grid size={{ xs: 6 }}><Typography variant="body2"><strong>Expected:</strong> {new Date(detailData.assignment.expected_completion_time).toLocaleString()}</Typography></Grid>
                )}
                {detailData.assignment?.completed_at && (
                  <Grid size={{ xs: 6 }}><Typography variant="body2"><strong>Completed:</strong> {new Date(detailData.assignment.completed_at).toLocaleString()}</Typography></Grid>
                )}
                {detailData.assignment?.notes && (
                  <Grid size={{ xs: 12 }}><Typography variant="body2"><strong>Notes:</strong> {detailData.assignment.notes}</Typography></Grid>
                )}
              </Grid>

              {/* Ingredients */}
              {detailData.menu_item?.menu_item_ingredients?.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Ingredients</Typography>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1.5, py: 0.75, fontSize: 13 }, '& th': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                    <thead>
                      <tr><th>Ingredient</th><th>Quantity</th><th>Unit</th><th>Cost</th></tr>
                    </thead>
                    <tbody>
                      {detailData.menu_item.menu_item_ingredients.map((ing: any) => (
                        <tr key={ing.id}>
                          <td>{ing.name ?? ing.inventory_items?.name ?? '—'}</td>
                          <td>{ing.quantity_used}</td>
                          <td>{ing.unit}</td>
                          <td>{ing.cost_contribution ? formatCurrency(ing.cost_contribution, currency) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Box>
                </>
              )}

              {/* Extras */}
              {detailData.menu_item?.menu_item_extras?.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Extras / Add-ons</Typography>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1.5, py: 0.75, fontSize: 13 }, '& th': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                    <thead>
                      <tr><th>Extra</th><th>Price</th><th>Available</th></tr>
                    </thead>
                    <tbody>
                      {detailData.menu_item.menu_item_extras.map((ext: any) => (
                        <tr key={ext.id}>
                          <td>{ext.name}</td>
                          <td>{formatCurrency(ext.price, currency)}</td>
                          <td>{ext.is_available ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Box>
                </>
              )}

              {/* Variants */}
              {detailData.menu_item?.menu_variants?.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Variants</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {detailData.menu_item.menu_variants.filter((v: any) => v.is_active).map((v: any) => (
                      <Chip
                        key={v.id}
                        label={`${v.name}${v.price_adjustment ? ` (${v.price_adjustment > 0 ? '+' : ''}${formatCurrency(v.price_adjustment, currency)})` : ''}${v.is_default ? ' ★' : ''}`}
                        variant="outlined"
                        size="small"
                      />
                    ))}
                  </Stack>
                </>
              )}
            </Box>
          ) : (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No data available</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog(false)}>Close</Button>
          <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrintDetail} disabled={detailLoading || !detailData}>
            Print
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 2 — Make a Dish (browse menu, multi-select, assign to chef)
   ═══════════════════════════════════════════════════════ */
function MakeDishTab({ branchId, currency }: { branchId: string; currency: string }) {
  const { user, profile } = useAuth();
  const { data: menuData, loading } = useApi<any>('menu', 'full', undefined, [branchId]);

  // Selected menu item IDs
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Make-a-Dish dialog
  const [dishDialog, setDishDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-item config in the dialog: size, unit, estimated customers, excluded ingredients/extras
  const [itemConfigs, setItemConfigs] = useState<Record<string, {
    size: number;
    unit: string;
    customUnit: string;
    estimatedCustomers: number;
    excludedIngredients: Set<string>;
    excludedExtras: Set<string>;
  }>>({});

  const UNITS = ['pot', 'cup', 'kg', 'pounds', 'litres', 'plates', 'bowls', 'trays', 'pieces', 'custom'];

  // Chef assignment
  const [assignMode, setAssignMode] = useState<'auto' | 'manual'>('auto');
  const [chefs, setChefs] = useState<any[]>([]);
  const [chefsLoading, setChefsLoading] = useState(false);
  const [selectedChef, setSelectedChef] = useState<any>(null);
  const [excludedChefIds, setExcludedChefIds] = useState<Set<string>>(new Set());
  const [expectedTime, setExpectedTime] = useState('');
  const [globalNotes, setGlobalNotes] = useState('');

  const menuItems = useMemo(() => {
    if (!menuData) return [];
    const menu = (menuData as any).menu ?? [];
    return menu.flatMap((cat: any) => (cat.items ?? []).map((item: any) => ({ ...item, category_name: cat.name })));
  }, [menuData]);

  const categories = useMemo(() => {
    const cats = new Map<string, any[]>();
    menuItems.forEach((item: any) => {
      const cat = item.category_name ?? 'Uncategorized';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(item);
    });
    return Array.from(cats.entries()).map(([name, items]) => ({ name, items }));
  }, [menuItems]);

  const selectedItems = useMemo(() => menuItems.filter((i: any) => selected.has(i.id)), [menuItems, selected]);

  // Chefs available for auto-assign (after exclusions)
  const availableAutoChefs = useMemo(
    () => chefs.filter((c: any) => !excludedChefIds.has(c.user_id)),
    [chefs, excludedChefIds],
  );

  const toggleExcludeChef = (userId: string) => {
    setExcludedChefIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  // Form-level validation: Assign button only active when all required fields filled
  const isFormReady = useMemo(() => {
    // Every selected item must have size ≥ 1, a valid unit, and est. customers ≥ 1
    const itemsOk = selectedItems.every((item: any) => {
      const cfg = itemConfigs[item.id];
      if (!cfg) return false;
      if (cfg.size < 1) return false;
      if (!cfg.unit) return false;
      if (cfg.unit === 'custom' && !cfg.customUnit.trim()) return false;
      if (cfg.estimatedCustomers < 1) return false;
      return true;
    });
    if (!itemsOk) return false;

    // Expected completion time is required
    if (!expectedTime) return false;

    // Staff selection
    if (assignMode === 'manual' && !selectedChef) return false;
    if (assignMode === 'auto' && availableAutoChefs.length === 0) return false;

    return true;
  }, [selectedItems, itemConfigs, expectedTime, assignMode, selectedChef, availableAutoChefs]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(menuItems.map((i: any) => i.id)));
  };

  const clearAll = () => setSelected(new Set());

  const fetchChefs = useCallback(async () => {
    setChefsLoading(true);
    try {
      const data = await api<{ chefs: any[] }>('kitchen', 'staff-chefs', { params: {}, branchId });
      setChefs(data.chefs ?? []);
    } catch (err) { console.error(err); }
    finally { setChefsLoading(false); }
  }, [branchId]);

  const openDishDialog = () => {
    if (selected.size === 0) { toast.error('Select at least one menu item'); return; }
    // Initialize configs for each selected item
    const configs: typeof itemConfigs = {};
    selectedItems.forEach((item: any) => {
      configs[item.id] = {
        size: 1,
        unit: 'pot',
        customUnit: '',
        estimatedCustomers: 1,
        excludedIngredients: new Set(),
        excludedExtras: new Set(),
      };
    });
    setItemConfigs(configs);
    setAssignMode('auto');
    setSelectedChef(null);
    setExcludedChefIds(new Set());
    setExpectedTime('');
    setGlobalNotes('');
    fetchChefs();
    setDishDialog(true);
  };

  const toggleIngredient = (itemId: string, ingredientId: string) => {
    setItemConfigs((prev) => {
      const cfg = { ...prev[itemId] };
      const ex = new Set(cfg.excludedIngredients);
      if (ex.has(ingredientId)) ex.delete(ingredientId); else ex.add(ingredientId);
      cfg.excludedIngredients = ex;
      return { ...prev, [itemId]: cfg };
    });
  };

  const toggleExtra = (itemId: string, extraId: string) => {
    setItemConfigs((prev) => {
      const cfg = { ...prev[itemId] };
      const ex = new Set(cfg.excludedExtras);
      if (ex.has(extraId)) ex.delete(extraId); else ex.add(extraId);
      cfg.excludedExtras = ex;
      return { ...prev, [itemId]: cfg };
    });
  };

  const updateConfig = (itemId: string, patch: Record<string, any>) => {
    setItemConfigs((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      // Determine chef assignment
      let assignedTo: string | undefined;
      let assignedToName: string | undefined;

      if (assignMode === 'manual' && selectedChef) {
        assignedTo = selectedChef.user_id;
        assignedToName = selectedChef.name;
      } else if (assignMode === 'auto' && availableAutoChefs.length > 0) {
        // Pick the non-excluded chef with the least active assignments
        const sorted = [...availableAutoChefs].sort((a, b) => a.active_assignments - b.active_assignments);
        assignedTo = sorted[0].user_id;
        assignedToName = sorted[0].name;
      }

      const items = selectedItems.map((item: any) => {
        const cfg = itemConfigs[item.id];
        const unit = cfg?.unit === 'custom' ? (cfg?.customUnit || 'custom') : (cfg?.unit ?? 'pot');
        return {
          menu_item_id: item.id,
          menu_item_name: item.name,
          quantity: cfg?.size ?? 1,
          notes: `Size: ${cfg?.size ?? 1} ${unit} · Est. customers: ${cfg?.estimatedCustomers ?? 1}`,
          excluded_ingredients: Array.from(cfg?.excludedIngredients ?? []),
          excluded_extras: Array.from(cfg?.excludedExtras ?? []),
        };
      });

      await api('kitchen', 'assignments', {
        body: {
          items,
          assigned_to: assignedTo,
          assigned_to_name: assignedToName ?? user?.email ?? 'Unassigned',
          assigned_by_name: profile?.name ?? user?.email ?? 'Unknown',
          notes: globalNotes || undefined,
          expected_completion_time: expectedTime ? new Date(expectedTime).toISOString() : undefined,
        },
        branchId,
      });

      toast.success(`${items.length} dish(es) assigned successfully!`);
      setDishDialog(false);
      setSelected(new Set());
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Select menu items to start the Make a Dish flow. You can multi-select items, configure ingredients/extras, and assign to a chef.
      </Alert>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
        <Button variant="contained" disabled={selected.size === 0} onClick={openDishDialog} startIcon={<PlayArrowIcon />}>
          Make a Dish ({selected.size})
        </Button>
        <Button size="small" onClick={selectAll}>Select All</Button>
        <Button size="small" onClick={clearAll} disabled={selected.size === 0}>Clear</Button>
      </Stack>

      {loading ? <LinearProgress /> : categories.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No menu items found. Create menu items from the Menu page first.
        </Typography>
      ) : (
        categories.map((cat) => (
          <Box key={cat.name} sx={{ mb: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>{cat.name}</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {cat.items.map((item: any) => {
                const isSelected = selected.has(item.id);
                return (
                  <Card
                    key={item.id}
                    sx={{
                      width: 240, cursor: 'pointer',
                      border: isSelected ? '2px solid' : '1px solid',
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      bgcolor: isSelected ? 'action.selected' : 'background.paper',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => toggleSelect(item.id)}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Checkbox checked={isSelected} size="small" sx={{ p: 0 }} />
                        <Typography fontWeight={700} noWrap>{item.name}</Typography>
                      </Stack>

                      {item.media_url && (
                        <Box sx={{ width: '100%', height: 80, mt: 0.5, borderRadius: 1, overflow: 'hidden' }}>
                          <img src={item.media_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </Box>
                      )}

                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {formatCurrency(
                          (Number(item.base_price) || 0)
                          + (item.menu_item_ingredients ?? []).reduce((s: number, i: any) => s + Number(i.cost_per_unit ?? i.price ?? 0), 0)
                          + (item.menu_item_extras ?? []).reduce((s: number, e: any) => s + Number(e.price ?? 0), 0),
                          currency,
                        )}
                        {item.calories ? ` · ${item.calories} cal` : ''}
                      </Typography>

                      {item.menu_item_ingredients?.length > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.3 }}>
                          Ingredients: {item.menu_item_ingredients.map((i: any) => i.name || i.ingredient_name).join(', ')}
                        </Typography>
                      )}
                      {item.menu_item_extras?.length > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Extras: {item.menu_item_extras.map((e: any) => e.name || e.extra_name).join(', ')}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          </Box>
        ))
      )}

      {/* ──── Make a Dish Dialog ──── */}
      <Dialog open={dishDialog} onClose={() => setDishDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Make a Dish — {selectedItems.length} item(s)</DialogTitle>
        <DialogContent dividers>
          {/* Per-item ingredient / extras config */}
          {selectedItems.map((item: any) => {
            const cfg = itemConfigs[item.id];
            if (!cfg) return null;
            const ingredients = item.menu_item_ingredients ?? [];
            const extras = item.menu_item_extras ?? [];

            return (
              <Box key={item.id} sx={{ mb: 3, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography fontWeight={700} sx={{ mb: 1 }}>{item.name}</Typography>

                <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap">
                  <TextField
                    size="small" label="Size" type="number" sx={{ width: 80 }}
                    value={cfg.size}
                    onChange={(e) => updateConfig(item.id, { size: Math.max(1, Number(e.target.value)) })}
                  />
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Unit</InputLabel>
                    <Select
                      value={cfg.unit} label="Unit"
                      onChange={(e) => updateConfig(item.id, { unit: e.target.value })}
                    >
                      {UNITS.map((u) => (
                        <MuiMenuItem key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</MuiMenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {cfg.unit === 'custom' && (
                    <TextField
                      size="small" label="Custom unit" sx={{ width: 120 }}
                      value={cfg.customUnit}
                      onChange={(e) => updateConfig(item.id, { customUnit: e.target.value })}
                    />
                  )}
                  <TextField
                    size="small" label="Est. customers" type="number" sx={{ width: 120 }}
                    value={cfg.estimatedCustomers}
                    onChange={(e) => updateConfig(item.id, { estimatedCustomers: Math.max(1, Number(e.target.value)) })}
                  />
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Total price: {formatCurrency(
                    (Number(item.base_price) || 0)
                    + ingredients.filter((i: any) => !cfg.excludedIngredients.has(i.id ?? i.ingredient_id)).reduce((s: number, i: any) => s + Number(i.cost_per_unit ?? i.price ?? 0), 0)
                    + extras.filter((e: any) => !cfg.excludedExtras.has(e.id ?? e.extra_id)).reduce((s: number, e: any) => s + Number(e.price ?? 0), 0),
                    currency,
                  )}
                </Typography>

                {ingredients.length > 0 && (
                  <Box sx={{ ml: 1, mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Ingredients (uncheck to exclude):</Typography>
                    {ingredients.map((ing: any) => {
                      const ingId = ing.id ?? ing.ingredient_id;
                      const excluded = cfg.excludedIngredients.has(ingId);
                      return (
                        <Stack key={ingId} direction="row" alignItems="center" spacing={1} sx={{ ml: 1 }}>
                          <Checkbox
                            size="small" checked={!excluded}
                            onChange={() => toggleIngredient(item.id, ingId)}
                            sx={{ p: 0.3 }}
                          />
                          <Typography variant="body2" sx={{ textDecoration: excluded ? 'line-through' : 'none', color: excluded ? 'text.disabled' : 'text.primary' }}>
                            {ing.name || ing.ingredient_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatCurrency(ing.cost_per_unit ?? ing.price ?? 0, currency)}
                          </Typography>
                        </Stack>
                      );
                    })}
                  </Box>
                )}

                {extras.length > 0 && (
                  <Box sx={{ ml: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Extras (uncheck to exclude):</Typography>
                    {extras.map((ext: any) => {
                      const extId = ext.id ?? ext.extra_id;
                      const excluded = cfg.excludedExtras.has(extId);
                      return (
                        <Stack key={extId} direction="row" alignItems="center" spacing={1} sx={{ ml: 1 }}>
                          <Checkbox
                            size="small" checked={!excluded}
                            onChange={() => toggleExtra(item.id, extId)}
                            sx={{ p: 0.3 }}
                          />
                          <Typography variant="body2" sx={{ textDecoration: excluded ? 'line-through' : 'none', color: excluded ? 'text.disabled' : 'text.primary' }}>
                            {ext.name || ext.extra_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatCurrency(ext.price ?? 0, currency)}
                          </Typography>
                        </Stack>
                      );
                    })}
                  </Box>
                )}
              </Box>
            );
          })}

          <Divider sx={{ my: 2 }} />

          {/* Chef Assignment */}
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Chef Assignment</Typography>
          <RadioGroup row value={assignMode} onChange={(e) => setAssignMode(e.target.value as 'auto' | 'manual')}>
            <FormControlLabel value="auto" control={<Radio size="small" />} label="Auto-assign (least busy chef)" />
            <FormControlLabel value="manual" control={<Radio size="small" />} label="Manual selection" />
          </RadioGroup>

          {assignMode === 'auto' && (
            <Box sx={{ mt: 1, mb: 2 }}>
              <Alert severity="info" icon={<AutorenewIcon />} sx={{ mb: 1 }}>
                {chefsLoading ? 'Loading kitchen staff…' : chefs.length === 0
                  ? 'No kitchen staff found. Assignment will default to you.'
                  : availableAutoChefs.length === 0
                    ? 'All staff excluded. Uncheck at least one staff member.'
                    : `Will auto-assign to the least-busy staff (${[...availableAutoChefs].sort((a, b) => a.active_assignments - b.active_assignments)[0]?.name ?? '—'} — ${[...availableAutoChefs].sort((a, b) => a.active_assignments - b.active_assignments)[0]?.active_assignments ?? 0} active).`}
              </Alert>
              {chefs.length > 0 && (
                <Box sx={{ ml: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Uncheck staff to exclude from auto-assignment:</Typography>
                  {chefs.map((c: any) => (
                    <Stack key={c.user_id} direction="row" alignItems="center" spacing={1}>
                      <Checkbox
                        size="small"
                        checked={!excludedChefIds.has(c.user_id)}
                        onChange={() => toggleExcludeChef(c.user_id)}
                        sx={{ p: 0.3 }}
                      />
                      <Typography variant="body2" sx={{ color: excludedChefIds.has(c.user_id) ? 'text.disabled' : 'text.primary' }}>
                        {c.name} ({c.role}) — {c.active_assignments} active
                      </Typography>
                    </Stack>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {assignMode === 'manual' && (
            <Autocomplete
              options={chefs}
              getOptionLabel={(o: any) => `${o.name} (${o.role}) — ${o.active_assignments} active`}
              value={selectedChef}
              onChange={(_, v) => setSelectedChef(v)}
              loading={chefsLoading}
              renderInput={(params) => (
                <TextField {...params} label="Search chef / staff" sx={{ mt: 1, mb: 2 }}
                  slotProps={{ input: { ...params.InputProps, endAdornment: (<>{chefsLoading ? <CircularProgress size={18} /> : null}{params.InputProps.endAdornment}</>) } }}
                />
              )}
              sx={{ mt: 1, mb: 2 }}
            />
          )}

          {/* Expected Completion Time */}
          <TextField
            fullWidth label="Expected Completion Time" type="datetime-local" sx={{ mb: 2 }}
            value={expectedTime}
            onChange={(e) => setExpectedTime(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {/* Notes */}
          <TextField
            fullWidth label="Notes (optional)" multiline rows={2}
            value={globalNotes}
            onChange={(e) => setGlobalNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDishDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={saving || !isFormReady}>
            {saving ? 'Assigning…' : `Assign ${selectedItems.length} Dish(es)`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 3 — Available Meals (ready for POS)
   ═══════════════════════════════════════════════════════ */
function AvailableMealsTab({ branchId, currency }: { branchId: string; currency: string }) {
  const { profile } = useAuth();
  const perms = profile?.permissions ?? [];
  const canEditStatus = perms.includes('kitchen_make_dish' as any) || perms.includes('kitchen_ingredient_requests' as any) || perms.includes('manage_menu' as any);

  const [meals, setMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMeals = useCallback(async () => {
    try {
      const data = await api<{ meals: any[] }>('kitchen', 'available-meals', { params: {}, branchId });
      setMeals(data.meals ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { fetchMeals(); }, [fetchMeals]);
  useRealtime('available_meals', branchId ? { column: 'branch_id', value: branchId } : undefined, () => fetchMeals());

  const handleDecrement = async (meal: any) => {
    try {
      await api('kitchen', 'available-meals', {
        body: { meal_id: meal.id, action: 'decrement' },
        branchId,
      });
      toast.success(`${meal.menu_item_name ?? 'Meal'} decremented`);
      fetchMeals();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleStatusChange = async (meal: any, newStatus: string) => {
    try {
      await api('kitchen', 'available-meals', {
        body: { meal_id: meal.id, action: 'update-status', availability_status: newStatus },
        branchId,
      });
      toast.success(`Status updated to ${AVAILABLE_MEAL_STATUS_LABELS[newStatus as AvailableMealStatus] ?? newStatus}`);
      fetchMeals();
    } catch (err: any) { toast.error(err.message); }
  };

  if (loading) return <LinearProgress />;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Meals ready for sale. Status updates will be visible at all terminals.
      </Alert>

      {meals.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No available meals. Use "Make Available" on completed assignments to add meals here.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {meals.map((meal) => {
            const status = (meal.availability_status ?? 'full') as AvailableMealStatus;
            const statusOpt = AVAILABLE_MEAL_STATUS_OPTIONS.find((o) => o.value === status);
            return (
              <Card key={meal.id} sx={{ width: 260, textAlign: 'center', borderTop: `3px solid`, borderTopColor: `${statusOpt?.color ?? 'success'}.main` }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  {(meal.menu_items?.media_url || meal.menu_items?.image_url) && (
                    <Avatar
                      src={meal.menu_items.media_url ?? meal.menu_items.image_url}
                      variant="rounded"
                      sx={{ width: 80, height: 80, mx: 'auto', mb: 1 }}
                    />
                  )}
                  <Typography fontWeight={700}>{meal.menu_item_name ?? meal.menu_items?.name ?? '—'}</Typography>

                  <Stack direction="row" spacing={0.5} justifyContent="center" sx={{ my: 1 }}>
                    <Chip
                      size="small"
                      label={`Qty: ${meal.quantity_available}`}
                      color={meal.quantity_available > 0 ? 'success' : 'error'}
                    />
                    <Chip
                      size="small"
                      label={statusOpt?.label ?? status}
                      color={(statusOpt?.color ?? 'default') as any}
                    />
                  </Stack>

                  {meal.prepared_by_name && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Prepared by: {meal.prepared_by_name}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" display="block">
                    Updated: {new Date(meal.updated_at).toLocaleString()}
                  </Typography>

                  {canEditStatus && (
                    <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                      <InputLabel>Status</InputLabel>
                      <Select
                        value={status}
                        label="Status"
                        onChange={(e) => handleStatusChange(meal, e.target.value)}
                      >
                        {AVAILABLE_MEAL_STATUS_OPTIONS.map((opt) => (
                          <MuiMenuItem key={opt.value} value={opt.value}>{opt.label}</MuiMenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {canEditStatus && (
                    <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center' }}>
                      <IconButton color="error" onClick={() => handleDecrement(meal)} disabled={meal.quantity_available <= 0}>
                        <RemoveIcon />
                      </IconButton>
                    </Box>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 4 — Completed Orders
   ═══════════════════════════════════════════════════════ */
function CompletedOrdersTab({ branchId }: { branchId: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await api<{ orders: any[] }>('kitchen', 'orders', {
        params: { status: 'completed,delivered' },
        branchId,
      });
      setOrders(data.orders ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  if (loading) return <LinearProgress />;

  return (
    <Box>
      {orders.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No completed orders today
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {orders.map((order) => (
            <Card key={order.id} sx={{ width: 280, opacity: 0.7 }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography fontWeight={700}>#{order.order_number}</Typography>
                  <Chip size="small" label={order.status} color="success" />
                </Box>
                {order.table_name && <Chip size="small" label={order.table_name} variant="outlined" sx={{ mb: 0.5 }} />}
                <Divider sx={{ my: 0.5 }} />
                {(order.items ?? []).map((item: any) => (
                  <Typography key={item.id} variant="body2">
                    {item.quantity}× {item.name}
                  </Typography>
                ))}
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  {new Date(order.created_at).toLocaleTimeString()}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 5 — Ingredient Requests
   ═══════════════════════════════════════════════════════ */
function IngredientRequestsTab({ branchId }: { branchId: string }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ notes: '', items: [{ inventory_item_id: '', quantity_requested: 1 }] });
  const [saving, setSaving] = useState(false);

  // Quick list of inventory items for the selector
  const { data: invData } = useApi<{ items: any[] }>('inventory', 'items', { page_size: '200' }, [branchId]);
  const inventoryItems = invData?.items ?? [];

  const fetchRequests = useCallback(async () => {
    try {
      const data = await api<{ requests: any[] }>('inventory', 'ingredient-requests', { params: {}, branchId });
      setRequests(data.requests ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleCreate = async () => {
    const validItems = form.items.filter((i) => i.inventory_item_id);
    if (validItems.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      await api('inventory', 'ingredient-requests', {
        body: { notes: form.notes || undefined, items: validItems },
        branchId,
      });
      toast.success('Request sent to inventory');
      setDialog(false);
      setForm({ notes: '', items: [{ inventory_item_id: '', quantity_requested: 1 }] });
      fetchRequests();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { inventory_item_id: '', quantity_requested: 1 }] });
  const updateItem = (idx: number, patch: any) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], ...patch };
    setForm({ ...form, items });
  };
  const removeItem = (idx: number) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  if (loading) return <LinearProgress />;

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog(true)}>
          New Request
        </Button>
      </Box>

      {requests.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No ingredient requests
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {requests.map((req) => (
            <Card key={req.id} sx={{ width: 300 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography fontWeight={700}>Request</Typography>
                  <Chip
                    size="small"
                    label={req.status}
                    color={req.status === 'approved' ? 'success' : req.status === 'rejected' ? 'error' : 'warning'}
                  />
                </Box>
                {req.notes && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{req.notes}</Typography>}
                <Divider sx={{ my: 1 }} />
                {(req.items ?? req.ingredient_request_items ?? []).map((item: any, idx: number) => (
                  <Typography key={idx} variant="body2">
                    {item.quantity_requested}× {item.inventory_items?.name ?? item.inventory_item_name ?? 'Item'}
                    {item.quantity_approved != null && ` (approved: ${item.quantity_approved})`}
                  </Typography>
                ))}
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  {new Date(req.created_at).toLocaleString()} · by {req.requested_by_name ?? '—'}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* New Request Dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Ingredients</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Notes (optional)" sx={{ mt: 1, mb: 2 }}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          {form.items.map((item, idx) => (
            <Stack key={idx} direction="row" spacing={1} sx={{ mb: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Item</InputLabel>
                <Select
                  value={item.inventory_item_id} label="Item"
                  onChange={(e) => updateItem(idx, { inventory_item_id: e.target.value })}
                >
                  {inventoryItems.map((inv: any) => (
                    <MuiMenuItem key={inv.id} value={inv.id}>{inv.name} ({inv.quantity} {inv.unit})</MuiMenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small" sx={{ width: 100 }} label="Qty" type="number"
                value={item.quantity_requested}
                onChange={(e) => updateItem(idx, { quantity_requested: Number(e.target.value) })}
              />
              <IconButton color="error" onClick={() => removeItem(idx)} disabled={form.items.length <= 1}>
                <RemoveIcon />
              </IconButton>
            </Stack>
          ))}

          <Button size="small" startIcon={<AddIcon />} onClick={addItem}>Add Item</Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>Send Request</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
