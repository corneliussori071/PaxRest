import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Tabs, Tab, Typography, Button, Card, CardContent,
  Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Select, MenuItem as MuiMenuItem,
  FormControl, InputLabel, ToggleButtonGroup, ToggleButton,
  Badge, Stack, Divider, Avatar, Alert, InputAdornment,
  LinearProgress, List, ListItem, ListItemText, ListItemSecondaryAction,
  Switch, FormControlLabel, Tooltip,
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
import { KDSOrderCard, DataTable, type Column } from '@paxrest/ui';
import {
  formatCurrency,
  MEAL_AVAILABILITY_LABELS,
  MEAL_ASSIGNMENT_STATUS_LABELS,
} from '@paxrest/shared-utils';
import type { MealAvailability, MealAssignmentStatus } from '@paxrest/shared-types';
import { usePaginated, useApi, useRealtime } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';

const STATIONS = [
  { id: '', label: 'All' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bar', label: 'Bar' },
  { id: 'shisha', label: 'Shisha' },
];

export default function KitchenDisplayPage() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Tabs
        value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}
        variant="scrollable" scrollButtons="auto"
      >
        <Tab label="Pending Orders" icon={<KitchenIcon />} iconPosition="start" />
        <Tab label="Assignments" icon={<PersonIcon />} iconPosition="start" />
        <Tab label="Make a Dish" icon={<PlayArrowIcon />} iconPosition="start" />
        <Tab label="Available Meals" icon={<ShoppingCartIcon />} iconPosition="start" />
        <Tab label="Completed" icon={<DoneAllIcon />} iconPosition="start" />
        <Tab label="Ingredient Requests" icon={<InventoryIcon />} iconPosition="start" />
      </Tabs>

      {tab === 0 && <PendingOrdersTab branchId={activeBranchId!} />}
      {tab === 1 && <AssignmentsTab branchId={activeBranchId!} currency={currency} />}
      {tab === 2 && <MakeDishTab branchId={activeBranchId!} currency={currency} />}
      {tab === 3 && <AvailableMealsTab branchId={activeBranchId!} currency={currency} />}
      {tab === 4 && <CompletedOrdersTab branchId={activeBranchId!} />}
      {tab === 5 && <IngredientRequestsTab branchId={activeBranchId!} />}
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
   Tab 1 — Assignments (assign menu dishes to staff)
   ═══════════════════════════════════════════════════════ */
