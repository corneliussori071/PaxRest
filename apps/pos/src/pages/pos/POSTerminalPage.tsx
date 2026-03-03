import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Grid, Typography, Chip, TextField, Button, Divider,
  IconButton, Paper, Tabs, Tab, Badge, Select, MenuItem,
  FormControl, InputLabel, Dialog, DialogTitle, DialogContent,
  DialogActions, List, ListItem, ListItemButton, ListItemText,
  Checkbox, FormControlLabel, Stack, Avatar, Tooltip, Alert,
  Card, CardContent, LinearProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import PaymentIcon from '@mui/icons-material/Payment';
import CloseIcon from '@mui/icons-material/Close';
import HotelIcon from '@mui/icons-material/Hotel';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import SpaIcon from '@mui/icons-material/Spa';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import InventoryIcon from '@mui/icons-material/Inventory';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import PeopleIcon from '@mui/icons-material/People';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import VisibilityIcon from '@mui/icons-material/Visibility';

import toast from 'react-hot-toast';
import { formatCurrency, MEAL_AVAILABILITY_LABELS, AVAILABLE_MEAL_STATUS_LABELS, AVAILABLE_MEAL_STATUS_COLORS } from '@paxrest/shared-utils';
import type { MealAvailability, AvailableMealStatus } from '@paxrest/shared-types';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import { useRealtime, useApi } from '@/hooks';
import {
  useMenuStore, useCartStore, useAvailableMealsStore,
  type CartItem, type CartItemExtra, type CartItemRemovedIngredient,
} from '@/stores';
import type { MenuCategoryWithItems, MenuItemWithDetails } from '@paxrest/shared-types';
import BranchGuard from '@/components/BranchGuard';
import PaymentDialog from '@/components/PaymentDialog';
import { OrderDetailDialog, OrdersGrid } from '@/components/OrderComponents';

export default function POSTerminalPage() {
  return <BranchGuard><POSTerminalContent /></BranchGuard>;
}

/* ─── Type for room & bar cart items ─── */
interface RoomBarCartItem {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  source: 'room' | 'bar_store' | 'other_service';
  room_id?: string;
  bar_store_item_id?: string;
  other_service_id?: string;
  max_qty?: number;
  booking_details?: {
    num_people: number;
    check_in: string;
    check_out?: string;
    duration_count: number;
    duration_unit: string;
  };
}

