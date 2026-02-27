import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Tabs, Tab, Typography, Button, Card, CardContent,
  Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Select, MenuItem as MuiMenuItem,
  FormControl, InputLabel, ToggleButtonGroup, ToggleButton,
  Badge, Stack, Divider, Alert, InputAdornment,
  LinearProgress, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Paper, Collapse, TablePagination,
  Tooltip, Autocomplete, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import UndoIcon from '@mui/icons-material/Undo';
import PrintIcon from '@mui/icons-material/Print';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import CloseIcon from '@mui/icons-material/Close';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import TableBarIcon from '@mui/icons-material/TableBar';
import { formatCurrency, INGREDIENT_REQUEST_STATUS_LABELS, INGREDIENT_REQUEST_STATUS_COLORS } from '@paxrest/shared-utils';
import type { IngredientRequestStatus } from '@paxrest/shared-types';
import { useApi, usePaginated, useRealtime } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import { useAvailableMealsStore } from '@/stores';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

export default function BarPage() {
  return <BranchGuard><BarContent /></BranchGuard>;
}

function BarContent() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [tab, setTab] = useState(0);

  const TAB_LABELS = ['Create Order', 'Pending Orders', 'Pending Payment', 'Request for Items'];

  return (
    <Box sx={{ p: 0 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {TAB_LABELS.map((label, i) => (
          <Tab key={label} label={label} icon={
            i === 0 ? <PointOfSaleIcon /> :
            i === 1 ? <LocalBarIcon /> :
            i === 2 ? <CheckCircleIcon /> :
            <RestaurantIcon />
          } iconPosition="start" />
        ))}
      </Tabs>

      {tab === 0 && <CreateOrderTab branchId={activeBranchId!} currency={currency} />}
      {tab === 1 && <PendingOrdersTab branchId={activeBranchId!} currency={currency} />}
      {tab === 2 && <PendingPaymentTab branchId={activeBranchId!} currency={currency} />}
      {tab === 3 && <RequestForItemsTab branchId={activeBranchId!} />}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 1 — Create Order
   Search/scan bar store items + available meals, select table, seaters
   ═══════════════════════════════════════════════════════ */

interface BarCartItem {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  source: 'bar_store' | 'menu';
  bar_store_item_id?: string;
  menu_item_id?: string;
  max_qty?: number;
}

function CreateOrderTab({ branchId, currency }: { branchId: string; currency: string }) {
  const { profile } = useAuth();
  const { meals, fetchMeals } = useAvailableMealsStore();

  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState<BarCartItem[]>([]);
  const [showMeals, setShowMeals] = useState(false);

  // Bar store items
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeTotal, setStoreTotal] = useState(0);

  // Tables
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [numPeople, setNumPeople] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fmt = (n: number) => formatCurrency(n, currency);

  // Fetch bar store items
  const fetchStore = useCallback(async () => {
    setStoreLoading(true);
    try {
      const data = await api<{ items: any[]; total: number }>('bar', 'internal-store', {
        params: { page: '1', page_size: '200', ...(search ? { search } : {}) },
        branchId,
      });
      setStoreItems(data.items ?? []);
      setStoreTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setStoreLoading(false); }
  }, [branchId, search]);

  useEffect(() => { fetchStore(); }, [fetchStore]);
  useEffect(() => { if (branchId) fetchMeals(branchId); }, [branchId]);

  // Fetch available tables
  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ tables: any[]; counts: Record<string, number> }>('tables', 'layout', {
          params: { status: 'available', page: '1', page_size: '100' },
          branchId,
        });
        setTables(data.tables ?? []);
      } catch (err) { console.error(err); }
    })();
  }, [branchId]);

  // Barcode scan
  const handleBarcodeScan = async () => {
    if (!barcode.trim()) return;
    try {
      const data = await api<{ item: any }>('bar', 'barcode-lookup', {
        params: { barcode: barcode.trim() },
        branchId,
      });
      if (data.item) {
        addToCart({
          id: data.item.id,
          name: data.item.item_name,
          unit_price: data.item.selling_price ?? 0,
          quantity: 1,
          source: 'bar_store',
          bar_store_item_id: data.item.id,
          max_qty: data.item.quantity,
        });
        toast.success(`Added ${data.item.item_name}`);
      } else {
        toast.error('Item not found for this barcode');
      }
    } catch (err: any) { toast.error(err.message); }
    setBarcode('');
  };

  const addToCart = (item: BarCartItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id && c.source === item.source);
      if (existing) {
        return prev.map((c) =>
          c.id === item.id && c.source === item.source
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQty = (id: string, source: string, delta: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.id === id && c.source === source
          ? { ...c, quantity: Math.max(1, c.quantity + delta) }
          : c
      )
    );
  };

  const removeFromCart = (id: string, source: string) => {
    setCart((prev) => prev.filter((c) => !(c.id === id && c.source === source)));
  };

  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);

  const handleSubmit = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    if (!selectedTable) return toast.error('Select a table');
    if (!numPeople || numPeople < 1) return toast.error('Enter number of people');

    setSubmitting(true);
    try {
      const items = cart.map((c) => ({
        name: c.name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        source: c.source,
        bar_store_item_id: c.bar_store_item_id,
        menu_item_id: c.menu_item_id,
      }));

      const data = await api<{ order_id: string; order_number: string; total: number }>('bar', 'create-order', {
        body: {
          items,
          table_id: selectedTable,
          num_people: numPeople,
          customer_name: customerName || undefined,
          notes: notes || undefined,
          order_type: 'dine_in',
        },
        branchId,
      });

      toast.success(`Order #${data.order_number} created — ${fmt(data.total)}`);
      setCart([]);
      setSelectedTable('');
      setNumPeople(1);
      setCustomerName('');
      setNotes('');
      fetchStore(); // refresh stock
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 140px)' }}>
      {/* Left: Item Browser */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Search & Barcode */}
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <TextField
            size="small" fullWidth placeholder="Search bar items…"
            value={search} onChange={(e) => { setSearch(e.target.value); setShowMeals(false); }}
            slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          />
          <TextField
            size="small" placeholder="Scan barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleBarcodeScan(); }}
            slotProps={{ input: { startAdornment: <QrCodeScannerIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
            sx={{ width: 200 }}
          />
          {meals.length > 0 && (
            <Button
              variant={showMeals ? 'contained' : 'outlined'}
              color="success"
              onClick={() => { setShowMeals(!showMeals); setSearch(''); }}
              startIcon={<RestaurantIcon />}
              sx={{ flexShrink: 0 }}
            >
              <Badge badgeContent={meals.reduce((s, m) => s + m.quantity_available, 0)} color="info" max={99}>
                Meals
              </Badge>
            </Button>
          )}
        </Stack>

        {/* Item Grid */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {storeLoading && !showMeals ? <LinearProgress /> : showMeals ? (
            // Available Meals
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              {meals.filter((m) => m.quantity_available > 0).map((meal) => (
                <Card
                  key={meal.id}
                  sx={{ width: 180, cursor: 'pointer', '&:hover': { boxShadow: 4 }, transition: '0.15s' }}
                  onClick={() => addToCart({
                    id: meal.menu_item_id,
                    name: meal.menu_item_name ?? meal.menu_items?.name ?? 'Meal',
                    unit_price: meal.menu_items?.base_price ?? 0,
                    quantity: 1,
                    source: 'menu',
                    menu_item_id: meal.menu_item_id,
                  })}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    {(meal.menu_items?.media_url || meal.menu_items?.image_url) && (
                      <Box sx={{ width: '100%', height: 60, borderRadius: 1, overflow: 'hidden', mb: 0.5 }}>
                        <img
                          src={meal.menu_items.media_url ?? meal.menu_items.image_url}
                          alt={meal.menu_item_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </Box>
                    )}
                    <Typography variant="body2" fontWeight={700} noWrap>{meal.menu_item_name ?? meal.menu_items?.name}</Typography>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                      <Typography variant="body2" color="primary.main" fontWeight={600}>
                        {formatCurrency(meal.menu_items?.base_price ?? 0, currency)}
                      </Typography>
                      <Chip size="small" label={`${meal.quantity_available} avail`} color="success" />
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {meals.filter((m) => m.quantity_available > 0).length === 0 && (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center', width: '100%' }}>
                  No available meals from kitchen
                </Typography>
              )}
            </Box>
          ) : (
            // Bar Store Items
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              {storeItems.filter((i) => Number(i.quantity) > 0).map((item) => (
                <Card
                  key={item.id}
                  sx={{ width: 180, cursor: 'pointer', '&:hover': { boxShadow: 4 }, transition: '0.15s' }}
                  onClick={() => addToCart({
                    id: item.id,
                    name: item.item_name,
                    unit_price: item.selling_price ?? 0,
                    quantity: 1,
                    source: 'bar_store',
                    bar_store_item_id: item.id,
                    max_qty: item.quantity,
                  })}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="body2" fontWeight={700} noWrap>{item.item_name}</Typography>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                      <Typography variant="body2" color="primary.main" fontWeight={600}>
                        {item.selling_price ? fmt(item.selling_price) : '—'}
                      </Typography>
                      <Chip
                        size="small"
                        label={`${Number(item.quantity)} ${item.unit ?? ''}`}
                        color={Number(item.quantity) < 5 ? 'warning' : 'default'}
                        variant="outlined"
                      />
                    </Stack>
                    {item.barcode && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.3 }}>
                        {item.barcode}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              ))}
              {storeItems.filter((i) => Number(i.quantity) > 0).length === 0 && !storeLoading && (
                <Alert severity="info" sx={{ mt: 2, width: '100%' }}>
                  No items in bar store. Request items from Inventory using the "Request for Items" tab.
                </Alert>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Right: Cart + Order Details */}
      <Paper sx={{ width: 380, display: 'flex', flexDirection: 'column', p: 2 }} variant="outlined">
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
          <LocalBarIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Bar Order
        </Typography>

        {/* Table Selection */}
        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
          <InputLabel>Table *</InputLabel>
          <Select value={selectedTable} label="Table *" onChange={(e) => setSelectedTable(e.target.value)}>
            {tables.map((t) => (
              <MuiMenuItem key={t.id} value={t.id}>
                {t.name ?? `Table ${t.table_number}`} ({t.capacity} seats)
              </MuiMenuItem>
            ))}
          </Select>
        </FormControl>

        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <TextField
            size="small" label="Seaters *" type="number" sx={{ width: 100 }}
            value={numPeople}
            onChange={(e) => setNumPeople(Math.max(1, Number(e.target.value)))}
            inputProps={{ min: 1 }}
          />
          <TextField
            size="small" label="Customer Name" fullWidth
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </Stack>

        <TextField
          size="small" label="Notes" fullWidth multiline rows={1} sx={{ mb: 1 }}
          value={notes} onChange={(e) => setNotes(e.target.value)}
        />

        <Divider sx={{ my: 1 }} />

        {/* Cart Items */}
        <Box sx={{ flex: 1, overflow: 'auto', mb: 1 }}>
          {cart.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              Tap items to add to cart
            </Typography>
          ) : (
            cart.map((item) => (
              <Box key={`${item.source}-${item.id}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, py: 0.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmt(item.unit_price)} × {item.quantity} = {fmt(item.unit_price * item.quantity)}
                  </Typography>
                  <Chip size="small" label={item.source === 'bar_store' ? 'Bar' : 'Menu'} sx={{ ml: 1 }}
                    color={item.source === 'bar_store' ? 'primary' : 'success'} variant="outlined" />
                </Box>
                <Stack direction="row" alignItems="center" spacing={0}>
                  <IconButton size="small" onClick={() => updateQty(item.id, item.source, -1)}><RemoveIcon fontSize="small" /></IconButton>
                  <Typography sx={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</Typography>
                  <IconButton size="small" onClick={() => updateQty(item.id, item.source, 1)}><AddIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => removeFromCart(item.id, item.source)}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              </Box>
            ))
          )}
        </Box>

        <Divider />
        <Stack direction="row" justifyContent="space-between" sx={{ my: 1 }}>
          <Typography variant="h6" fontWeight={700}>Total</Typography>
          <Typography variant="h6" fontWeight={700} color="primary.main">{fmt(subtotal)}</Typography>
        </Stack>

        <Button
          variant="contained" fullWidth size="large"
          disabled={submitting || cart.length === 0 || !selectedTable}
          onClick={handleSubmit}
        >
          {submitting ? 'Processing…' : `Place Order — ${fmt(subtotal)}`}
        </Button>
      </Paper>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 2 — Pending Orders
   ═══════════════════════════════════════════════════════ */

const ORDER_STATUS_COLORS: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error' | 'primary'> = {
  pending: 'warning',
  confirmed: 'info',
  preparing: 'info',
  ready: 'success',
  served: 'primary',
};

function PendingOrdersTab({ branchId, currency }: { branchId: string; currency: string }) {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [markingServed, setMarkingServed] = useState<string | null>(null);

  // Order detail dialog
  const [detailDialog, setDetailDialog] = useState(false);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fmt = (n: number) => formatCurrency(n, currency);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await api<{ orders: any[]; total: number }>('bar', 'pending-orders', {
        params: { page: String(page + 1), page_size: String(pageSize) },
        branchId,
      });
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize]);

  useEffect(() => { setLoading(true); fetchOrders(); }, [fetchOrders]);
  useRealtime('orders', branchId ? { column: 'branch_id', value: branchId } : undefined, () => fetchOrders());

  const handleMarkServed = async (orderId: string) => {
    setMarkingServed(orderId);
    try {
      await api('bar', 'mark-served', { body: { order_id: orderId }, branchId });
      toast.success('Order marked as served — awaiting payment');
      fetchOrders();
    } catch (err: any) { toast.error(err.message); }
    finally { setMarkingServed(null); }
  };

  const openDetail = async (orderId: string) => {
    setDetailDialog(true);
    setDetailLoading(true);
    setDetailOrder(null);
    try {
      const data = await api<{ order: any }>('bar', 'order-detail', {
        params: { id: orderId },
        branchId,
      });
      setDetailOrder(data.order);
    } catch (err: any) {
      toast.error(err.message);
      setDetailDialog(false);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading && orders.length === 0) return <LinearProgress />;

  return (
    <Box>
      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {orders.length === 0 && !loading ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No pending bar orders
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {orders.map((order) => (
            <Card key={order.id} sx={{ width: 300, borderLeft: '4px solid', borderLeftColor: `${ORDER_STATUS_COLORS[order.status] ?? 'default'}.main` }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography fontWeight={700}>#{order.order_number}</Typography>
                  <Chip size="small" label={order.status?.replace(/_/g, ' ')} color={ORDER_STATUS_COLORS[order.status] ?? 'default'} />
                </Stack>

                {order.customer_name && (
                  <Typography variant="body2" color="text.secondary">Customer: {order.customer_name}</Typography>
                )}

                <Divider sx={{ my: 0.5 }} />

                {(order.order_items ?? []).slice(0, 5).map((item: any) => (
                  <Typography key={item.id} variant="body2">{item.quantity}× {item.menu_item_name}</Typography>
                ))}
                {(order.order_items ?? []).length > 5 && (
                  <Typography variant="caption" color="text.secondary">+{(order.order_items ?? []).length - 5} more</Typography>
                )}

                <Divider sx={{ my: 0.5 }} />

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography fontWeight={700}>{fmt(order.total)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(order.created_at).toLocaleTimeString()}
                  </Typography>
                </Stack>

                <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                  <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => openDetail(order.id)}>
                    Details
                  </Button>
                  <Button
                    size="small" variant="contained" color="success"
                    startIcon={<CheckCircleIcon />}
                    disabled={markingServed === order.id}
                    onClick={() => handleMarkServed(order.id)}
                  >
                    Served?
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {total > 0 && (
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => { setPage(p); setLoading(true); }}
          onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); setLoading(true); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}

      {/* Order Detail Dialog */}
      <OrderDetailDialog
        open={detailDialog}
        onClose={() => setDetailDialog(false)}
        order={detailOrder}
        loading={detailLoading}
        currency={currency}
      />
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 3 — Pending Payment (awaiting_payment)
   ═══════════════════════════════════════════════════════ */
function PendingPaymentTab({ branchId, currency }: { branchId: string; currency: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [detailDialog, setDetailDialog] = useState(false);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fmt = (n: number) => formatCurrency(n, currency);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await api<{ orders: any[]; total: number }>('bar', 'awaiting-payment', {
        params: { page: String(page + 1), page_size: String(pageSize) },
        branchId,
      });
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize]);

  useEffect(() => { setLoading(true); fetchOrders(); }, [fetchOrders]);
  useRealtime('orders', branchId ? { column: 'branch_id', value: branchId } : undefined, () => fetchOrders());

  const openDetail = async (orderId: string) => {
    setDetailDialog(true);
    setDetailLoading(true);
    setDetailOrder(null);
    try {
      const data = await api<{ order: any }>('bar', 'order-detail', {
        params: { id: orderId },
        branchId,
      });
      setDetailOrder(data.order);
    } catch (err: any) {
      toast.error(err.message);
      setDetailDialog(false);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading && orders.length === 0) return <LinearProgress />;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Orders awaiting payment. Checkout can be completed at the POS Terminal.
      </Alert>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {orders.length === 0 && !loading ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No orders awaiting payment
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {orders.map((order) => (
            <Card key={order.id} sx={{ width: 320, borderTop: '3px solid', borderTopColor: 'warning.main' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight={700}>#{order.order_number}</Typography>
                  <Chip size="small" label="Awaiting Payment" color="warning" />
                </Stack>

                {order.customer_name && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Customer: {order.customer_name}
                  </Typography>
                )}

                <Typography variant="body2" color="text.secondary">
                  Created by: {order.created_by_name ?? '—'} · {order.department ?? 'bar'}
                </Typography>

                {order.served_at && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    Served: {new Date(order.served_at).toLocaleString()}
                  </Typography>
                )}

                <Divider sx={{ my: 1 }} />

                {(order.order_items ?? []).map((item: any) => (
                  <Stack key={item.id} direction="row" justifyContent="space-between" sx={{ py: 0.25 }}>
                    <Typography variant="body2">{item.quantity}× {item.menu_item_name}</Typography>
                    <Typography variant="body2" fontWeight={600}>{fmt(item.item_total ?? item.unit_price * item.quantity)}</Typography>
                  </Stack>
                ))}

                <Divider sx={{ my: 1 }} />

                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="h6" fontWeight={700}>Total</Typography>
                  <Typography variant="h6" fontWeight={700} color="primary.main">{fmt(order.total)}</Typography>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => openDetail(order.id)}>
                    Full Details
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {total > 0 && (
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => { setPage(p); setLoading(true); }}
          onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); setLoading(true); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}

      <OrderDetailDialog
        open={detailDialog}
        onClose={() => setDetailDialog(false)}
        order={detailOrder}
        loading={detailLoading}
        currency={currency}
      />
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Shared Order Detail Dialog — printable + PDF support
   ═══════════════════════════════════════════════════════ */
function OrderDetailDialog({
  open, onClose, order, loading, currency,
}: {
  open: boolean;
  onClose: () => void;
  order: any;
  loading: boolean;
  currency: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency);

  const handlePrint = () => {
    const el = document.getElementById('bar-order-detail-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Bar Order #${order?.order_number ?? ''}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px}
      table{border-collapse:collapse;width:100%;margin-top:10px}
      th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
      th{background:#f5f5f5}
      .total{font-size:18px;font-weight:bold;margin-top:12px}
      .info{margin-top:12px;font-size:13px;color:#555}
      </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const handleDownloadPDF = () => {
    // Use print-to-PDF approach (modern browsers support saving as PDF from print dialog)
    handlePrint();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <LocalBarIcon />
          <Typography variant="h6">Order Details</Typography>
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Print"><IconButton onClick={handlePrint} disabled={loading}><PrintIcon /></IconButton></Tooltip>
          <Tooltip title="Download PDF"><IconButton onClick={handleDownloadPDF} disabled={loading}><PictureAsPdfIcon /></IconButton></Tooltip>
          <Tooltip title="Close"><IconButton onClick={onClose}><CloseIcon /></IconButton></Tooltip>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
        ) : order ? (
          <Box id="bar-order-detail-print">
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <Typography variant="body2"><strong>Order #:</strong> {order.order_number}</Typography>
                <Typography variant="body2"><strong>Status:</strong> {order.status?.replace(/_/g, ' ')}</Typography>
                <Typography variant="body2"><strong>Type:</strong> {order.order_type?.replace(/_/g, ' ')}</Typography>
                <Typography variant="body2"><strong>Department:</strong> {order.department ?? 'bar'}</Typography>
                <Typography variant="body2"><strong>Source:</strong> {order.source ?? 'bar'}</Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="body2"><strong>Created By:</strong> {order.created_by_name ?? '—'}</Typography>
                <Typography variant="body2"><strong>Created:</strong> {new Date(order.created_at).toLocaleString()}</Typography>
                {order.served_at && (
                  <Typography variant="body2"><strong>Served:</strong> {new Date(order.served_at).toLocaleString()}</Typography>
                )}
                {order.customer_name && (
                  <Typography variant="body2"><strong>Customer:</strong> {order.customer_name}</Typography>
                )}
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            {/* Items Table */}
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Items</Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Item</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(order.order_items ?? []).map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.menu_item_name}</TableCell>
                      <TableCell align="right">{item.quantity}</TableCell>
                      <TableCell align="right">{fmt(item.unit_price)}</TableCell>
                      <TableCell align="right">{fmt(item.item_total ?? item.unit_price * item.quantity)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" justifyContent="flex-end" spacing={3}>
              {order.subtotal != null && order.subtotal !== order.total && (
                <Typography variant="body1">Subtotal: {fmt(order.subtotal)}</Typography>
              )}
              {order.discount_amount > 0 && (
                <Typography variant="body1" color="error.main">
                  Discount: -{fmt(order.discount_amount)}
                  {order.discount_reason && ` (${order.discount_reason})`}
                </Typography>
              )}
              <Typography variant="h6" fontWeight={700}>Total: {fmt(order.total)}</Typography>
            </Stack>

            {/* Payments */}
            {(order.order_payments ?? []).length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Payments</Typography>
                {order.order_payments.map((p: any) => (
                  <Typography key={p.id} variant="body2">
                    {p.method}: {fmt(p.amount)} — {new Date(p.created_at).toLocaleString()}
                  </Typography>
                ))}
              </>
            )}

            {/* Status History */}
            {(order.order_status_history ?? []).length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Status History</Typography>
                {order.order_status_history.map((h: any) => (
                  <Typography key={h.id} variant="body2">
                    {h.old_status} → {h.new_status} — by {h.changed_by_name ?? '—'} · {new Date(h.created_at).toLocaleString()}
                    {h.notes && ` (${h.notes})`}
                  </Typography>
                ))}
              </>
            )}

            {order.notes && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="body2"><strong>Notes:</strong> {order.notes}</Typography>
              </>
            )}
          </Box>
        ) : (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No data available</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint} disabled={loading || !order}>Print</Button>
        <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={handleDownloadPDF} disabled={loading || !order}>Save as PDF</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 4 — Request for Items (mirrors Kitchen Display)
   Sub-tabs: Requisitions + Internal Store
   ═══════════════════════════════════════════════════════ */
function RequestForItemsTab({ branchId }: { branchId: string }) {
  const [subTab, setSubTab] = useState(0);

  return (
    <Box>
      <Tabs value={subTab} onChange={(_, v) => setSubTab(v)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="Requisitions" />
        <Tab label="Internal Store" />
      </Tabs>
      {subTab === 0 && <BarRequisitionsSubTab branchId={branchId} />}
      {subTab === 1 && <BarInternalStoreSubTab branchId={branchId} />}
    </Box>
  );
}

/* ─── Bar Requisitions Sub-Tab (same workflow as Kitchen) ─── */
const DATE_RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All' },
];

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'disbursed', label: 'Disbursed' },
  { value: 'received', label: 'Received' },
  { value: 'return_requested', label: 'Return Requested' },
  { value: 'returned', label: 'Returned' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

function BarRequisitionsSubTab({ branchId }: { branchId: string }) {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState('today');
  const [statusFilter, setStatusFilter] = useState('');

  // Dialog states
  const [dialog, setDialog] = useState(false);
  const [editingRequest, setEditingRequest] = useState<any>(null);
  const [form, setForm] = useState({ notes: '', items: [{ inventory_item_id: '', quantity_requested: 1 }] });
  const [saving, setSaving] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [returnDialog, setReturnDialog] = useState<string | null>(null);
  const [returnNotes, setReturnNotes] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Receive dialog
  const [receiveDialog, setReceiveDialog] = useState<any>(null);
  const [receiveItems, setReceiveItems] = useState<any[]>([]);

  // Inventory items for selector
  const { data: invData } = useApi<{ items: any[] }>('inventory', 'items', { page_size: '200' }, [branchId]);
  const inventoryItems = invData?.items ?? [];

  const fetchRequests = useCallback(async () => {
    try {
      const params: Record<string, string> = {
        page: String(page + 1),
        page_size: String(pageSize),
        date_range: dateRange,
        station: 'bar', // Filter to bar station requests
      };
      if (statusFilter) params.status = statusFilter;
      const data = await api<{ items: any[]; total: number }>('inventory', 'ingredient-requests', {
        params,
        branchId,
      });
      setRequests(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, dateRange, statusFilter]);

  useEffect(() => { setLoading(true); fetchRequests(); }, [fetchRequests]);

  const openNew = () => {
    setEditingRequest(null);
    setForm({ notes: '', items: [{ inventory_item_id: '', quantity_requested: 1 }] });
    setDialog(true);
  };

  const openEdit = (req: any) => {
    setEditingRequest(req);
    const items = (req.ingredient_request_items ?? []).map((i: any) => ({
      inventory_item_id: i.inventory_item_id,
      quantity_requested: i.quantity_requested,
    }));
    setForm({ notes: req.notes ?? '', items: items.length ? items : [{ inventory_item_id: '', quantity_requested: 1 }] });
    setDialog(true);
  };

  const handleSave = async () => {
    const validItems = form.items.filter((i) => i.inventory_item_id);
    if (validItems.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      if (editingRequest) {
        await api('inventory', 'ingredient-request-update', {
          body: { request_id: editingRequest.id, notes: form.notes || undefined, items: validItems },
          branchId,
        });
        toast.success('Request updated');
      } else {
        await api('inventory', 'ingredient-requests', {
          body: { notes: form.notes || undefined, items: validItems, station: 'bar' },
          branchId,
        });
        toast.success('Request sent to inventory');
      }
      setDialog(false);
      setEditingRequest(null);
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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this request?')) return;
    setActionLoading(id);
    try {
      await api('inventory', 'ingredient-request-delete', { body: { request_id: id }, branchId });
      toast.success('Request deleted');
      fetchRequests();
    } catch (err: any) { toast.error(err.message); }
    finally { setActionLoading(null); }
  };

  const openReceive = (req: any) => {
    const items = (req.ingredient_request_items ?? []).map((i: any) => ({
      id: i.id,
      name: i.inventory_items?.name ?? i.inventory_item_name ?? 'Item',
      quantity_disbursed: i.quantity_disbursed ?? 0,
      quantity_received: i.quantity_disbursed ?? i.quantity_requested ?? 0,
      unit: i.unit,
    }));
    setReceiveItems(items);
    setReceiveDialog(req);
  };

  const handleReceive = async () => {
    if (!receiveDialog) return;
    setActionLoading(receiveDialog.id);
    try {
      await api('inventory', 'ingredient-request-receive', {
        body: {
          request_id: receiveDialog.id,
          items: receiveItems.map((i) => ({
            id: i.id,
            quantity_received: Number(i.quantity_received),
          })),
        },
        branchId,
      });
      toast.success('Items received!');
      setReceiveDialog(null);
      fetchRequests();
    } catch (err: any) { toast.error(err.message); }
    finally { setActionLoading(null); }
  };

  const handleReturn = async () => {
    if (!returnDialog) return;
    setActionLoading(returnDialog);
    try {
      await api('inventory', 'ingredient-request-return', {
        body: { request_id: returnDialog, return_notes: returnNotes || undefined },
        branchId,
      });
      toast.success('Return requested — waiting for inventory to accept');
      setReturnDialog(null);
      setReturnNotes('');
      fetchRequests();
    } catch (err: any) { toast.error(err.message); }
    finally { setActionLoading(null); }
  };

  const getStatusColor = (status: string) =>
    (INGREDIENT_REQUEST_STATUS_COLORS as Record<string, string>)[status] ?? 'default';

  if (loading && requests.length === 0) return <LinearProgress />;

  return (
    <Box>
      {/* Toolbar */}
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <ToggleButtonGroup size="small" value={dateRange} exclusive onChange={(_, v) => { if (v) { setDateRange(v); setPage(0); } }}>
            {DATE_RANGE_OPTIONS.map((o) => <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>)}
          </ToggleButtonGroup>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
              {STATUS_FILTER_OPTIONS.map((o) => <MuiMenuItem key={o.value} value={o.value}>{o.label}</MuiMenuItem>)}
            </Select>
          </FormControl>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>New Request</Button>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {/* Requests Table */}
      {requests.length === 0 && !loading ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No ingredient requests found
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={40} />
                <TableCell>Items</TableCell>
                <TableCell width={160}>Requested By</TableCell>
                <TableCell width={160}>Date &amp; Time</TableCell>
                <TableCell width={120}>Status</TableCell>
                <TableCell width={180} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((req) => {
                const items = req.ingredient_request_items ?? [];
                const isExpanded = expandedRow === req.id;
                const itemSummary = items.map((i: any) =>
                  `${i.quantity_requested}× ${i.inventory_items?.name ?? i.inventory_item_name ?? 'Item'}`
                ).join(', ');
                const status = req.status as IngredientRequestStatus;
                const isPending = status === 'pending';
                const canReceive = status === 'in_transit' || status === 'disbursed';
                const canReturn = status === 'received';
                const isOwner = req.requested_by === profile?.id;

                return (
                  <React.Fragment key={req.id}>
                    <TableRow
                      hover sx={{ cursor: 'pointer', '& td': { borderBottom: isExpanded ? 'none' : undefined } }}
                      onClick={() => setExpandedRow(isExpanded ? null : req.id)}
                    >
                      <TableCell>
                        <IconButton size="small">
                          <ExpandMoreIcon sx={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>{itemSummary || '—'}</Typography>
                        {req.notes && <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 300, display: 'block' }}>{req.notes}</Typography>}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{req.requested_by_name ?? '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{new Date(req.created_at).toLocaleDateString()}</Typography>
                        <Typography variant="caption" color="text.secondary">{new Date(req.created_at).toLocaleTimeString()}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={INGREDIENT_REQUEST_STATUS_LABELS[status] ?? status} color={getStatusColor(status) as any} />
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          {isPending && isOwner && (
                            <>
                              <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(req)} disabled={actionLoading === req.id}><EditIcon fontSize="small" /></IconButton></Tooltip>
                              <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(req.id)} disabled={actionLoading === req.id}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                            </>
                          )}
                          {canReceive && (
                            <Button size="small" variant="contained" color="success" startIcon={<CallReceivedIcon />}
                              onClick={() => openReceive(req)} disabled={actionLoading === req.id}>
                              Receive
                            </Button>
                          )}
                          {canReturn && (
                            <Button size="small" variant="outlined" color="warning" startIcon={<UndoIcon />}
                              onClick={() => { setReturnDialog(req.id); setReturnNotes(''); }}
                              disabled={actionLoading === req.id}>
                              Return
                            </Button>
                          )}
                          {status === 'return_requested' && (
                            <Chip size="small" label="Return Pending" color="warning" variant="outlined" />
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                    {/* Expanded detail row */}
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0, px: 0 }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Request Items</Typography>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Item Name</TableCell>
                                  <TableCell align="right">Qty Requested</TableCell>
                                  <TableCell align="right">Qty Approved</TableCell>
                                  <TableCell align="right">Qty Disbursed</TableCell>
                                  <TableCell align="right">Qty Received</TableCell>
                                  <TableCell>Unit</TableCell>
                                  <TableCell>Notes</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {items.map((item: any) => (
                                  <TableRow key={item.id}>
                                    <TableCell>{item.inventory_items?.name ?? item.inventory_item_name ?? '—'}</TableCell>
                                    <TableCell align="right">{item.quantity_requested}</TableCell>
                                    <TableCell align="right">{item.quantity_approved ?? '—'}</TableCell>
                                    <TableCell align="right">{item.quantity_disbursed ?? '—'}</TableCell>
                                    <TableCell align="right">{item.quantity_received ?? '—'}</TableCell>
                                    <TableCell>{item.unit}</TableCell>
                                    <TableCell>{item.disbursement_notes ?? '—'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            <Stack direction="row" spacing={3} sx={{ mt: 1.5 }} flexWrap="wrap">
                              {req.approved_by_name && (
                                <Typography variant="caption" color="text.secondary">
                                  Responded by: <strong>{req.approved_by_name}</strong>
                                  {req.responded_at && ` at ${new Date(req.responded_at).toLocaleString()}`}
                                </Typography>
                              )}
                              {req.response_notes && (
                                <Typography variant="caption" color="text.secondary">
                                  Response notes: {req.response_notes}
                                </Typography>
                              )}
                              {req.disbursed_at && (
                                <Typography variant="caption" color="text.secondary">
                                  Disbursed: {new Date(req.disbursed_at).toLocaleString()}
                                </Typography>
                              )}
                              {req.received_at && (
                                <Typography variant="caption" color="text.secondary">
                                  Received: {new Date(req.received_at).toLocaleString()}
                                </Typography>
                              )}
                            </Stack>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {total > 0 && (
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}

      {/* Create/Edit Request Dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRequest ? 'Edit Request' : 'Request Items from Inventory'}</DialogTitle>
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
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {editingRequest ? 'Update' : 'Send Request'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Receive Dialog */}
      <Dialog open={!!receiveDialog} onClose={() => setReceiveDialog(null)} maxWidth="md" fullWidth>
        <DialogTitle>Receive Items</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Confirm the actual quantity received for each item.
          </Alert>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell align="right">Qty Disbursed</TableCell>
                <TableCell align="right" width={130}>Qty Received</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {receiveItems.map((item, idx) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name} <Typography variant="caption" color="text.secondary">({item.unit})</Typography></TableCell>
                  <TableCell align="right">{item.quantity_disbursed}</TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small" type="number" sx={{ width: 110 }}
                      value={item.quantity_received}
                      onChange={(e) => {
                        const updated = [...receiveItems];
                        updated[idx] = { ...updated[idx], quantity_received: e.target.value };
                        setReceiveItems(updated);
                      }}
                      inputProps={{ min: 0 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiveDialog(null)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleReceive} disabled={actionLoading === receiveDialog?.id}>
            Confirm Receipt
          </Button>
        </DialogActions>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={!!returnDialog} onClose={() => setReturnDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Request Return to Inventory</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Inventory team will review and accept or reject the return.
          </Typography>
          <TextField
            fullWidth label="Return Notes (optional)" multiline rows={2}
            value={returnNotes}
            onChange={(e) => setReturnNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnDialog(null)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleReturn} disabled={actionLoading === returnDialog}>
            Request Return
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Bar Internal Store Sub-Tab — bar's own stock (auto-stocked from received
   ingredient requests). Shows current stock, sales log, movement log.
   ═══════════════════════════════════════════════════════════════════════════ */

const BAR_INTERNAL_VIEW_TABS = ['Current Stock', 'Sales Log', 'Movement Log'] as const;

const BAR_MOVEMENT_TYPE_LABELS: Record<string, string> = {
  received: 'Received from Inventory',
  returned_to_inventory: 'Returned to Inventory',
  sale: 'Sale',
  cancel_sale: 'Cancelled Sale',
};

const BAR_MOVEMENT_TYPE_COLORS: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  received: 'success',
  returned_to_inventory: 'error',
  sale: 'warning',
  cancel_sale: 'info',
};

function BarInternalStoreSubTab({ branchId }: { branchId: string }) {
  const [view, setView] = useState(0);

  return (
    <Box>
      <ToggleButtonGroup
        size="small" value={view} exclusive
        onChange={(_, v) => { if (v !== null) setView(v); }}
        sx={{ mb: 2 }}
      >
        {BAR_INTERNAL_VIEW_TABS.map((label, i) => (
          <ToggleButton key={label} value={i}>{label}</ToggleButton>
        ))}
      </ToggleButtonGroup>
      {view === 0 && <BarStockView branchId={branchId} />}
      {view === 1 && <BarSalesView branchId={branchId} />}
      {view === 2 && <BarMovementsView branchId={branchId} />}
    </Box>
  );
}

/* ─── Current Stock View ─── */
function BarStockView({ branchId }: { branchId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');

  // Price edit dialog
  const [editDialog, setEditDialog] = useState<any>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const params: Record<string, string> = {
        page: String(page + 1),
        page_size: String(pageSize),
      };
      if (search) params.search = search;
      const data = await api<{ items: any[]; total: number }>('bar', 'internal-store', { params, branchId });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, search]);

  useEffect(() => { setLoading(true); fetchItems(); }, [fetchItems]);

  const openEdit = (item: any) => {
    setEditDialog(item);
    setEditPrice(String(item.selling_price ?? ''));
    setEditBarcode(item.barcode ?? '');
  };

  const handleEditSave = async () => {
    if (!editDialog) return;
    setEditSaving(true);
    try {
      await api('bar', 'internal-store-update-price', {
        body: {
          bar_store_item_id: editDialog.id,
          selling_price: editPrice ? Number(editPrice) : undefined,
          barcode: editBarcode || undefined,
        },
        branchId,
      });
      toast.success('Item updated');
      setEditDialog(null);
      fetchItems();
    } catch (err: any) { toast.error(err.message); }
    finally { setEditSaving(false); }
  };

  if (loading && items.length === 0) return <LinearProgress />;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search items…" sx={{ minWidth: 220 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <Typography variant="body2" color="text.secondary">{total} item{total !== 1 ? 's' : ''} in bar store</Typography>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {items.length === 0 && !loading ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No items in the bar internal store yet. Items are automatically added when ingredient requests are received from inventory.
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item Name</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell align="right">Selling Price</TableCell>
                <TableCell>Barcode</TableCell>
                <TableCell width={160}>Last Updated</TableCell>
                <TableCell width={100} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{item.item_name}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      fontWeight={600}
                      color={Number(item.quantity) <= 0 ? 'error.main' : Number(item.quantity) < 5 ? 'warning.main' : 'text.primary'}
                    >
                      {Number(item.quantity).toFixed(item.unit === 'pcs' ? 0 : 2)}
                    </Typography>
                  </TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={600} color="primary.main">
                      {item.selling_price ? formatCurrency(item.selling_price, 'USD') : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>{item.barcode ?? '—'}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(item.updated_at).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit Price / Barcode">
                      <IconButton size="small" onClick={() => openEdit(item)}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {total > 0 && (
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}

      {/* Edit Price / Barcode Dialog */}
      <Dialog open={!!editDialog} onClose={() => setEditDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit {editDialog?.item_name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth label="Selling Price" type="number" size="small"
              value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
              inputProps={{ min: 0, step: 0.01 }}
            />
            <TextField
              fullWidth label="Barcode" size="small"
              value={editBarcode} onChange={(e) => setEditBarcode(e.target.value)}
              placeholder="Scan or enter barcode"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ─── Sales Log View ─── */
function BarSalesView({ branchId }: { branchId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState('today');

  const fetchSales = useCallback(async () => {
    try {
      const data = await api<{ items: any[]; total: number }>('bar', 'internal-store-sales', {
        params: {
          page: String(page + 1),
          page_size: String(pageSize),
          date_range: dateRange,
        },
        branchId,
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, dateRange]);

  useEffect(() => { setLoading(true); fetchSales(); }, [fetchSales]);

  if (loading && items.length === 0) return <LinearProgress />;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <ToggleButtonGroup size="small" value={dateRange} exclusive onChange={(_, v) => { if (v) { setDateRange(v); setPage(0); } }}>
          {DATE_RANGE_OPTIONS.map((o) => <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>)}
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">{total} sale{total !== 1 ? 's' : ''}</Typography>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {items.length === 0 && !loading ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No sales found</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell>Sold By</TableCell>
                <TableCell width={160}>Date &amp; Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{s.bar_store_items?.item_name ?? '—'}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={600}>{Number(s.quantity).toFixed(2)}</Typography>
                  </TableCell>
                  <TableCell>{s.unit ?? s.bar_store_items?.unit ?? ''}</TableCell>
                  <TableCell>{s.sold_by_name}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{new Date(s.created_at).toLocaleDateString()}</Typography>
                    <Typography variant="caption" color="text.secondary">{new Date(s.created_at).toLocaleTimeString()}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {total > 0 && (
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}
    </Box>
  );
}

/* ─── Movement Log View ─── */
function BarMovementsView({ branchId }: { branchId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState('today');

  const fetchMovements = useCallback(async () => {
    try {
      const data = await api<{ items: any[]; total: number }>('bar', 'internal-store-movements', {
        params: {
          page: String(page + 1),
          page_size: String(pageSize),
          date_range: dateRange,
        },
        branchId,
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, dateRange]);

  useEffect(() => { setLoading(true); fetchMovements(); }, [fetchMovements]);

  if (loading && items.length === 0) return <LinearProgress />;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <ToggleButtonGroup size="small" value={dateRange} exclusive onChange={(_, v) => { if (v) { setDateRange(v); setPage(0); } }}>
          {DATE_RANGE_OPTIONS.map((o) => <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>)}
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">{total} movement{total !== 1 ? 's' : ''}</Typography>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {items.length === 0 && !loading ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No movements found</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell width={180}>Type</TableCell>
                <TableCell align="right">Change</TableCell>
                <TableCell align="right">Before</TableCell>
                <TableCell align="right">After</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell>By</TableCell>
                <TableCell width={160}>Date &amp; Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((m) => {
                const itemName = m.bar_store_items?.item_name ?? '—';
                const change = Number(m.quantity_change);
                const isPositive = change > 0;
                return (
                  <TableRow key={m.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{itemName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small" variant="outlined"
                        label={BAR_MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type?.replace(/_/g, ' ')}
                        color={BAR_MOVEMENT_TYPE_COLORS[m.movement_type] ?? 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography color={isPositive ? 'success.main' : 'error.main'} fontWeight={600}>
                        {isPositive ? '+' : ''}{change}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{Number(m.quantity_before).toFixed(2)}</TableCell>
                    <TableCell align="right">{Number(m.quantity_after).toFixed(2)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{m.notes ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{m.performed_by_name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{new Date(m.created_at).toLocaleDateString()}</Typography>
                      <Typography variant="caption" color="text.secondary">{new Date(m.created_at).toLocaleTimeString()}</Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {total > 0 && (
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}
    </Box>
  );
}
