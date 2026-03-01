import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Grid, Typography, Chip, TextField, Button, Divider,
  IconButton, Paper, Tabs, Tab, Badge, Select, MenuItem,
  FormControl, InputLabel, Dialog, DialogTitle, DialogContent,
  DialogActions, List, ListItem, ListItemButton, ListItemText,
  Checkbox, FormControlLabel, Stack, Avatar, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import PaymentIcon from '@mui/icons-material/Payment';
import PrintIcon from '@mui/icons-material/Print';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import toast from 'react-hot-toast';
import { formatCurrency, MEAL_AVAILABILITY_LABELS } from '@paxrest/shared-utils';
import type { MealAvailability } from '@paxrest/shared-types';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import { useRealtime, useApi } from '@/hooks';
import {
  useMenuStore, useCartStore, useAvailableMealsStore,
  type CartItem, type CartItemExtra, type CartItemRemovedIngredient,
} from '@/stores';
import type { MenuCategoryWithItems, MenuItemWithDetails } from '@paxrest/shared-types';
import BranchGuard from '@/components/BranchGuard';

export default function POSTerminalPage() {
  return <BranchGuard><POSTerminalContent /></BranchGuard>;
}

function POSTerminalContent() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const { categories, loading: menuLoading, fetchMenu } = useMenuStore();
  const { meals, fetchMeals } = useAvailableMealsStore();
  const cart = useCartStore();

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [customerDialog, setCustomerDialog] = useState(false);
  const [customizeDialog, setCustomizeDialog] = useState(false);
  const [customizeItem, setCustomizeItem] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMeals, setShowMeals] = useState(false);

  // Delivery assignment state
  const [deliveryZoneId, setDeliveryZoneId] = useState<string>('');
  const [deliveryRiderId, setDeliveryRiderId] = useState<string>('');
  const [deliveryAssignMode, setDeliveryAssignMode] = useState<'manual' | 'auto'>('auto');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  // Delivery customer contact fields
  const [deliveryCustomerName, setDeliveryCustomerName] = useState<string>('');
  const [deliveryCustomerPhone, setDeliveryCustomerPhone] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');

  const isDelivery = cart.orderType === 'delivery';

  // Load zones + riders only when delivery mode is active
  const { data: zonesData } = useApi<{ zones: any[] }>(
    'delivery', 'zones', {}, [isDelivery ? activeBranchId : null]
  );
  const { data: ridersData } = useApi<{ riders: any[] }>(
    'delivery', 'riders', {}, [isDelivery ? activeBranchId : null]
  );
  const deliveryZones = isDelivery ? (zonesData?.zones ?? []).filter((z: any) => z.is_active) : [];
  const availableRiders = isDelivery ? (ridersData?.riders ?? []).filter((r: any) => r.is_available && r.is_active) : [];
  const selectedZone = deliveryZones.find((z: any) => z.id === deliveryZoneId);
  const deliveryFee = isDelivery && selectedZone ? Number(selectedZone.delivery_fee) : 0;

  // Reset delivery fields when order type changes
  const handleOrderTypeChange = (t: typeof cart.orderType) => {
    cart.setOrderType(t);
    if (t !== 'delivery') {
      setDeliveryZoneId('');
      setDeliveryRiderId('');
      setDeliveryAssignMode('auto');
      setDeliveryNotes('');
      setDeliveryCustomerName('');
      setDeliveryCustomerPhone('');
      setDeliveryAddress('');
    }
  };

  // Awaiting payment orders (from bar/kitchen departments)
  const [awaitingPaymentDialog, setAwaitingPaymentDialog] = useState(false);
  const [awaitingOrders, setAwaitingOrders] = useState<any[]>([]);
  const [awaitingLoading, setAwaitingLoading] = useState(false);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [awaitingDetailDialog, setAwaitingDetailDialog] = useState(false);
  const [awaitingDetailOrder, setAwaitingDetailOrder] = useState<any>(null);
  const [awaitingDetailLoading, setAwaitingDetailLoading] = useState(false);
  const [checkoutProcessing, setCheckoutProcessing] = useState<string | null>(null);

  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const fmt = (n: number) => formatCurrency(n, currency);

  useEffect(() => {
    if (activeBranchId) {
      fetchMenu(activeBranchId);
      fetchMeals(activeBranchId);
    }
  }, [activeBranchId]);

  // Refresh available meals on realtime changes
  useRealtime('available_meals', activeBranchId ? { column: 'branch_id', value: activeBranchId } : undefined, () => {
    if (activeBranchId) fetchMeals(activeBranchId);
  });

  // Fetch awaiting payment orders count on mount + realtime
  const fetchAwaitingCount = useCallback(async () => {
    if (!activeBranchId) return;
    try {
      const data = await api<{ orders: any[]; total: number }>('orders', 'list', {
        params: { status: 'awaiting_payment', page: '1', page_size: '1' },
        branchId: activeBranchId,
      });
      setAwaitingCount(data.total ?? 0);
    } catch { /* ignore */ }
  }, [activeBranchId]);

  useEffect(() => { fetchAwaitingCount(); }, [fetchAwaitingCount]);
  useRealtime('orders', activeBranchId ? { column: 'branch_id', value: activeBranchId } : undefined, () => fetchAwaitingCount());

  const openAwaitingPayment = async () => {
    setAwaitingPaymentDialog(true);
    setAwaitingLoading(true);
    try {
      const data = await api<{ orders: any[]; total: number }>('orders', 'list', {
        params: { status: 'awaiting_payment', page: '1', page_size: '50' },
        branchId: activeBranchId ?? undefined,
      });
      setAwaitingOrders(data.orders ?? []);
    } catch (err: any) { toast.error(err.message); }
    finally { setAwaitingLoading(false); }
  };

  const openAwaitingDetail = async (orderId: string) => {
    setAwaitingDetailDialog(true);
    setAwaitingDetailLoading(true);
    setAwaitingDetailOrder(null);
    try {
      const data = await api<{ order: any }>('orders', 'get', {
        params: { id: orderId },
        branchId: activeBranchId ?? undefined,
      });
      setAwaitingDetailOrder(data.order);
    } catch (err: any) {
      toast.error(err.message);
      setAwaitingDetailDialog(false);
    } finally {
      setAwaitingDetailLoading(false);
    }
  };

  const handleCheckout = async (orderId: string, method: string) => {
    setCheckoutProcessing(orderId);
    try {
      // Find order total
      const order = awaitingOrders.find((o) => o.id === orderId);
      const total = order?.total ?? 0;

      // Add payment
      await api('orders', 'add-payment', {
        body: { order_id: orderId, method, amount: total },
        branchId: activeBranchId ?? undefined,
      });

      // Update order status to completed
      await api('orders', 'update-status', {
        body: { order_id: orderId, status: 'completed' },
        branchId: activeBranchId ?? undefined,
      });

      toast.success('Payment processed — order completed!');
      setAwaitingOrders((prev) => prev.filter((o) => o.id !== orderId));
      setAwaitingCount((c) => Math.max(0, c - 1));
      setAwaitingDetailDialog(false);
    } catch (err: any) { toast.error(err.message); }
    finally { setCheckoutProcessing(null); }
  };

  useEffect(() => {
    if (categories.length && !activeCat) setActiveCat(categories[0].id);
  }, [categories]);

  // Create a map of available meal counts by menu_item_id
  const mealCountMap = new Map<string, number>();
  meals.forEach((m) => { mealCountMap.set(m.menu_item_id, (mealCountMap.get(m.menu_item_id) ?? 0) + m.quantity_available); });

  // Filter items
  const activeCategory = categories.find((c) => c.id === activeCat);
  const allItems = categories.flatMap((c) => c.items ?? []);
  const displayItems = search
    ? allItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : activeCategory?.items ?? [];

  const handleAddItem = (item: MenuItemWithDetails) => {
    if (item.availability_status === 'sold_out') {
      toast.error('This item is sold out');
      return;
    }

    // If item has ingredients or extras, open customization dialog
    if ((item.ingredients?.length ?? 0) > 0 || (item.extras?.length ?? 0) > 0) {
      setCustomizeItem(item);
      setCustomizeDialog(true);
      return;
    }

    // Simple add
    const variant = item.variants?.[0];
    cart.addItem({
      menuItemId: item.id,
      variantId: variant?.id,
      name: item.name,
      variantName: variant?.name,
      basePrice: variant ? item.base_price + (variant.price_adjustment ?? 0) : item.base_price,
      modifiers: [],
    });
  };

  const handleAddMeal = (meal: any) => {
    if (meal.quantity_available <= 0) {
      toast.error('No meals available');
      return;
    }
    const name = meal.menu_item_name ?? meal.menu_items?.name ?? 'Meal';
    const price = meal.menu_items?.base_price ?? 0;
    cart.addItem({
      menuItemId: meal.menu_item_id,
      name,
      basePrice: price,
      modifiers: [],
    });
    toast.success(`Added ${name}`);
  };

  const handleSubmitOrder = async () => {
    if (cart.items.length === 0) return toast.error('Cart is empty');
    setSubmitting(true);
    try {
      const items = cart.items.map((ci) => ({
        menu_item_id: ci.menuItemId,
        variant_id: ci.variantId,
        quantity: ci.quantity,
        unit_price: ci.basePrice,
        modifiers: ci.modifiers.map((m) => ({ modifier_id: m.id, name: m.name, price: m.price })),
        notes: ci.notes,
        removed_ingredients: ci.removedIngredients?.map((r) => ({ ingredient_id: r.ingredient_id, name: r.name, cost_contribution: r.cost_contribution })),
        selected_extras: ci.selectedExtras?.map((e) => ({ extra_id: e.id, name: e.name, price: e.price })),
        extras_total: (ci.selectedExtras ?? []).reduce((s, e) => s + e.price, 0),
        ingredients_discount: (ci.removedIngredients ?? []).reduce((s, r) => s + r.cost_contribution, 0),
      }));

      const orderRes = await api<{ order: any }>('orders', 'create', {
        body: {
          order_type: cart.orderType,
          table_id: cart.tableId,
          customer_id: cart.customerId,
          customer_name: cart.customerName,
          notes: cart.notes,
          discount_percent: cart.discountPercent,
          redeem_points: cart.redeemPoints,
          items,
        },
        branchId: activeBranchId ?? undefined,
      });

      // For delivery orders: create the delivery record immediately
      if (cart.orderType === 'delivery' && orderRes?.order?.id) {
        try {
          await api('delivery', 'assign', {
            method: 'POST',
            body: {
              order_id: orderRes.order.id,
              rider_id: deliveryAssignMode === 'manual' && deliveryRiderId ? deliveryRiderId : null,
              auto_assign: deliveryAssignMode === 'auto',
              delivery_zone_id: deliveryZoneId || null,
              notes: deliveryNotes || null,
              customer_name: deliveryCustomerName || null,
              customer_phone: deliveryCustomerPhone || null,
              delivery_address: deliveryAddress || null,
            },
            branchId: activeBranchId ?? undefined,
          });
        } catch (deliveryErr: any) {
          // Order is placed — don't block; show a warning
          toast(deliveryErr.message?.includes('No available') 
            ? 'Order placed — no riders available, assign manually from Delivery page'
            : `Order placed — delivery assignment pending: ${deliveryErr.message}`);
        }
      }

      toast.success('Order placed!');
      setDeliveryZoneId('');
      setDeliveryRiderId('');
      setDeliveryAssignMode('auto');
      setDeliveryNotes('');
      setDeliveryCustomerName('');
      setDeliveryCustomerPhone('');
      setDeliveryAddress('');
      cart.clearCart();
      // Refresh meals in case available counts changed
      if (activeBranchId) fetchMeals(activeBranchId);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 80px)' }}>
      {/* ── Left: Menu ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Search + Available Meals toggle */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField
            size="small" fullWidth placeholder="Search menu…"
            value={search} onChange={(e) => { setSearch(e.target.value); setShowMeals(false); }}
            slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          />
          {meals.length > 0 && (
            <Tooltip title="Show available meals from kitchen">
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
            </Tooltip>
          )}
          {awaitingCount > 0 && (
            <Tooltip title="Orders awaiting payment from Bar / Kitchen">
              <Button
                variant="outlined"
                color="warning"
                onClick={openAwaitingPayment}
                startIcon={<PaymentIcon />}
                sx={{ flexShrink: 0 }}
              >
                <Badge badgeContent={awaitingCount} color="error" max={99}>
                  Awaiting
                </Badge>
              </Button>
            </Tooltip>
          )}
        </Box>

        {/* Category Tabs (hidden when showing meals or searching) */}
        {!search && !showMeals && (
          <Tabs
            value={activeCat ?? false}
            onChange={(_, v) => setActiveCat(v)}
            variant="scrollable" scrollButtons="auto"
            sx={{ mb: 1.5, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
          >
            {categories.map((c) => (
              <Tab key={c.id} value={c.id} label={c.name} />
            ))}
          </Tabs>
        )}

        {/* Item Grid or Available Meals */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {showMeals ? (
            /* ── Available Meals Grid ── */
            <Grid container spacing={1.5}>
              {meals.filter((m) => m.quantity_available > 0).map((meal) => (
                <Grid size={{ xs: 6, sm: 4, md: 3 }} key={meal.id}>
                  <Paper
                    onClick={() => handleAddMeal(meal)}
                    sx={{
                      p: 1.5, cursor: 'pointer', textAlign: 'center',
                      '&:hover': { boxShadow: 3, borderColor: 'success.main' },
                      transition: 'all 0.15s',
                      border: '2px solid', borderColor: 'success.light',
                      borderRadius: 2, position: 'relative',
                    }}
                  >
                    {meal.menu_items?.media_url && (
                      <Avatar
                        src={meal.menu_items.media_url}
                        variant="rounded"
                        sx={{ width: 60, height: 60, mx: 'auto', mb: 1 }}
                      />
                    )}
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {meal.menu_item_name ?? meal.menu_items?.name ?? '—'}
                    </Typography>
                    <Typography variant="body2" color="primary" fontWeight={700}>
                      {fmt(meal.menu_items?.base_price ?? 0)}
                    </Typography>
                    <Chip
                      size="small" label={`${meal.quantity_available} ready`}
                      color="success" variant="filled"
                      sx={{ mt: 0.5 }}
                    />
                  </Paper>
                </Grid>
              ))}
              {meals.filter((m) => m.quantity_available > 0).length === 0 && (
                <Grid size={12}>
                  <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                    No meals available from kitchen
                  </Typography>
                </Grid>
              )}
            </Grid>
          ) : (
            /* ── Regular Menu Grid ── */
            <Grid container spacing={1.5}>
              {displayItems.map((item) => {
                const firstVariant = item.variants?.[0];
                const price = firstVariant ? item.base_price + (firstVariant.price_adjustment ?? 0) : item.base_price;
                const avail = (item as any).availability_status ?? 'available';
                const mealCount = mealCountMap.get(item.id) ?? 0;
                const isSoldOut = avail === 'sold_out';

                return (
                  <Grid size={{ xs: 6, sm: 4, md: 3 }} key={item.id}>
                    <Paper
                      onClick={() => !isSoldOut && handleAddItem(item as MenuItemWithDetails)}
                      sx={{
                        p: 1.5, cursor: isSoldOut ? 'not-allowed' : 'pointer', textAlign: 'center',
                        opacity: isSoldOut ? 0.4 : 1,
                        '&:hover': isSoldOut ? {} : { boxShadow: 3, borderColor: 'primary.main' },
                        transition: 'all 0.15s',
                        border: '1px solid', borderColor: 'divider',
                        borderRadius: 2, position: 'relative',
                      }}
                    >
                      {/* Availability badge */}
                      {isSoldOut && (
                        <Chip
                          label="SOLD OUT" color="error" size="small"
                          sx={{ position: 'absolute', top: 4, right: 4, fontSize: '0.65rem' }}
                        />
                      )}
                      {avail === 'limited' && (
                        <Chip
                          label="LIMITED" color="warning" size="small"
                          sx={{ position: 'absolute', top: 4, right: 4, fontSize: '0.65rem' }}
                        />
                      )}
                      {/* Meal count badge */}
                      {mealCount > 0 && !isSoldOut && (
                        <Chip
                          label={`${mealCount} ready`} color="success" size="small"
                          sx={{ position: 'absolute', top: 4, left: 4, fontSize: '0.65rem' }}
                        />
                      )}

                      {item.image_url && (
                        <Box
                          component="img" src={item.image_url} alt={item.name}
                          sx={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 1, mb: 1 }}
                        />
                      )}
                      {(item as any).media_url && !item.image_url && (
                        <Box
                          component="img" src={(item as any).media_url} alt={item.name}
                          sx={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 1, mb: 1 }}
                        />
                      )}
                      <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                      <Typography variant="body2" color="primary" fontWeight={700}>{fmt(price)}</Typography>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      </Box>

      {/* ── Right: Cart ── */}
      <Paper sx={{
        width: 360, display: 'flex', flexDirection: 'column',
        borderRadius: 2, p: 2, flexShrink: 0,
      }}>
        {/* Order type */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          {(['dine_in', 'takeaway', 'delivery', 'pickup'] as const).map((t) => (
            <Chip
              key={t}
              label={t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              color={cart.orderType === t ? 'primary' : 'default'}
              variant={cart.orderType === t ? 'filled' : 'outlined'}
              onClick={() => handleOrderTypeChange(t)}
              size="small"
            />
          ))}
        </Box>

        {/* Delivery Details — shown only when order type is delivery */}
        {isDelivery && (
          <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'warning.main', borderRadius: 1, bgcolor: 'warning.50' }}>
            <Typography variant="caption" fontWeight={700} color="warning.dark" display="block" sx={{ mb: 1 }}>Delivery Details</Typography>

            {/* Zone selector */}
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
              <InputLabel>Delivery Zone</InputLabel>
              <Select label="Delivery Zone" value={deliveryZoneId} onChange={(e) => setDeliveryZoneId(e.target.value)}>
                <MenuItem value=""><em>No zone</em></MenuItem>
                {deliveryZones.map((z: any) => (
                  <MenuItem key={z.id} value={z.id}>{z.name} (+{fmt(Number(z.delivery_fee))})</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Assignment mode */}
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              {(['auto', 'manual'] as const).map((m) => (
                <Chip
                  key={m}
                  size="small"
                  label={m === 'auto' ? 'Auto-assign' : 'Manual'}
                  color={deliveryAssignMode === m ? 'primary' : 'default'}
                  variant={deliveryAssignMode === m ? 'filled' : 'outlined'}
                  onClick={() => { setDeliveryAssignMode(m); if (m === 'auto') setDeliveryRiderId(''); }}
                />
              ))}
            </Box>

            {/* Manual rider selection */}
            {deliveryAssignMode === 'manual' && (
              <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel>Assign Rider</InputLabel>
                <Select label="Assign Rider" value={deliveryRiderId} onChange={(e) => setDeliveryRiderId(e.target.value)}>
                  <MenuItem value=""><em>Select rider</em></MenuItem>
                  {availableRiders.map((r: any) => (
                    <MenuItem key={r.id} value={r.id}>{r.name} ({r.vehicle_type})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {deliveryAssignMode === 'manual' && availableRiders.length === 0 && (
              <Typography variant="caption" color="warning.dark">No available riders — switch to Auto or assign later</Typography>
            )}

            {/* Customer contact info — required for delivery */}
            <TextField
              fullWidth size="small" label="Customer Name *" placeholder="Customer name"
              value={deliveryCustomerName} onChange={(e) => setDeliveryCustomerName(e.target.value)}
              sx={{ mb: 1 }}
            />
            <TextField
              fullWidth size="small" label="Contact Number *" placeholder="Phone number"
              value={deliveryCustomerPhone} onChange={(e) => setDeliveryCustomerPhone(e.target.value)}
              sx={{ mb: 1 }}
            />
            <TextField
              fullWidth size="small" label="Delivery Address *" placeholder="Delivery address"
              value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
              sx={{ mb: 1 }}
            />
            {/* Delivery notes */}
            <TextField
              fullWidth size="small" placeholder="Delivery notes (optional)"
              value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)}
            />
          </Box>
        )}

        {/* Customer */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
          <Button
            size="small" variant="outlined" startIcon={<PersonIcon />}
            onClick={() => setCustomerDialog(true)}
            sx={{ flex: 1 }}
          >
            {cart.customerName ?? 'Add Customer'}
          </Button>
          {cart.customerId && (
            <IconButton size="small" onClick={() => cart.setCustomer(null, null, null)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        <Divider sx={{ mb: 1 }} />

        {/* Cart items */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {cart.items.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              Tap menu items to add
            </Typography>
          ) : (
            cart.items.map((item, i) => {
              const extrasTotal = (item.selectedExtras ?? []).reduce((s, e) => s + e.price, 0);
              const ingredientsDiscount = (item.removedIngredients ?? []).reduce((s, r) => s + r.cost_contribution, 0);
              const linePrice = (item.basePrice + item.modifiers.reduce((s, m) => s + m.price, 0) + extrasTotal - ingredientsDiscount) * item.quantity;

              return (
                <Box key={i} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {item.name}{item.variantName ? ` (${item.variantName})` : ''}
                      </Typography>
                      {item.modifiers.length > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {item.modifiers.map((m) => m.name).join(', ')}
                        </Typography>
                      )}
                      {(item.removedIngredients?.length ?? 0) > 0 && (
                        <Typography variant="caption" color="error" display="block">
                          Remove: {item.removedIngredients!.map((r) => r.name).join(', ')}
                          {ingredientsDiscount > 0 && ` (−${fmt(ingredientsDiscount)})`}
                        </Typography>
                      )}
                      {(item.selectedExtras?.length ?? 0) > 0 && (
                        <Typography variant="caption" color="success.main" display="block">
                          Extras: {item.selectedExtras!.map((e) => `${e.name} +${fmt(e.price)}`).join(', ')}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="body2" fontWeight={600}>{fmt(linePrice)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <IconButton size="small" onClick={() => cart.updateQuantity(item.menuItemId, item.quantity - 1, item.variantId)}>
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                    <Typography variant="body2" sx={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</Typography>
                    <IconButton size="small" onClick={() => cart.updateQuantity(item.menuItemId, item.quantity + 1, item.variantId)}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                    <Box sx={{ flex: 1 }} />
                    <IconButton size="small" color="error" onClick={() => cart.removeItem(item.menuItemId, item.variantId)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>

        {/* Totals */}
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2">Subtotal</Typography>
          <Typography variant="body2">{fmt(cart.subtotal())}</Typography>
        </Box>
        {cart.discountPercent > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="error">Discount ({cart.discountPercent}%)</Typography>
            <Typography variant="body2" color="error">-{fmt(cart.subtotal() * cart.discountPercent / 100)}</Typography>
          </Box>
        )}
        {deliveryFee > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="info.main">Delivery Fee ({selectedZone?.name})</Typography>
            <Typography variant="body2" color="info.main">+{fmt(deliveryFee)}</Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" fontWeight={700}>Total</Typography>
          <Typography variant="h6" fontWeight={700} color="primary">{fmt(cart.total() + deliveryFee)}</Typography>
        </Box>

        {/* Notes + discount */}
        <TextField
          size="small" fullWidth placeholder="Order notes…" multiline maxRows={2}
          value={cart.notes} onChange={(e) => cart.setNotes(e.target.value)}
          sx={{ mb: 1 }}
        />
        <TextField
          size="small" fullWidth placeholder="Discount %" type="number"
          value={cart.discountPercent || ''}
          onChange={(e) => cart.setDiscount(Number(e.target.value))}
          sx={{ mb: 2 }}
        />

        {/* Submit */}
        <Button
          fullWidth variant="contained" size="large" disabled={submitting || cart.items.length === 0}
          onClick={handleSubmitOrder}
        >
          {submitting ? 'Placing Order…' : `Place Order — ${fmt(cart.total() + deliveryFee)}`}
        </Button>
      </Paper>

      {/* Customer search dialog */}
      <CustomerSearchDialog open={customerDialog} onClose={() => setCustomerDialog(false)} />

      {/* Awaiting Payment Orders Dialog */}
      <Dialog open={awaitingPaymentDialog} onClose={() => setAwaitingPaymentDialog(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <PaymentIcon color="warning" />
            <Typography variant="h6">Orders Awaiting Payment</Typography>
          </Stack>
          <IconButton onClick={() => setAwaitingPaymentDialog(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {awaitingLoading ? (
            <LinearProgress />
          ) : awaitingOrders.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No orders awaiting payment
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Order #</TableCell>
                    <TableCell>Items</TableCell>
                    <TableCell>Department</TableCell>
                    <TableCell>Created By</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Served At</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell width={240} align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {awaitingOrders.map((order) => (
                    <TableRow key={order.id} hover>
                      <TableCell>
                        <Typography fontWeight={700}>#{order.order_number}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {(order.order_items ?? []).map((i: any) => `${i.quantity}× ${i.menu_item_name}`).join(', ') || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={order.department ?? order.source ?? 'pos'} color={
                          order.department === 'bar' ? 'primary' : order.department === 'kitchen' ? 'warning' : 'default'
                        } variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{order.created_by_name ?? '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{order.customer_name ?? '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{order.served_at ? new Date(order.served_at).toLocaleString() : '—'}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={700}>{fmt(order.total)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Button size="small" variant="outlined" onClick={() => openAwaitingDetail(order.id)}>
                            Details
                          </Button>
                          <Button
                            size="small" variant="contained" color="success"
                            disabled={checkoutProcessing === order.id}
                            onClick={() => handleCheckout(order.id, 'cash')}
                          >
                            {checkoutProcessing === order.id ? '…' : 'Cash'}
                          </Button>
                          <Button
                            size="small" variant="contained" color="primary"
                            disabled={checkoutProcessing === order.id}
                            onClick={() => handleCheckout(order.id, 'card')}
                          >
                            {checkoutProcessing === order.id ? '…' : 'Card'}
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>

      {/* Awaiting Payment Detail Dialog (printable + PDF) */}
      <Dialog open={awaitingDetailDialog} onClose={() => setAwaitingDetailDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Order #{awaitingDetailOrder?.order_number ?? ''}</Typography>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Print">
              <IconButton onClick={() => {
                const el = document.getElementById('pos-awaiting-detail-print');
                if (!el) return;
                const w = window.open('', '_blank', 'width=800,height=600');
                if (!w) return;
                w.document.write(`<html><head><title>Order #${awaitingDetailOrder?.order_number ?? ''}</title>
                  <style>body{font-family:Arial,sans-serif;padding:20px}
                  table{border-collapse:collapse;width:100%;margin-top:10px}
                  th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
                  th{background:#f5f5f5}
                  .total{font-size:18px;font-weight:bold;margin-top:12px}
                  </style></head><body>${el.innerHTML}</body></html>`);
                w.document.close(); w.focus(); w.print(); w.close();
              }} disabled={awaitingDetailLoading}><PrintIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Download PDF">
              <IconButton onClick={() => {
                const el = document.getElementById('pos-awaiting-detail-print');
                if (!el) return;
                const w = window.open('', '_blank', 'width=800,height=600');
                if (!w) return;
                w.document.write(`<html><head><title>Order #${awaitingDetailOrder?.order_number ?? ''}</title>
                  <style>body{font-family:Arial,sans-serif;padding:20px}
                  table{border-collapse:collapse;width:100%;margin-top:10px}
                  th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
                  th{background:#f5f5f5}
                  </style></head><body>${el.innerHTML}</body></html>`);
                w.document.close(); w.focus(); w.print(); w.close();
              }} disabled={awaitingDetailLoading}><PictureAsPdfIcon /></IconButton>
            </Tooltip>
            <IconButton onClick={() => setAwaitingDetailDialog(false)}><CloseIcon /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {awaitingDetailLoading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
          ) : awaitingDetailOrder ? (
            <Box id="pos-awaiting-detail-print">
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="body2"><strong>Order #:</strong> {awaitingDetailOrder.order_number}</Typography>
                  <Typography variant="body2"><strong>Status:</strong> {awaitingDetailOrder.status?.replace(/_/g, ' ')}</Typography>
                  <Typography variant="body2"><strong>Type:</strong> {awaitingDetailOrder.order_type?.replace(/_/g, ' ')}</Typography>
                  <Typography variant="body2"><strong>Department:</strong> {awaitingDetailOrder.department ?? '—'}</Typography>
                  <Typography variant="body2"><strong>Source:</strong> {awaitingDetailOrder.source ?? '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="body2"><strong>Created By:</strong> {awaitingDetailOrder.created_by_name ?? '—'}</Typography>
                  <Typography variant="body2"><strong>Created:</strong> {new Date(awaitingDetailOrder.created_at).toLocaleString()}</Typography>
                  {awaitingDetailOrder.served_at && (
                    <Typography variant="body2"><strong>Served:</strong> {new Date(awaitingDetailOrder.served_at).toLocaleString()}</Typography>
                  )}
                  {awaitingDetailOrder.customer_name && (
                    <Typography variant="body2"><strong>Customer:</strong> {awaitingDetailOrder.customer_name}</Typography>
                  )}
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />
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
                    {(awaitingDetailOrder.order_items ?? []).map((item: any) => (
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
                {awaitingDetailOrder.discount_amount > 0 && (
                  <Typography variant="body1" color="error.main">
                    Discount: -{fmt(awaitingDetailOrder.discount_amount)}
                  </Typography>
                )}
                <Typography variant="h6" fontWeight={700}>Total: {fmt(awaitingDetailOrder.total)}</Typography>
              </Stack>

              {awaitingDetailOrder.notes && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body2"><strong>Notes:</strong> {awaitingDetailOrder.notes}</Typography>
                </>
              )}

              {(awaitingDetailOrder.order_payments ?? []).length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Payments</Typography>
                  {awaitingDetailOrder.order_payments.map((p: any) => (
                    <Typography key={p.id} variant="body2">
                      {p.method}: {fmt(p.amount)} — {new Date(p.created_at).toLocaleString()}
                    </Typography>
                  ))}
                </>
              )}

              {(awaitingDetailOrder.order_status_history ?? []).length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Status History</Typography>
                  {awaitingDetailOrder.order_status_history.map((h: any) => (
                    <Typography key={h.id} variant="body2">
                      {h.old_status} → {h.new_status} — by {h.changed_by_name ?? '—'} · {new Date(h.created_at).toLocaleString()}
                      {h.notes && ` (${h.notes})`}
                    </Typography>
                  ))}
                </>
              )}
            </Box>
          ) : (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No data</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAwaitingDetailDialog(false)}>Close</Button>
          <Button variant="outlined" startIcon={<PrintIcon />} disabled={!awaitingDetailOrder} onClick={() => {
            const el = document.getElementById('pos-awaiting-detail-print');
            if (!el) return;
            const w = window.open('', '_blank', 'width=800,height=600');
            if (!w) return;
            w.document.write(`<html><head><title>Order</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}th{background:#f5f5f5}</style></head><body>${el.innerHTML}</body></html>`);
            w.document.close(); w.focus(); w.print(); w.close();
          }}>Print</Button>
          {awaitingDetailOrder && (
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained" color="success"
                disabled={checkoutProcessing === awaitingDetailOrder.id}
                onClick={() => handleCheckout(awaitingDetailOrder.id, 'cash')}
              >
                Pay Cash — {fmt(awaitingDetailOrder.total)}
              </Button>
              <Button
                variant="contained" color="primary"
                disabled={checkoutProcessing === awaitingDetailOrder.id}
                onClick={() => handleCheckout(awaitingDetailOrder.id, 'card')}
              >
                Pay Card — {fmt(awaitingDetailOrder.total)}
              </Button>
            </Stack>
          )}
        </DialogActions>
      </Dialog>

      {/* Customize item dialog (ingredients & extras) */}
      {customizeItem && (
        <CustomizeItemDialog
          open={customizeDialog}
          item={customizeItem}
          currency={currency}
          onClose={() => { setCustomizeDialog(false); setCustomizeItem(null); }}
          onAdd={(removedIngredients, selectedExtras) => {
            const variant = customizeItem.variants?.[0];
            cart.addItem({
              menuItemId: customizeItem.id,
              variantId: variant?.id,
              name: customizeItem.name,
              variantName: variant?.name,
              basePrice: variant ? customizeItem.base_price + (variant.price_adjustment ?? 0) : customizeItem.base_price,
              modifiers: [],
              removedIngredients,
              selectedExtras,
            });
            setCustomizeDialog(false);
            setCustomizeItem(null);
          }}
        />
      )}
    </Box>
  );
}

/* ─── Customize Item Dialog (remove ingredients + add extras) ─── */
function CustomizeItemDialog({
  open, item, currency, onClose, onAdd,
}: {
  open: boolean;
  item: any;
  currency: string;
  onClose: () => void;
  onAdd: (removed: CartItemRemovedIngredient[], extras: CartItemExtra[]) => void;
}) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [extraIds, setExtraIds] = useState<Set<string>>(new Set());

  const ingredients: any[] = item.ingredients ?? [];
  const extras: any[] = item.extras ?? [];

  const toggleIngredient = (id: string) => {
    const next = new Set(removedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setRemovedIds(next);
  };

  const toggleExtra = (id: string) => {
    const next = new Set(extraIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setExtraIds(next);
  };

  const handleAdd = () => {
    const removed = ingredients
      .filter((i: any) => removedIds.has(i.id))
      .map((i: any) => ({ ingredient_id: i.id, name: i.name || i.inventory_item_name, cost_contribution: i.cost_contribution ?? 0 }));
    const selected = extras
      .filter((e: any) => extraIds.has(e.id))
      .map((e: any) => ({ id: e.id, name: e.name, price: e.price }));
    onAdd(removed, selected);
  };

  const totalDiscount = ingredients.filter((i: any) => removedIds.has(i.id)).reduce((s: number, i: any) => s + (i.cost_contribution ?? 0), 0);
  const totalExtras = extras.filter((e: any) => extraIds.has(e.id)).reduce((s: number, e: any) => s + e.price, 0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Customize: {item.name}</DialogTitle>
      <DialogContent>
        {ingredients.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Ingredients (uncheck to remove)</Typography>
            {ingredients.map((ing: any) => (
              <FormControlLabel
                key={ing.id}
                control={<Checkbox checked={!removedIds.has(ing.id)} onChange={() => toggleIngredient(ing.id)} />}
                label={
                  <Typography variant="body2">
                    {ing.name || ing.inventory_item_name}
                    {(ing.cost_contribution ?? 0) > 0 && (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {' '}(−{formatCurrency(ing.cost_contribution, currency)} if removed)
                      </Typography>
                    )}
                  </Typography>
                }
                sx={{ display: 'block' }}
              />
            ))}
            {totalDiscount > 0 && (
              <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                Savings: −{formatCurrency(totalDiscount, currency)}
              </Typography>
            )}
          </>
        )}

        {extras.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Extras</Typography>
            {extras.map((ext: any) => (
              <FormControlLabel
                key={ext.id}
                control={<Checkbox checked={extraIds.has(ext.id)} onChange={() => toggleExtra(ext.id)} />}
                label={
                  <Typography variant="body2">
                    {ext.name}
                    <Typography component="span" variant="caption" color="success.main"> +{formatCurrency(ext.price, currency)}</Typography>
                  </Typography>
                }
                sx={{ display: 'block' }}
              />
            ))}
            {totalExtras > 0 && (
              <Typography variant="body2" color="success.main" sx={{ mt: 0.5 }}>
                Extras total: +{formatCurrency(totalExtras, currency)}
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAdd}>Add to Cart</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ─── Customer Search Dialog ─── */
function CustomerSearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cart = useCartStore();
  const { activeBranchId } = useAuth();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const data = await api<{ items: any[] }>('loyalty', 'customers', {
        params: { search, page: '1', page_size: '10' },
        branchId: activeBranchId ?? undefined,
      });
      setResults(data.items ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Find Customer</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 2, mt: 1 }}>
          <TextField
            size="small" fullWidth placeholder="Name or phone…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="contained" onClick={handleSearch} disabled={loading}>Search</Button>
        </Box>
        <List>
          {results.map((c) => (
            <ListItem key={c.id} disablePadding>
              <ListItemButton onClick={() => {
                cart.setCustomer(c.id, c.name, c.phone);
                onClose();
              }}>
                <ListItemText primary={c.name} secondary={`${c.phone ?? ''} • ${c.loyalty_points ?? 0} pts`} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