function POSTerminalContent() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const { categories, loading: menuLoading, fetchMenu } = useMenuStore();
  const { meals, fetchMeals } = useAvailableMealsStore();
  const cart = useCartStore();

  // ── Top-level tab: 0 = New Order, 1 = Manage Orders ──
  const [topTab, setTopTab] = useState(0);

  // ── New Order sub-tab: 0 = Meals (menu), 1 = Rooms, 2 = Bar, 3 = Services ──
  const [newOrderSubTab, setNewOrderSubTab] = useState(0);

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [customerDialog, setCustomerDialog] = useState(false);
  const [customizeDialog, setCustomizeDialog] = useState(false);
  const [customizeItem, setCustomizeItem] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Rooms sub-tab state (reuses accommodation logic) ──
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [bookingDialogRoom, setBookingDialogRoom] = useState<any>(null);
  const [roomCart, setRoomCart] = useState<RoomBarCartItem[]>([]);
  const [roomCustomerName, setRoomCustomerName] = useState('');
  const [roomNotes, setRoomNotes] = useState('');
  const [roomSubmitting, setRoomSubmitting] = useState(false);

  // ── Bar sub-tab state (reuses bar logic) ──
  const [barStoreItems, setBarStoreItems] = useState<any[]>([]);
  const [barStoreLoading, setBarStoreLoading] = useState(false);
  const [barSearch, setBarSearch] = useState('');
  const [barCart, setBarCart] = useState<RoomBarCartItem[]>([]);
  const [barCustomerName, setBarCustomerName] = useState('');
  const [barNotes, setBarNotes] = useState('');
  const [barSubmitting, setBarSubmitting] = useState(false);

  // ── Services sub-tab state ──
  const [otherServices, setOtherServices] = useState<any[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

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

  // Awaiting payment count (for badge display)
  const [awaitingCount, setAwaitingCount] = useState(0);

  // ── Manage Orders tab state ──
  const [manageTab, setManageTab] = useState(0); // 0=Internal, 1=Online
  const [internalSub, setInternalSub] = useState(0); // 0=Pending Orders, 1=Pending Payments, 2=Completed Payments
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [payOrder, setPayOrder] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const doRefresh = () => setRefreshKey((k) => k + 1);

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

  // Refresh Manage Orders tab on realtime order changes
  useRealtime('orders', activeBranchId ? { column: 'branch_id', value: activeBranchId } : undefined, () => {
    fetchAwaitingCount();
    doRefresh();
  });

  // Fetch awaiting payment orders count on mount + realtime
  const fetchAwaitingCount = useCallback(async () => {
    if (!activeBranchId) return;
    try {
      const data = await api<{ items: any[]; total: number }>('orders', 'list', {
        params: { status: 'awaiting_payment', page: '1', page_size: '1' },
        branchId: activeBranchId,
      });
      setAwaitingCount(data.total ?? 0);
    } catch { /* ignore */ }
  }, [activeBranchId]);

  useEffect(() => { fetchAwaitingCount(); }, [fetchAwaitingCount]);

  // ── Rooms: fetch available rooms ──
  const fetchRooms = useCallback(async () => {
    if (!activeBranchId) return;
    setRoomsLoading(true);
    try {
      const data = await api<{ rooms: any[]; total: number }>('accommodation', 'list-rooms', {
        params: { page: '1', page_size: '200' },
        branchId: activeBranchId,
      });
      setRooms(data.rooms ?? []);
    } catch (err) { console.error(err); }
    finally { setRoomsLoading(false); }
  }, [activeBranchId]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // ── Bar: fetch bar store items ──
  const fetchBarStore = useCallback(async () => {
    if (!activeBranchId) return;
    setBarStoreLoading(true);
    try {
      const data = await api<{ items: any[]; total: number }>('bar', 'internal-store', {
        params: { page: '1', page_size: '200', ...(barSearch ? { search: barSearch } : {}) },
        branchId: activeBranchId,
      });
      setBarStoreItems(data.items ?? []);
    } catch (err) { console.error(err); }
    finally { setBarStoreLoading(false); }
  }, [activeBranchId, barSearch]);

  useEffect(() => { fetchBarStore(); }, [fetchBarStore]);

  // ── Services: fetch available other services ──
  const fetchOtherServices = useCallback(async () => {
    if (!activeBranchId) return;
    setServicesLoading(true);
    try {
      const data = await api<{ services: any[]; total: number }>('other-services', 'list', {
        params: { page: '1', page_size: '200', available_only: 'true' },
        branchId: activeBranchId,
      });
      setOtherServices(data.services ?? []);
    } catch (err) { console.error(err); }
    finally { setServicesLoading(false); }
  }, [activeBranchId]);

  useEffect(() => { fetchOtherServices(); }, [fetchOtherServices]);

  // ── Room cart helpers ──
  const addToRoomCart = (item: RoomBarCartItem) => {
    setRoomCart((prev) => {
      if (item.source === 'room') {
        if (prev.some((c) => c.id === item.id && c.source === 'room')) {
          toast.error('This room is already in your cart');
          return prev;
        }
        return [...prev, { ...item, quantity: item.quantity || 1 }];
      }
      return prev;
    });
  };

  const removeFromRoomCart = (id: string, source: string) => {
    setRoomCart((prev) => prev.filter((c) => !(c.id === id && c.source === source)));
  };

  const handleRoomSubmit = async () => {
    if (roomCart.length === 0) return toast.error('Cart is empty');
    for (const c of roomCart.filter((x) => x.source === 'room')) {
      if (!c.booking_details?.check_in || !c.booking_details?.duration_count) {
        return toast.error(`Missing booking details for ${c.name}. Remove and re-add it.`);
      }
    }
    setRoomSubmitting(true);
    try {
      const items = roomCart.map((c) => ({
        name: c.name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        source: c.source,
        room_id: c.room_id,
        booking_details: c.booking_details,
        ingredients: [],
        extras: [],
      }));
      const data = await api<{ order_id: string; order_number: string; total: number }>('accommodation', 'create-order', {
        body: {
          items,
          customer_name: roomCustomerName.trim() || 'Walk In Customer',
          notes: roomNotes || undefined,
          order_type: 'accommodation',
        },
        branchId: activeBranchId ?? undefined,
      });
      toast.success(`Room order #${data.order_number} created — ${fmt(data.total)}`);
      setRoomCart([]);
      setRoomCustomerName('');
      setRoomNotes('');
      fetchRooms();
    } catch (err: any) { toast.error(err.message); }
    finally { setRoomSubmitting(false); }
  };

  // ── Bar cart helpers ──
  const addToBarCart = (item: RoomBarCartItem) => {
    setBarCart((prev) => {
      const existing = prev.find((c) => c.id === item.id && c.source === item.source);
      if (existing) {
        const newQty = existing.quantity + 1;
        if (item.max_qty != null && newQty > Number(item.max_qty)) {
          toast.error(`Only ${Number(item.max_qty)} ${item.name} available in stock`);
          return prev;
        }
        return prev.map((c) => c.id === item.id && c.source === item.source ? { ...c, quantity: newQty } : c);
      }
      if (item.max_qty != null && Number(item.max_qty) < 1) {
        toast.error(`${item.name} is out of stock`);
        return prev;
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateBarCartQty = (id: string, delta: number) => {
    setBarCart((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const newQty = c.quantity + delta;
      if (newQty < 1) return c;
      if (c.max_qty != null && newQty > Number(c.max_qty)) {
        toast.error(`Only ${Number(c.max_qty)} ${c.name} available in stock`);
        return c;
      }
      return { ...c, quantity: newQty };
    }));
  };

  const removeFromBarCart = (id: string) => {
    setBarCart((prev) => prev.filter((c) => c.id !== id));
  };

  const barCartSubtotal = barCart.reduce((s, c) => s + c.unit_price * c.quantity, 0);

  const handleBarSubmit = async () => {
    if (barCart.length === 0) return toast.error('Cart is empty');
    setBarSubmitting(true);
    try {
      const items = barCart.map((c) => ({
        name: c.name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        source: c.source,
        bar_store_item_id: c.bar_store_item_id,
        ingredients: [],
        extras: [],
      }));
      const data = await api<{ order_id: string; order_number: string; total: number }>('bar', 'create-order', {
        body: {
          items,
          customer_name: barCustomerName.trim() || 'Walk In Customer',
          notes: barNotes || undefined,
          order_type: 'bar',
        },
        branchId: activeBranchId ?? undefined,
      });
      toast.success(`Bar order #${data.order_number} created — ${fmt(data.total)}`);
      setBarCart([]);
      setBarCustomerName('');
      setBarNotes('');
      fetchBarStore();
    } catch (err: any) { toast.error(err.message); }
    finally { setBarSubmitting(false); }
  };



  useEffect(() => {
    if (categories.length && !activeCat) setActiveCat(categories[0].id);
  }, [categories]);

  // Create maps of available meal info by menu_item_id
  const mealCountMap = new Map<string, number>();
  const mealLabelMap = new Map<string, string>();
  const mealStatusMap = new Map<string, string>();
  const STATUS_PRIORITY: Record<string, number> = { full: 0, half: 1, thirty_pct: 2, ten_pct: 3, unavailable: 4 };
  meals.forEach((m) => {
    mealCountMap.set(m.menu_item_id, (mealCountMap.get(m.menu_item_id) ?? 0) + m.quantity_available);
    if (m.quantity_label) mealLabelMap.set(m.menu_item_id, m.quantity_label);
    // Keep best (highest) availability status across all preparations
    const curStatus = mealStatusMap.get(m.menu_item_id);
    const newStatus = m.availability_status ?? 'full';
    if (!curStatus || (STATUS_PRIORITY[newStatus] ?? 99) < (STATUS_PRIORITY[curStatus] ?? 99)) {
      mealStatusMap.set(m.menu_item_id, newStatus);
    }
  });

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

    // Check meal availability from kitchen
    const availQty = mealCountMap.get(item.id) ?? 0;
    if (availQty <= 0) {
      toast.error(`${item.name} is not available. Check Kitchen Available Meals.`);
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
        menu_item_name: ci.name,
        variant_id: ci.variantId ?? null,
        variant_name: ci.variantName ?? null,
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      {/* ── Top-level tab bar ── */}
      <Tabs
        value={topTab}
        onChange={(_, v) => setTopTab(v)}
        sx={{ mb: 1, minHeight: 42, '& .MuiTab-root': { minHeight: 42 }, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Tab
          icon={<AddCircleOutlineIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
          label="New Order"
          sx={{ fontWeight: 700 }}
        />
        <Tab
          icon={
            <Badge badgeContent={awaitingCount} color="error" max={99}>
              <AssignmentIcon sx={{ fontSize: 18 }} />
            </Badge>
          }
          iconPosition="start"
          label="Manage Orders"
          sx={{ fontWeight: 700 }}
        />
      </Tabs>

      {/* ══ TAB 0: New Order ═══════════════════ */}
      {topTab === 0 && (
    <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
      {/* ── Left: Item Browser ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Sub-tabs: Meals | Rooms | Bar */}
        <Tabs
          value={newOrderSubTab}
          onChange={(_, v) => setNewOrderSubTab(v)}
          sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
        >
          <Tab
            icon={<RestaurantIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label={<Badge badgeContent={meals.reduce((s, m) => s + m.quantity_available, 0)} color="success" max={99}>Meals</Badge>}
            sx={{ fontWeight: newOrderSubTab === 0 ? 700 : 400 }}
          />
          <Tab
            icon={<HotelIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label={<Badge badgeContent={rooms.filter((r) => r.status === 'available' || r.status === 'partially_occupied').length} color="info" max={99}>Rooms</Badge>}
            sx={{ fontWeight: newOrderSubTab === 1 ? 700 : 400 }}
          />
          <Tab
            icon={<LocalBarIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label={<Badge badgeContent={barStoreItems.filter((i: any) => Number(i.quantity) > 0).length} color="warning" max={99}>Bar</Badge>}
            sx={{ fontWeight: newOrderSubTab === 2 ? 700 : 400 }}
          />
          <Tab
            icon={<SpaIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label={<Badge badgeContent={otherServices.length} color="secondary" max={99}>Services</Badge>}
            sx={{ fontWeight: newOrderSubTab === 3 ? 700 : 400 }}
          />
        </Tabs>

        {/* ─── Sub-tab 0: Meals (Menu) ─── */}
        {newOrderSubTab === 0 && (
          <>
            {/* Search */}
            <TextField
              size="small" fullWidth placeholder="Search menu…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
              sx={{ mb: 1.5 }}
            />

            {/* Category Tabs (hidden when searching) */}
            {!search && (
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

            {/* Menu Grid */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <Grid container spacing={1.5}>
                {displayItems.map((item) => {
                  const firstVariant = item.variants?.[0];
                  const price = firstVariant ? item.base_price + (firstVariant.price_adjustment ?? 0) : item.base_price;
                  const avail = (item as any).availability_status ?? 'available';
                  const mealCount = mealCountMap.get(item.id) ?? 0;
                  const mealLabel = mealLabelMap.get(item.id);
                  const isSoldOut = avail === 'sold_out';
                  const notAvailable = !isSoldOut && mealCount <= 0;
                  const isDisabled = isSoldOut || notAvailable;

                  return (
                    <Grid size={{ xs: 6, sm: 4, md: 3 }} key={item.id}>
                      <Paper
                        onClick={() => !isDisabled && handleAddItem(item as MenuItemWithDetails)}
                        sx={{
                          p: 1.5, cursor: isDisabled ? 'not-allowed' : 'pointer', textAlign: 'center',
                          opacity: isDisabled ? 0.4 : 1,
                          '&:hover': isDisabled ? {} : { boxShadow: 3, borderColor: 'primary.main' },
                          transition: 'all 0.15s',
                          border: '1px solid', borderColor: 'divider',
                          borderRadius: 2, position: 'relative',
                        }}
                      >
                        {isSoldOut && (
                          <Chip label="SOLD OUT" color="error" size="small"
                            sx={{ position: 'absolute', top: 4, right: 4, fontSize: '0.65rem' }} />
                        )}
                        {notAvailable && (
                          <Chip label="NOT AVAILABLE" color="default" size="small"
                            sx={{ position: 'absolute', top: 4, right: 4, fontSize: '0.65rem' }} />
                        )}
                        {/* Available meal badge — shows quantity_label (e.g. "2 pots") */}
                        {mealCount > 0 && !isSoldOut && (
                          <Chip
                            label={mealLabel || `${mealCount} avail`}
                            color="success" size="small"
                            sx={{ position: 'absolute', top: 4, left: 4, fontSize: '0.65rem' }}
                          />
                        )}
                        {/* Availability status badge (100%, 50%, etc.) */}
                        {mealCount > 0 && !isSoldOut && (() => {
                          const ms = mealStatusMap.get(item.id) as AvailableMealStatus | undefined;
                          return ms && ms !== 'full' ? (
                            <Chip
                              label={AVAILABLE_MEAL_STATUS_LABELS[ms] ?? ms}
                              color={(AVAILABLE_MEAL_STATUS_COLORS[ms] ?? 'default') as any}
                              size="small"
                              sx={{ position: 'absolute', bottom: 4, left: 4, fontSize: '0.6rem' }}
                            />
                          ) : null;
                        })()}

                        {item.image_url && (
                          <Box component="img" src={item.image_url} alt={item.name}
                            sx={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 1, mb: 1 }} />
                        )}
                        {(item as any).media_url && !item.image_url && (
                          <Box component="img" src={(item as any).media_url} alt={item.name}
                            sx={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 1, mb: 1 }} />
                        )}
                        <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                        <Typography variant="body2" color="primary" fontWeight={700}>{fmt(price)}</Typography>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          </>
        )}

        {/* ─── Sub-tab 1: Rooms ─── */}
        {newOrderSubTab === 1 && (
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {roomsLoading ? <LinearProgress /> : (
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                {rooms.map((room) => {
                  const CATEGORY_COLORS: Record<string, string> = { vip: '#FFD700', express: '#2196F3', luxury: '#9C27B0', regular: '#4CAF50' };
                  const catColor = CATEGORY_COLORS[room.category?.toLowerCase()] ?? '#757575';
                  const inCart = roomCart.some((c) => c.source === 'room' && c.id === room.id);
                  const isBookable = room.status === 'available' || room.status === 'partially_occupied';
                  const canBook = !inCart && isBookable;
                  const availableCapacity = Math.max(0, Number(room.max_occupants) - Number(room.current_occupants ?? 0));
                  const DURATION_LABELS: Record<string, string> = { night: '/night', day: '/day', hour: '/hr' };

                  return (
                    <Card
                      key={room.id}
                      sx={{
                        width: 200, cursor: canBook ? 'pointer' : 'default',
                        opacity: (inCart || !isBookable) ? 0.65 : 1,
                        borderLeft: `4px solid ${catColor}`,
                        '&:hover': { boxShadow: canBook ? 4 : 1 }, transition: '0.15s',
                      }}
                      onClick={() => {
                        if (inCart) { toast.error('This room is already in your cart'); return; }
                        if (!isBookable) { toast.error(`Room ${room.room_number} is currently ${room.status.replace('_', ' ')}`); return; }
                        setBookingDialogRoom(room);
                      }}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        {room.media_url && (
                          <Box sx={{ width: '100%', height: 80, borderRadius: 1, overflow: 'hidden', mb: 0.5 }}>
                            <img src={room.media_url} alt={`Room ${room.room_number}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </Box>
                        )}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" fontWeight={700}>Room {room.room_number}</Typography>
                          <Chip size="small" label={room.category} sx={{ bgcolor: catColor, color: '#fff', fontSize: 10 }} />
                        </Stack>
                        {room.status === 'partially_occupied' && (
                          <Chip size="small" label={`Partial • ${availableCapacity} free`} color="warning" sx={{ mt: 0.3, width: '100%', justifyContent: 'center' }} />
                        )}
                        {room.status !== 'available' && room.status !== 'partially_occupied' && (
                          <Chip size="small" label={room.status.replace('_', ' ')} color={room.status === 'occupied' ? 'error' : 'warning'} sx={{ mt: 0.3, width: '100%', justifyContent: 'center' }} />
                        )}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                          <Typography variant="body2" color="primary.main" fontWeight={600}>
                            {fmt(room.cost_amount)}{DURATION_LABELS[room.cost_duration] ?? ''}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">Max {room.max_occupants}</Typography>
                        </Stack>
                        {room.benefits?.length > 0 && (
                          <Stack direction="row" spacing={0.3} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                            {room.benefits.slice(0, 3).map((b: string, i: number) => (
                              <Chip key={i} size="small" label={b} variant="outlined" sx={{ fontSize: 10 }} />
                            ))}
                          </Stack>
                        )}
                        {inCart && <Chip size="small" label="In Cart" color="primary" sx={{ mt: 0.5 }} />}
                      </CardContent>
                    </Card>
                  );
                })}
                {rooms.length === 0 && !roomsLoading && (
                  <Alert severity="info" sx={{ mt: 2, width: '100%' }}>No rooms available. Create rooms from the Accommodation page.</Alert>
                )}
              </Box>
            )}
          </Box>
        )}

        {/* ─── Sub-tab 2: Bar ─── */}
        {newOrderSubTab === 2 && (
          <>
            <TextField
              size="small" fullWidth placeholder="Search bar items…"
              value={barSearch} onChange={(e) => setBarSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
              sx={{ mb: 1.5 }}
            />
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {barStoreLoading ? <LinearProgress /> : (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {barStoreItems.filter((i: any) => Number(i.quantity) > 0).map((item: any) => (
                    <Card
                      key={item.id}
                      sx={{ width: 180, cursor: 'pointer', '&:hover': { boxShadow: 4 }, transition: '0.15s' }}
                      onClick={() => addToBarCart({
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
                          <Typography variant="body2" color="warning.main" fontWeight={600}>
                            {item.selling_price ? fmt(item.selling_price) : '—'}
                          </Typography>
                          <Chip
                            size="small"
                            label={`${Number(item.quantity)} ${item.unit ?? ''}`}
                            color={Number(item.quantity) < 5 ? 'warning' : 'default'}
                            variant="outlined"
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                  {barStoreItems.filter((i: any) => Number(i.quantity) > 0).length === 0 && !barStoreLoading && (
                    <Alert severity="info" sx={{ mt: 2, width: '100%' }}>
                      No bar items available. Add items to the Bar internal store from the Bar page.
                    </Alert>
                  )}
                </Box>
              )}
            </Box>
          </>
        )}

        {/* ─── Sub-tab 3: Services ─── */}
        {newOrderSubTab === 3 && (
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {servicesLoading ? <LinearProgress /> : (
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                {otherServices.map((svc) => {
                  const DURATION_LABELS: Record<string, string> = {
                    once: '', per_session: '/session', hourly: '/hr', daily: '/day', weekly: '/wk', monthly: '/mo',
                  };
                  return (
                    <Card
                      key={svc.id}
                      sx={{ width: 200, cursor: 'pointer', '&:hover': { boxShadow: 4 }, transition: '0.15s' }}
                      onClick={() => addToBarCart({
                        id: svc.id,
                        name: svc.name,
                        unit_price: svc.charge_amount,
                        quantity: 1,
                        source: 'other_service',
                        other_service_id: svc.id,
                      })}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        {svc.media_url && (
                          <Box sx={{ width: '100%', height: 80, borderRadius: 1, overflow: 'hidden', mb: 0.5 }}>
                            {svc.media_type === 'video' ? (
                              <video src={svc.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                            ) : (
                              <img src={svc.media_url} alt={svc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                          </Box>
                        )}
                        <Typography variant="body2" fontWeight={700} noWrap>{svc.name}</Typography>
                        {svc.description && (
                          <Typography variant="caption" color="text.secondary" noWrap>{svc.description}</Typography>
                        )}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                          <Typography variant="body2" color="secondary.main" fontWeight={600}>
                            {fmt(svc.charge_amount)}{DURATION_LABELS[svc.charge_duration] ?? ''}
                          </Typography>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
                {otherServices.length === 0 && !servicesLoading && (
                  <Alert severity="info" sx={{ mt: 2, width: '100%' }}>
                    No services available. Create services from the Other Services page.
                  </Alert>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* ── Right: Cart (switches based on sub-tab) ── */}
      <Paper sx={{
        width: 360, display: 'flex', flexDirection: 'column',
        borderRadius: 2, p: 2, flexShrink: 0,
      }}>
        {/* ═══ Meals Cart (sub-tab 0) ═══ */}
        {newOrderSubTab === 0 && (<>
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
        </>)}

        {/* ═══ Rooms Cart (sub-tab 1) ═══ */}
        {newOrderSubTab === 1 && (<>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>🏨 Room Booking Cart</Typography>

          <TextField
            fullWidth size="small" label="Customer Name *" placeholder="Guest name"
            value={roomCustomerName} onChange={(e) => setRoomCustomerName(e.target.value)}
            sx={{ mb: 1 }}
          />
          <TextField
            fullWidth size="small" label="Notes" placeholder="Special requests…"
            value={roomNotes} onChange={(e) => setRoomNotes(e.target.value)}
            multiline maxRows={2} sx={{ mb: 1 }}
          />

          <Divider sx={{ mb: 1 }} />

          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {roomCart.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                Select a room to book
              </Typography>
            ) : (
              roomCart.map((item, i) => (
                <Box key={i} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                      {item.booking_details && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {item.booking_details.num_people} guest(s) • {item.booking_details.duration_count} {item.booking_details.duration_unit}(s)
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="body2" fontWeight={600}>{fmt(item.unit_price * item.quantity)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                    <IconButton size="small" color="error" onClick={() => removeFromRoomCart(item.id, item.source)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ))
            )}
          </Box>

          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" fontWeight={700}>Total</Typography>
            <Typography variant="h6" fontWeight={700} color="primary">
              {fmt(roomCart.reduce((s, i) => s + i.unit_price * i.quantity, 0))}
            </Typography>
          </Box>

          <Button
            fullWidth variant="contained" size="large" color="info"
            disabled={roomSubmitting || roomCart.length === 0 || !roomCustomerName.trim()}
            onClick={handleRoomSubmit}
          >
            {roomSubmitting ? 'Booking…' : 'Book Room'}
          </Button>
        </>)}

        {/* ═══ Bar Cart (sub-tab 2) ═══ */}
        {newOrderSubTab === 2 && (<>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>🍸 Bar Cart</Typography>

          <TextField
            fullWidth size="small" label="Customer Name" placeholder="Customer name (optional)"
            value={barCustomerName} onChange={(e) => setBarCustomerName(e.target.value)}
            sx={{ mb: 1 }}
          />
          <TextField
            fullWidth size="small" label="Notes" placeholder="Order notes…"
            value={barNotes} onChange={(e) => setBarNotes(e.target.value)}
            multiline maxRows={2} sx={{ mb: 1 }}
          />

          <Divider sx={{ mb: 1 }} />

          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {barCart.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                Tap bar items to add
              </Typography>
            ) : (
              barCart.map((item, i) => (
                <Box key={i} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={600}>{fmt(item.unit_price * item.quantity)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <IconButton size="small" onClick={() => updateBarCartQty(item.id, item.quantity - 1)}>
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                    <Typography variant="body2" sx={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</Typography>
                    <IconButton size="small" onClick={() => updateBarCartQty(item.id, item.quantity + 1)}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                    <Box sx={{ flex: 1 }} />
                    <IconButton size="small" color="error" onClick={() => removeFromBarCart(item.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ))
            )}
          </Box>

          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" fontWeight={700}>Total</Typography>
            <Typography variant="h6" fontWeight={700} color="primary">{fmt(barCartSubtotal)}</Typography>
          </Box>

          <Button
            fullWidth variant="contained" size="large" color="warning"
            disabled={barSubmitting || barCart.length === 0}
            onClick={handleBarSubmit}
          >
            {barSubmitting ? 'Placing…' : `Place Bar Order — ${fmt(barCartSubtotal)}`}
          </Button>
        </>)}

        {/* ═══ Services Cart (sub-tab 3) ═══ */}
        {newOrderSubTab === 3 && (<>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>🧖 Services Cart</Typography>

          <TextField
            fullWidth size="small" label="Customer Name" placeholder="Customer name (optional)"
            value={barCustomerName} onChange={(e) => setBarCustomerName(e.target.value)}
            sx={{ mb: 1 }}
          />
          <TextField
            fullWidth size="small" label="Notes" placeholder="Special requests…"
            value={barNotes} onChange={(e) => setBarNotes(e.target.value)}
            multiline maxRows={2} sx={{ mb: 1 }}
          />

          <Divider sx={{ mb: 1 }} />

          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {barCart.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                Add services to cart
              </Typography>
            ) : (
              barCart.map((item, i) => (
                <Box key={i} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>{item.name}</Typography>
                    <Typography variant="body2" fontWeight={600}>{fmt(item.unit_price * item.quantity)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <IconButton size="small" onClick={() => { setBarCart((prev) => prev.map((c, j) => j === i ? { ...c, quantity: Math.max(1, c.quantity - 1) } : c)); }}>
                        <RemoveIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="body2">{item.quantity}</Typography>
                      <IconButton size="small" onClick={() => { setBarCart((prev) => prev.map((c, j) => j === i ? { ...c, quantity: c.quantity + 1 } : c)); }}>
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <IconButton size="small" color="error" onClick={() => { setBarCart((prev) => prev.filter((_, j) => j !== i)); }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ))
            )}
          </Box>

          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" fontWeight={700}>Total</Typography>
            <Typography variant="h6" fontWeight={700} color="primary">
              {fmt(barCart.reduce((s, i) => s + i.unit_price * i.quantity, 0))}
            </Typography>
          </Box>

          <Button
            fullWidth variant="contained" size="large" color="secondary"
            disabled={barSubmitting || barCart.length === 0}
            onClick={handleBarSubmit}
          >
            {barSubmitting ? 'Submitting…' : 'Submit Service Order'}
          </Button>
        </>)}
      </Paper>

      {/* Customer search dialog */}
      <CustomerSearchDialog open={customerDialog} onClose={() => setCustomerDialog(false)} />

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

      {/* Room Booking Dialog */}
      {bookingDialogRoom && (
        <RoomBookingDialog
          room={bookingDialogRoom}
          currency={currency}
          onClose={() => setBookingDialogRoom(null)}
          onConfirm={(booking: RoomBarCartItem) => {
            addToRoomCart(booking);
            setBookingDialogRoom(null);
          }}
        />
      )}
    </Box>
      )}

      {/* ══ TAB 1: Manage Orders ═══════════════════════════════════════ */}
      {topTab === 1 && (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {/* Internal / Online tabs */}
          <Tabs
            value={manageTab}
            onChange={(_, v) => setManageTab(v)}
            sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Tab label="🏪 Internal" />
            <Tab label="🌐 Online" />
          </Tabs>

          {/* ── Internal tab ── */}
          {manageTab === 0 && (
            <Box>
              <Tabs
                value={internalSub}
                onChange={(_, v) => setInternalSub(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 2 }}
                TabIndicatorProps={{ style: { background: '#1976d2', height: 3 } }}
              >
                <Tab label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <InventoryIcon sx={{ fontSize: 16 }} />
                    Pending Orders
                  </Box>
                } />
                <Tab label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PaymentIcon sx={{ fontSize: 16 }} />
                    <Badge badgeContent={awaitingCount} color="error" max={99}>
                      Pending Payments
                    </Badge>
                  </Box>
                } />
                <Tab label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CheckCircleIcon sx={{ fontSize: 16 }} />
                    Completed Payments
                  </Box>
                } />
              </Tabs>

              {/* Sub-tab 0: Pending Orders (all internal orders not yet at payment stage) */}
              {internalSub === 0 && (
                <OrdersGrid
                  key={`pending-orders-${refreshKey}`}
                  defaultStatus="pending"
                  statusOptions={['pending', 'confirmed', 'preparing', 'ready']}
                  extraParams={{ exclude_source: 'online' }}
                  currency={currency}
                  effectiveBranchId={activeBranchId ?? ''}
                  onViewDetail={setDetailOrder}
                  onPayment={setPayOrder}
                  showServedForPending
                  servedTargetStatus="awaiting_payment"
                />
              )}

              {/* Sub-tab 1: Pending Payments */}
              {internalSub === 1 && (
                <OrdersGrid
                  key={`pending-pay-${refreshKey}`}
                  defaultStatus="awaiting_payment"
                  statusOptions={['awaiting_payment']}
                  extraParams={{ exclude_source: 'online' }}
                  currency={currency}
                  effectiveBranchId={activeBranchId ?? ''}
                  onViewDetail={setDetailOrder}
                  onPayment={setPayOrder}
                  showPayBtn
                />
              )}

              {/* Sub-tab 2: Completed Payments */}
              {internalSub === 2 && (
                <OrdersGrid
                  key={`completed-${refreshKey}`}
                  defaultStatus="completed"
                  statusOptions={['completed']}
                  currency={currency}
                  effectiveBranchId={activeBranchId ?? ''}
                  onViewDetail={setDetailOrder}
                  showSource
                />
              )}
            </Box>
          )}

          {/* ── Online tab ── */}
          {manageTab === 1 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
                <Typography variant="body2">
                  Online orders from the customer app. Use <strong>Served?</strong> to mark as completed (pre-paid).
                </Typography>
              </Alert>
              <OrdersGrid
                key={`online-${refreshKey}`}
                source="online"
                statusOptions={['', 'awaiting_approval', 'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']}
                currency={currency}
                effectiveBranchId={activeBranchId ?? ''}
                onViewDetail={setDetailOrder}
                onPayment={setPayOrder}
                showPayBtn
                showServedForPending
                servedTargetStatus="completed"
                showSource
              />
            </Box>
          )}
        </Box>
      )}

      {/* ── Shared dialogs for Manage Orders ── */}
      <OrderDetailDialog
        order={detailOrder}
        currency={currency}
        effectiveBranchId={activeBranchId ?? ''}
        onClose={() => setDetailOrder(null)}
        onStatusChange={() => { doRefresh(); fetchAwaitingCount(); }}
        onPaymentOpen={(o) => { setPayOrder(o); setDetailOrder(null); }}
      />

      <PaymentDialog
        open={!!payOrder}
        order={payOrder}
        currency={currency}
        effectiveBranchId={activeBranchId ?? ''}
        onClose={() => setPayOrder(null)}
        onPaid={() => { doRefresh(); fetchAwaitingCount(); }}
      />
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

/* ─── Duration calculator (calendar-night / day / hour) ─── */
function calcDuration(ciStr: string, coStr: string, unit: string): number {
  if (!ciStr || !coStr) return 0;
  const ci = new Date(ciStr).getTime();
  const co = new Date(coStr).getTime();
  if (isNaN(ci) || isNaN(co) || co <= ci) return 0;
  const diffMs = co - ci;
  if (unit === 'hour') return Math.max(1, Math.ceil(diffMs / 3_600_000));
  if (unit === 'day')  return Math.max(1, Math.ceil(diffMs / 86_400_000));
  // night: calendar-day midnight boundaries
  const ciMidnight = new Date(new Date(ciStr).toDateString()).getTime();
  const coMidnight = new Date(new Date(coStr).toDateString()).getTime();
  return Math.max(1, Math.round((coMidnight - ciMidnight) / 86_400_000));
}

/* ─── Room Booking Dialog (replicates Accommodation page dialog) ─── */
function RoomBookingDialog({
  room, currency, onClose, onConfirm,
}: {
  room: any;
  currency: string;
  onClose: () => void;
  onConfirm: (item: RoomBarCartItem) => void;
}) {
  const [numPeople, setNumPeople] = useState(1);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [durationCount, setDurationCount] = useState(1);

  useEffect(() => {
    if (room) { setNumPeople(1); setCheckIn(''); setCheckOut(''); setDurationCount(1); }
  }, [room]);

  const durationUnit = room?.cost_duration ?? 'night';
  const durationLabel = durationUnit === 'hour' ? 'hour' : durationUnit === 'day' ? 'day' : 'night';
  const autoDuration = (checkIn && checkOut) ? calcDuration(checkIn, checkOut, durationUnit) : 0;
  const effectiveDuration = autoDuration > 0 ? autoDuration : durationCount;
  const total = Number(room?.cost_amount ?? 0) * effectiveDuration;

  const isPartiallyOccupied = room?.status === 'partially_occupied';
  const alreadyOccupied = Number(room?.current_occupants ?? 0);
  const availableCapacity = Math.max(1, Number(room?.max_occupants ?? 1) - alreadyOccupied);
  const maxGuests = isPartiallyOccupied ? availableCapacity : Number(room?.max_occupants ?? 99);

  const handleConfirm = () => {
    if (!checkIn) return toast.error('Check-in date & time is required');
    if (effectiveDuration < 1) return toast.error(`Number of ${durationLabel}s must be at least 1`);
    if (numPeople < 1) return toast.error('At least 1 guest required');
    if (numPeople > maxGuests) {
      return toast.error(
        isPartiallyOccupied
          ? `Only ${availableCapacity} slot${availableCapacity !== 1 ? 's' : ''} available`
          : `Max ${room?.max_occupants} occupants allowed`
      );
    }
    onConfirm({
      id: room.id,
      name: `Room ${room.room_number}`,
      unit_price: total,
      quantity: 1,
      source: 'room',
      room_id: room.id,
      booking_details: {
        num_people: numPeople,
        check_in: checkIn,
        check_out: checkOut || undefined,
        duration_count: effectiveDuration,
        duration_unit: durationUnit,
      },
    });
  };

  const durationMethodLabel =
    durationUnit === 'night' ? 'Calendar nights (hotel standard)'
    : durationUnit === 'hour' ? 'Hours — rounded up'
    : 'Days of 24 h — rounded up';

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <MeetingRoomIcon />
          <Typography variant="h6">Book Room {room?.room_number}</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Room summary */}
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
            <Typography variant="body2"><strong>Category:</strong> {room?.category}</Typography>
            <Typography variant="body2"><strong>Rate:</strong> {formatCurrency(room?.cost_amount ?? 0, currency)} / {durationLabel}</Typography>
            <Typography variant="body2"><strong>Max occupants:</strong> {room?.max_occupants}</Typography>
            {isPartiallyOccupied && (
              <Typography variant="body2" color="warning.main">
                <strong>Already occupied:</strong> {alreadyOccupied} &mdash; <strong>{availableCapacity} slot{availableCapacity !== 1 ? 's' : ''} available</strong>
              </Typography>
            )}
          </Paper>

          {/* Check-in */}
          <TextField
            label="Check-in Date & Time *"
            type="datetime-local"
            fullWidth
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {/* Check-out (optional, auto-calculates duration) */}
          <TextField
            label="Departure Date & Time (auto-calculates duration)"
            type="datetime-local"
            fullWidth
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={checkOut && checkIn && autoDuration > 0
              ? `${autoDuration} ${durationLabel}${autoDuration !== 1 ? 's' : ''} — ${durationMethodLabel}`
              : 'Optional — set to auto-calculate duration'}
          />

          {/* Duration */}
          {autoDuration > 0 ? (
            <Alert severity="info" icon={<CalendarTodayIcon fontSize="small" />} sx={{ py: 0.5 }}>
              <Typography variant="body2">
                <strong>{effectiveDuration} {durationLabel}{effectiveDuration !== 1 ? 's' : ''}</strong> — auto-calculated
              </Typography>
            </Alert>
          ) : (
            <TextField
              label={`Number of ${durationLabel}s *`}
              type="number"
              fullWidth
              value={durationCount}
              onChange={(e) => setDurationCount(Math.max(1, Number(e.target.value)))}
              inputProps={{ min: 1 }}
              helperText="Set a departure to auto-calculate"
            />
          )}

          {/* Guests */}
          <TextField
            label="Number of Guests *"
            type="number"
            fullWidth
            value={numPeople}
            onChange={(e) => setNumPeople(Math.max(1, Math.min(maxGuests, Number(e.target.value))))}
            inputProps={{ min: 1, max: maxGuests }}
            helperText={isPartiallyOccupied
              ? `Available slots: ${availableCapacity} (${alreadyOccupied} already occupied of ${room?.max_occupants})`
              : `Max: ${room?.max_occupants ?? '—'}`}
            slotProps={{ input: { startAdornment: <PeopleIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          />

          {/* Total preview */}
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1 }}>
            <Typography variant="h6" fontWeight={700}>
              Total: {formatCurrency(total, currency)}
            </Typography>
            <Typography variant="caption">
              {effectiveDuration} {durationLabel}{effectiveDuration !== 1 ? 's' : ''} × {formatCurrency(room?.cost_amount ?? 0, currency)}
            </Typography>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleConfirm}>Add to Cart</Button>
      </DialogActions>
    </Dialog>
  );
}