function AssignmentsTab({ branchId, currency }: { branchId: string; currency: string }) {
  const { data: menuData, loading, refetch } = useApi<{ items: any[] }>('menu', 'full-menu', undefined, [branchId]);
  const [assignDialog, setAssignDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [assignForm, setAssignForm] = useState({ assigned_to_name: '', quantity_to_prepare: 1, notes: '' });
  const [saving, setSaving] = useState(false);

  const menuItems = useMemo(() => {
    if (!menuData) return [];
    // full-menu returns { menu: [...categories with items] }
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

  const toggleAvailability = async (item: any) => {
    const next: MealAvailability = item.availability_status === 'available' ? 'sold_out' : 'available';
    try {
      await api('kitchen', 'update-availability', {
        body: { items: [{ menu_item_id: item.id, availability_status: next }] },
        branchId,
      });
      toast.success(`${item.name} → ${MEAL_AVAILABILITY_LABELS[next]}`);
      refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleAssign = async () => {
    if (!selectedItem || !assignForm.assigned_to_name.trim()) return;
    setSaving(true);
    try {
      await api('kitchen', 'assignments', {
        body: {
          menu_item_id: selectedItem.id,
          assigned_to_name: assignForm.assigned_to_name,
          quantity_to_prepare: assignForm.quantity_to_prepare,
          notes: assignForm.notes || undefined,
        },
        branchId,
      });
      toast.success('Dish assigned to staff');
      setAssignDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Assign dishes from the restaurant menu to kitchen staff. Staff will see their assignments in the "Make a Dish" tab.
        Toggle availability to mark items as available or sold out.
      </Alert>

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
                const avail = item.availability_status ?? 'available';
                return (
                  <Card key={item.id} sx={{ width: 240, borderLeft: `4px solid`, borderLeftColor: avail === 'available' ? 'success.main' : avail === 'sold_out' ? 'error.main' : 'warning.main' }}>
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      {item.media_url && (
                        <Box sx={{ width: '100%', height: 100, mb: 1, borderRadius: 1, overflow: 'hidden' }}>
                          {item.media_type === 'video' ? (
                            <video src={item.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                          ) : (
                            <img src={item.media_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )}
                        </Box>
                      )}
                      <Typography fontWeight={700}>{item.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatCurrency(item.base_price, currency)}
                        {item.calories ? ` · ${item.calories} cal` : ''}
                      </Typography>

                      {item.menu_item_ingredients?.length > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                          {item.menu_item_ingredients.map((i: any) => i.name || i.ingredient_name).join(', ')}
                        </Typography>
                      )}

                      <Box sx={{ mt: 1, display: 'flex', gap: 0.5, alignItems: 'center', justifyContent: 'space-between' }}>
                        <Chip
                          size="small" label={MEAL_AVAILABILITY_LABELS[avail as MealAvailability] ?? avail}
                          color={avail === 'available' ? 'success' : avail === 'sold_out' ? 'error' : 'warning'}
                          onClick={() => toggleAvailability(item)}
                          sx={{ cursor: 'pointer' }}
                        />
                        <Tooltip title="Assign to staff">
                          <IconButton
                            size="small" color="primary"
                            onClick={() => {
                              setSelectedItem(item);
                              setAssignForm({ assigned_to_name: '', quantity_to_prepare: 1, notes: '' });
                              setAssignDialog(true);
                            }}
                          >
                            <PersonIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>

                      {item.available_quantity > 0 && (
                        <Chip size="small" label={`${item.available_quantity} ready`} color="info" variant="outlined" sx={{ mt: 0.5 }} />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          </Box>
        ))
      )}

      {/* Assign Dialog */}
      <Dialog open={assignDialog} onClose={() => setAssignDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign: {selectedItem?.name}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Assign to (Staff Name)" sx={{ mt: 1, mb: 2 }}
            value={assignForm.assigned_to_name}
            onChange={(e) => setAssignForm({ ...assignForm, assigned_to_name: e.target.value })}
          />
          <TextField
            fullWidth label="Quantity to Prepare" type="number" sx={{ mb: 2 }}
            value={assignForm.quantity_to_prepare}
            onChange={(e) => setAssignForm({ ...assignForm, quantity_to_prepare: Math.max(1, Number(e.target.value)) })}
          />
          <TextField
            fullWidth label="Notes (optional)"
            value={assignForm.notes}
            onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAssign} disabled={saving || !assignForm.assigned_to_name.trim()}>
            Assign
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 2 — Make a Dish (assigned meals to prepare)
   ═══════════════════════════════════════════════════════ */
function MakeDishTab({ branchId, currency }: { branchId: string; currency: string }) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = useCallback(async () => {
    try {
      const data = await api<{ assignments: any[] }>('kitchen', 'assignments', { params: {}, branchId });
      setAssignments(data.assignments ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);
  useRealtime('meal_assignments', branchId ? { column: 'branch_id', value: branchId } : undefined, () => fetchAssignments());

  const handleRespond = async (id: string, status: 'accepted' | 'rejected') => {
    try {
      await api('kitchen', 'assignment-respond', { body: { assignment_id: id, status }, branchId });
      toast.success(status === 'accepted' ? 'Accepted!' : 'Rejected');
      fetchAssignments();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleComplete = async (id: string) => {
    try {
      await api('kitchen', 'assignment-complete', { body: { assignment_id: id }, branchId });
      toast.success('Dish completed & added to available meals!');
      fetchAssignments();
    } catch (err: any) { toast.error(err.message); }
  };

  const grouped = useMemo(() => {
    const pending = assignments.filter((a) => a.status === 'pending');
    const inProgress = assignments.filter((a) => a.status === 'accepted' || a.status === 'in_progress');
    const done = assignments.filter((a) => a.status === 'completed');
    return { pending, inProgress, done };
  }, [assignments]);

  const renderCard = (a: any) => {
    const statusColor =
      a.status === 'pending' ? 'warning' :
      a.status === 'accepted' || a.status === 'in_progress' ? 'info' :
      a.status === 'completed' ? 'success' : 'default';

    return (
      <Card key={a.id} sx={{ width: 260, borderTop: `3px solid`, borderTopColor: `${statusColor}.main` }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Typography fontWeight={700}>{a.menu_item_name ?? a.menu_items?.name ?? 'Unknown'}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ my: 0.5 }}>
            <Chip size="small" label={`×${a.quantity_to_prepare}`} />
            <Chip size="small" label={MEAL_ASSIGNMENT_STATUS_LABELS[a.status as MealAssignmentStatus] ?? a.status} color={statusColor as any} />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block">
            Assigned to: {a.assigned_to_name}
          </Typography>
          {a.notes && <Typography variant="caption" display="block">📝 {a.notes}</Typography>}

          <Box sx={{ mt: 1, display: 'flex', gap: 0.5 }}>
            {a.status === 'pending' && (
              <>
                <Button size="small" variant="contained" color="success" onClick={() => handleRespond(a.id, 'accepted')}>Accept</Button>
                <Button size="small" variant="outlined" color="error" onClick={() => handleRespond(a.id, 'rejected')}>Reject</Button>
              </>
            )}
            {(a.status === 'accepted' || a.status === 'in_progress') && (
              <Button size="small" variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={() => handleComplete(a.id)}>
                Done
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  };

  if (loading) return <LinearProgress />;

  return (
    <Box>
      {assignments.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No dish assignments yet. Assignments are created from the "Assignments" tab.
        </Typography>
      ) : (
        <>
          {grouped.pending.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={700} color="warning.main" sx={{ mb: 1 }}>
                Pending ({grouped.pending.length})
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>{grouped.pending.map(renderCard)}</Box>
            </Box>
          )}
          {grouped.inProgress.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={700} color="info.main" sx={{ mb: 1 }}>
                In Progress ({grouped.inProgress.length})
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>{grouped.inProgress.map(renderCard)}</Box>
            </Box>
          )}
          {grouped.done.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={700} color="success.main" sx={{ mb: 1 }}>
                Completed Today ({grouped.done.length})
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>{grouped.done.map(renderCard)}</Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 3 — Available Meals (ready for POS)
   ═══════════════════════════════════════════════════════ */
function AvailableMealsTab({ branchId, currency }: { branchId: string; currency: string }) {
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

  if (loading) return <LinearProgress />;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Meals ready for sale. Quantity decreases when sold through POS or can be adjusted manually.
      </Alert>

      {meals.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No available meals. Complete dish assignments from the "Make a Dish" tab.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {meals.map((meal) => (
            <Card key={meal.id} sx={{ width: 220, textAlign: 'center' }}>
              <CardContent>
                {meal.menu_items?.media_url && (
                  <Avatar
                    src={meal.menu_items.media_url}
                    variant="rounded"
                    sx={{ width: 80, height: 80, mx: 'auto', mb: 1 }}
                  />
                )}
                <Typography fontWeight={700}>{meal.menu_item_name ?? meal.menu_items?.name ?? '—'}</Typography>
                <Typography variant="h4" fontWeight={800} color={meal.quantity_available > 0 ? 'success.main' : 'error.main'} sx={{ my: 1 }}>
                  {meal.quantity_available}
                </Typography>
                <Typography variant="caption" color="text.secondary">available</Typography>
                <Box sx={{ mt: 1 }}>
                  <IconButton color="error" onClick={() => handleDecrement(meal)} disabled={meal.quantity_available <= 0}>
                    <RemoveIcon />
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          ))}
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
