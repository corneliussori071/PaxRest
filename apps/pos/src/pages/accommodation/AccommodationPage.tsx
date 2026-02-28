import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Tabs, Tab, Typography, Button, Card, CardContent,
  Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Select, MenuItem as MuiMenuItem,
  FormControl, InputLabel, ToggleButtonGroup, ToggleButton,
  Badge, Stack, Divider, Alert, InputAdornment,
  LinearProgress, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Paper, Collapse, TablePagination,
  Tooltip, Autocomplete, CircularProgress, Avatar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HotelIcon from '@mui/icons-material/Hotel';
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
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import InventoryIcon from '@mui/icons-material/Inventory';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import BedroomParentIcon from '@mui/icons-material/BedroomParent';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import PeopleIcon from '@mui/icons-material/People';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import { formatCurrency, INGREDIENT_REQUEST_STATUS_LABELS, INGREDIENT_REQUEST_STATUS_COLORS } from '@paxrest/shared-utils';
import type { IngredientRequestStatus, Permission } from '@paxrest/shared-types';
import { useApi, usePaginated, useRealtime } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api, supabase } from '@/lib/supabase';
import { useAvailableMealsStore } from '@/stores';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

export default function AccommodationPage() {
  return <BranchGuard><AccommodationContent /></BranchGuard>;
}

function AccommodationContent() {
  const { activeBranchId, company, activeBranch, profile } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [tab, setTab] = useState(0);

  const userPerms: Permission[] = profile?.permissions ?? [];

  const ALL_TABS: { label: string; perm: Permission; icon: React.ReactElement }[] = [
    { label: 'Create Order',      perm: 'accom_create_order',    icon: <PointOfSaleIcon /> },
    { label: 'Pending Orders',    perm: 'accom_pending_orders',  icon: <HotelIcon /> },
    { label: 'Pending Payment',   perm: 'accom_pending_payment', icon: <CheckCircleIcon /> },
    { label: 'Create Rooms',      perm: 'accom_create_rooms',    icon: <MeetingRoomIcon /> },
    { label: 'Request for Items', perm: 'accom_request_items',   icon: <RestaurantIcon /> },
  ];

  const visibleTabs = ALL_TABS.filter((t) => userPerms.includes(t.perm));
  const tabs = visibleTabs.length > 0 ? visibleTabs : ALL_TABS;

  return (
    <Box sx={{ p: 0 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {tabs.map((t) => (
          <Tab key={t.label} label={t.label} icon={t.icon} iconPosition="start" />
        ))}
      </Tabs>

      {tabs[tab]?.label === 'Create Order' && <CreateOrderTab branchId={activeBranchId!} currency={currency} />}
      {tabs[tab]?.label === 'Pending Orders' && <PendingOrdersTab branchId={activeBranchId!} currency={currency} />}
      {tabs[tab]?.label === 'Pending Payment' && <PendingPaymentTab branchId={activeBranchId!} currency={currency} />}
      {tabs[tab]?.label === 'Create Rooms' && <CreateRoomsTab branchId={activeBranchId!} currency={currency} />}
      {tabs[tab]?.label === 'Request for Items' && <RequestForItemsTab branchId={activeBranchId!} />}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 1 — Create Order
   Search/scan accommodation store items + available meals + rooms
   ═══════════════════════════════════════════════════════ */

interface CartIngredient {
  name: string;
  quantity_used?: number;
  unit?: string;
  cost_contribution?: number;
}

interface CartExtra {
  name: string;
  price: number;
}

interface BookingDetails {
  num_people: number;
  check_in: string;
  check_out?: string;
  duration_count: number;
  duration_unit: string;
}

interface AccomCartItem {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  source: 'accom_store' | 'menu' | 'room';
  accom_store_item_id?: string;
  menu_item_id?: string;
  room_id?: string;
  max_qty?: number;
  ingredients?: CartIngredient[];
  extras?: CartExtra[];
  booking_details?: BookingDetails;
}

function CreateOrderTab({ branchId, currency }: { branchId: string; currency: string }) {
  const { profile } = useAuth();
  const { meals, fetchMeals } = useAvailableMealsStore();

  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState<AccomCartItem[]>([]);
  const [itemSubTab, setItemSubTab] = useState<'store' | 'meals' | 'rooms'>('store');

  // Internal store items
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [storeLoading, setStoreLoading] = useState(true);

  // Rooms (all statuses — occupied shown as disabled in picker)
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);

  // Tables (for cart assignment)
  const [tables, setTables] = useState<any[]>([]);

  // Room booking dialog (opened when user clicks an available room in the picker)
  const [bookingDialogRoom, setBookingDialogRoom] = useState<any>(null);

  // Order metadata
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Meal detail dialog
  const [mealDetailOpen, setMealDetailOpen] = useState(false);
  const [mealDetailData, setMealDetailData] = useState<any>(null);
  const [mealDetailLoading, setMealDetailLoading] = useState(false);

  const fmt = (n: number) => formatCurrency(n, currency);

  // Fetch accommodation store items
  const fetchStore = useCallback(async () => {
    setStoreLoading(true);
    try {
      const data = await api<{ items: any[]; total: number }>('accommodation', 'internal-store', {
        params: { page: '1', page_size: '200', ...(search ? { search } : {}) },
        branchId,
      });
      setStoreItems(data.items ?? []);
    } catch (err) { console.error(err); }
    finally { setStoreLoading(false); }
  }, [branchId, search]);

  // Fetch all rooms (all statuses; occupied displayed but not bookable)
  const fetchRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const data = await api<{ rooms: any[]; total: number }>('accommodation', 'list-rooms', {
        params: { page: '1', page_size: '200' },
        branchId,
      });
      setRooms(data.rooms ?? []);
    } catch (err) { console.error(err); }
    finally { setRoomsLoading(false); }
  }, [branchId]);

  useEffect(() => { fetchStore(); }, [fetchStore]);
  useEffect(() => { fetchRooms(); }, [fetchRooms]);
  useEffect(() => { if (branchId) fetchMeals(branchId); }, [branchId]);

  // Fetch all tables for optional cart assignment
  useEffect(() => {
    if (!branchId) return;
    api<{ tables: any[] }>('tables', 'list', { branchId })
      .then((d) => setTables(d.tables ?? []))
      .catch(() => {});
  }, [branchId]);

  // Barcode scan
  const handleBarcodeScan = async () => {
    if (!barcode.trim()) return;
    try {
      const data = await api<{ item: any }>('accommodation', 'barcode-lookup', {
        params: { barcode: barcode.trim() },
        branchId,
      });
      if (data.item) {
        addToCart({
          id: data.item.id,
          name: data.item.item_name,
          unit_price: data.item.selling_price ?? 0,
          quantity: 1,
          source: 'accom_store',
          accom_store_item_id: data.item.id,
          max_qty: data.item.quantity,
        });
        toast.success(`Added ${data.item.item_name}`);
      } else {
        toast.error('Item not found for this barcode');
      }
    } catch (err: any) { toast.error(err.message); }
    setBarcode('');
  };

  const addToCart = (item: AccomCartItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id && c.source === item.source);
      if (existing) {
        // Rooms can only be added once
        if (item.source === 'room') {
          toast.error('This room is already in your cart');
          return prev;
        }
        const newQty = existing.quantity + 1;
        if (item.source === 'accom_store' && item.max_qty != null && newQty > Number(item.max_qty)) {
          toast.error(`Only ${Number(item.max_qty)} ${item.name} available in stock`);
          return prev;
        }
        return prev.map((c) =>
          c.id === item.id && c.source === item.source
            ? { ...c, quantity: newQty }
            : c
        );
      }
      if (item.source === 'accom_store' && item.max_qty != null && Number(item.max_qty) < 1) {
        toast.error(`${item.name} is out of stock`);
        return prev;
      }
      return [...prev, { ...item, quantity: item.quantity || 1 }];
    });
  };

  const updateQty = (id: string, source: string, delta: number) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.id !== id || c.source !== source) return c;
        const newQty = c.quantity + delta;
        if (newQty < 1) return c;
        if (c.source === 'room') return c; // Rooms always qty 1
        if (c.source === 'accom_store' && c.max_qty != null && newQty > Number(c.max_qty)) {
          toast.error(`Only ${Number(c.max_qty)} ${c.name} available in stock`);
          return c;
        }
        return { ...c, quantity: newQty };
      })
    );
  };

  const removeFromCart = (id: string, source: string) => {
    setCart((prev) => prev.filter((c) => !(c.id === id && c.source === source)));
  };

  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);

  // Meal detail view
  const openMealDetail = async (menuItemId: string) => {
    setMealDetailOpen(true);
    setMealDetailLoading(true);
    setMealDetailData(null);
    try {
      const data = await api<{ menu_item: any }>('kitchen', 'meal-detail', {
        params: { menu_item_id: menuItemId },
        branchId,
      });
      setMealDetailData(data.menu_item);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to load details');
      setMealDetailOpen(false);
    } finally {
      setMealDetailLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    // Validate any room bookings have required details
    for (const c of cart.filter((x) => x.source === 'room')) {
      if (!c.booking_details?.check_in || !c.booking_details?.duration_count) {
        return toast.error(`Missing booking details for ${c.name}. Remove and re-add it.`);
      }
    }

    setSubmitting(true);
    try {
      const linkedRoom = rooms.find((r) => r.id === selectedRoomId);
      const items = cart.map((c) => ({
        name: c.name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        source: c.source,
        accom_store_item_id: c.accom_store_item_id,
        menu_item_id: c.menu_item_id,
        room_id: c.room_id,
        ingredients: c.ingredients ?? [],
        extras: c.extras ?? [],
        booking_details: c.booking_details,
      }));

      const data = await api<{ order_id: string; order_number: string; total: number }>('accommodation', 'create-order', {
        body: {
          items,
          customer_name: customerName.trim() || 'Walk In Customer',
          notes: notes || undefined,
          order_type: 'dine_in',
          table_id: selectedTableId || undefined,
          linked_room_id: selectedRoomId || undefined,
          linked_room_number: linkedRoom?.room_number || undefined,
        },
        branchId,
      });

      toast.success(`Order #${data.order_number} created — ${fmt(data.total)}`);
      setCart([]);
      setCustomerName('');
      setNotes('');
      setSelectedRoomId('');
      setSelectedTableId('');
      fetchStore();
      fetchRooms();
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const DURATION_LABELS: Record<string, string> = { night: '/night', day: '/day', hour: '/hr' };
  const CATEGORY_COLORS: Record<string, string> = {
    vip: '#FFD700', express: '#2196F3', luxury: '#9C27B0', regular: '#4CAF50',
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 140px)' }}>
      {/* Left: Item Browser */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Search & Barcode */}
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <TextField
            size="small" fullWidth placeholder="Search items…"
            value={search} onChange={(e) => setSearch(e.target.value)}
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
        </Stack>

        {/* Sub-tabs: Internal Store | Meals | Rooms */}
        <Stack direction="row" spacing={0} sx={{ mb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Button
            variant="text" onClick={() => setItemSubTab('store')} startIcon={<InventoryIcon />}
            sx={{
              borderBottom: itemSubTab === 'store' ? '2px solid' : '2px solid transparent',
              borderColor: itemSubTab === 'store' ? 'primary.main' : 'transparent',
              borderRadius: 0, px: 2, py: 0.75,
              color: itemSubTab === 'store' ? 'primary.main' : 'text.secondary',
              fontWeight: itemSubTab === 'store' ? 700 : 400,
            }}
          >
            Internal Store
          </Button>
          <Button
            variant="text" onClick={() => setItemSubTab('meals')} startIcon={<RestaurantIcon />}
            sx={{
              borderBottom: itemSubTab === 'meals' ? '2px solid' : '2px solid transparent',
              borderColor: itemSubTab === 'meals' ? 'success.main' : 'transparent',
              borderRadius: 0, px: 2, py: 0.75,
              color: itemSubTab === 'meals' ? 'success.main' : 'text.secondary',
              fontWeight: itemSubTab === 'meals' ? 700 : 400,
            }}
          >
            <Badge badgeContent={meals.reduce((s, m) => s + m.quantity_available, 0)} color="info" max={99}>
              Meals
            </Badge>
          </Button>
          <Button
            variant="text" onClick={() => setItemSubTab('rooms')} startIcon={<MeetingRoomIcon />}
            sx={{
              borderBottom: itemSubTab === 'rooms' ? '2px solid' : '2px solid transparent',
              borderColor: itemSubTab === 'rooms' ? 'info.main' : 'transparent',
              borderRadius: 0, px: 2, py: 0.75,
              color: itemSubTab === 'rooms' ? 'info.main' : 'text.secondary',
              fontWeight: itemSubTab === 'rooms' ? 700 : 400,
            }}
          >
            <Badge badgeContent={rooms.length} color="info" max={99}>
              Rooms
            </Badge>
          </Button>
        </Stack>

        {/* Item Grid */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {itemSubTab === 'store' ? (
            storeLoading ? <LinearProgress /> : (
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
                      source: 'accom_store',
                      accom_store_item_id: item.id,
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
                    No items in accommodation store. Request items from Inventory using the "Request for Items" tab.
                  </Alert>
                )}
              </Box>
            )
          ) : itemSubTab === 'meals' ? (
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
                    ingredients: (meal.menu_items?.menu_item_ingredients ?? []).map((ig: any) => ({
                      name: ig.name || ig.inventory_items?.name || 'Unknown',
                      quantity_used: ig.quantity_used,
                      unit: ig.unit,
                      cost_contribution: ig.cost_contribution,
                    })),
                    extras: (meal.menu_items?.menu_item_extras ?? []).filter((ex: any) => ex.is_available).map((ex: any) => ({
                      name: ex.name,
                      price: ex.price,
                    })),
                  })}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    {meal.menu_items?.media_url && (
                      <Box sx={{ width: '100%', height: 60, borderRadius: 1, overflow: 'hidden', mb: 0.5 }}>
                        <img src={meal.menu_items.media_url} alt={meal.menu_item_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </Box>
                    )}
                    <Typography variant="body2" fontWeight={700} noWrap>{meal.menu_item_name ?? meal.menu_items?.name}</Typography>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                      <Typography variant="body2" color="primary.main" fontWeight={600}>
                        {formatCurrency(meal.menu_items?.base_price ?? 0, currency)}
                      </Typography>
                      <Chip size="small" label={`${meal.quantity_available} avail`} color="success" />
                    </Stack>
                    <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'center' }}>
                      <Button
                        size="small" variant="outlined" startIcon={<VisibilityIcon />}
                        onClick={(e) => { e.stopPropagation(); openMealDetail(meal.menu_item_id); }}
                        sx={{ fontSize: 11, py: 0.25 }}
                      >
                        View
                      </Button>
                    </Box>
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
            /* Rooms sub-tab */
            roomsLoading ? <LinearProgress /> : (
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                {rooms.map((room) => {
                  const catLC = room.category?.toLowerCase();
                  const catColor = CATEGORY_COLORS[catLC] ?? '#757575';
                  const inCart = cart.some((c) => c.source === 'room' && c.id === room.id);
                  const isOccupied = room.status !== 'available';
                  const canBook = !inCart && !isOccupied;
                  return (
                    <Card
                      key={room.id}
                      sx={{
                        width: 200, cursor: canBook ? 'pointer' : 'default',
                        opacity: inCart || isOccupied ? 0.65 : 1,
                        borderLeft: `4px solid ${catColor}`,
                        '&:hover': { boxShadow: canBook ? 4 : 1 }, transition: '0.15s',
                      }}
                      onClick={() => {
                        if (inCart) { toast.error('This room is already in your cart'); return; }
                        if (isOccupied) { toast.error(`Room ${room.room_number} is currently ${room.status}`); return; }
                        setBookingDialogRoom(room);
                      }}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        {room.media_url && (
                          <Box sx={{ width: '100%', height: 80, borderRadius: 1, overflow: 'hidden', mb: 0.5 }}>
                            {room.media_type === 'video' ? (
                              <video src={room.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                            ) : (
                              <img src={room.media_url} alt={`Room ${room.room_number}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                          </Box>
                        )}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" fontWeight={700}>Room {room.room_number}</Typography>
                          <Chip size="small" label={room.category} sx={{ bgcolor: catColor, color: '#fff', fontSize: 10 }} />
                        </Stack>
                        {/* Status badge for non-available rooms */}
                        {isOccupied && (
                          <Chip
                            size="small"
                            label={room.status === 'occupied'
                              ? `Occupied${room.current_occupants ? ` (${room.current_occupants})` : ''}`
                              : room.status}
                            color={room.status === 'occupied' ? 'error' : 'warning'}
                            sx={{ mt: 0.3, width: '100%', justifyContent: 'center' }}
                          />
                        )}
                        {room.floor_section && (
                          <Typography variant="caption" color="text.secondary" display="block">{room.floor_section}</Typography>
                        )}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                          <Typography variant="body2" color="primary.main" fontWeight={600}>
                            {fmt(room.cost_amount)}{DURATION_LABELS[room.cost_duration] ?? ''}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Max {room.max_occupants}
                          </Typography>
                        </Stack>
                        {room.benefits?.length > 0 && (
                          <Stack direction="row" spacing={0.3} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                            {room.benefits.slice(0, 3).map((b: string, i: number) => (
                              <Chip key={i} size="small" label={b} variant="outlined" sx={{ fontSize: 10 }} />
                            ))}
                            {room.benefits.length > 3 && (
                              <Typography variant="caption" color="text.secondary">+{room.benefits.length - 3}</Typography>
                            )}
                          </Stack>
                        )}
                        {inCart && <Chip size="small" label="In Cart" color="primary" sx={{ mt: 0.5 }} />}
                      </CardContent>
                    </Card>
                  );
                })}
                {rooms.length === 0 && !roomsLoading && (
                  <Alert severity="info" sx={{ mt: 2, width: '100%' }}>
                    No available rooms. Create rooms in the "Create Rooms" tab.
                  </Alert>
                )}
              </Box>
            )
          )}
        </Box>
      </Box>

      {/* Right: Cart + Order Details */}
      <Paper sx={{ width: 380, display: 'flex', flexDirection: 'column', p: 2 }} variant="outlined">
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
          <HotelIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Accommodation Order
        </Typography>

        <TextField
          size="small" label="Customer Name (optional)" fullWidth sx={{ mb: 1 }}
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />

        {/* Room assignment (optional — tags the whole order to a room) */}
        <FormControl size="small" fullWidth sx={{ mb: 1 }}>
          <InputLabel>Assign to Room (optional)</InputLabel>
          <Select
            value={selectedRoomId}
            label="Assign to Room (optional)"
            onChange={(e) => setSelectedRoomId(e.target.value)}
          >
            <MuiMenuItem value=""><em>None</em></MuiMenuItem>
            {rooms.map((r) => (
              <MuiMenuItem key={r.id} value={r.id}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <MeetingRoomIcon fontSize="small" />
                  <span>Room {r.room_number}</span>
                  {r.status !== 'available' && (
                    <Chip size="small" label={r.status} color="error" sx={{ ml: 0.5 }} />
                  )}
                </Stack>
              </MuiMenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Table assignment (optional — only available tables shown) */}
        <FormControl size="small" fullWidth sx={{ mb: 1 }}>
          <InputLabel>Assign to Table (optional)</InputLabel>
          <Select
            value={selectedTableId}
            label="Assign to Table (optional)"
            onChange={(e) => setSelectedTableId(e.target.value)}
          >
            <MuiMenuItem value=""><em>None</em></MuiMenuItem>
            {tables.filter((t) => t.status === 'available').map((t) => (
              <MuiMenuItem key={t.id} value={t.id}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TableRestaurantIcon fontSize="small" />
                  <span>{t.name ?? `Table ${t.table_number}`}</span>
                  <Chip size="small" label="Available" color="success" />
                </Stack>
              </MuiMenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small" label="Notes" fullWidth multiline rows={1} sx={{ mb: 1 }}
          value={notes} onChange={(e) => setNotes(e.target.value)}
        />

        <Divider sx={{ my: 1 }} />

        {/* Cart Items */}
        <Box sx={{ flex: 1, overflow: 'auto', mb: 1 }}>
          {cart.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              Tap items or rooms to add to cart
            </Typography>
          ) : (
            cart.map((item) => (
              <Box key={`${item.source}-${item.id}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, py: 0.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmt(item.unit_price)} × {item.quantity} = {fmt(item.unit_price * item.quantity)}
                  </Typography>
                  <Chip size="small" label={
                    item.source === 'accom_store' ? 'Store' : item.source === 'room' ? 'Room' : 'Menu'
                  } sx={{ ml: 1 }}
                    color={item.source === 'accom_store' ? 'primary' : item.source === 'room' ? 'info' : 'success'}
                    variant="outlined" />
                  {item.source === 'accom_store' && item.max_qty != null && (
                    <Typography variant="caption" color={item.quantity >= Number(item.max_qty) ? 'error.main' : 'text.secondary'} sx={{ ml: 1 }}>
                      ({item.quantity}/{Number(item.max_qty)} in stock)
                    </Typography>
                  )}
                  {/* Booking details summary for room items */}
                  {item.source === 'room' && item.booking_details && (
                    <Box sx={{ mt: 0.4 }}>
                      <Typography variant="caption" color="info.main" display="block">
                        <PeopleIcon sx={{ fontSize: 11, verticalAlign: 'middle', mr: 0.3 }} />
                        {item.booking_details.num_people} guest{item.booking_details.num_people !== 1 ? 's' : ''}
                        {' · '}
                        {item.booking_details.duration_count} {item.booking_details.duration_unit}{item.booking_details.duration_count !== 1 ? 's' : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        📅 Check-in: {new Date(item.booking_details.check_in).toLocaleString()}
                      </Typography>
                      {item.booking_details.check_out && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          🚪 Departure: {new Date(item.booking_details.check_out).toLocaleString()}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
                <Stack direction="row" alignItems="center" spacing={0}>
                  {item.source !== 'room' && (
                    <>
                      <IconButton size="small" onClick={() => updateQty(item.id, item.source, -1)}><RemoveIcon fontSize="small" /></IconButton>
                      <Typography sx={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</Typography>
                      <IconButton size="small" onClick={() => updateQty(item.id, item.source, 1)}><AddIcon fontSize="small" /></IconButton>
                    </>
                  )}
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
          disabled={submitting || cart.length === 0}
          onClick={handleSubmit}
        >
          {submitting ? 'Processing…' : `Place Order — ${fmt(subtotal)}`}
        </Button>
      </Paper>

      {/* Room Booking Dialog — opened when user clicks an available room in the picker */}
      <RoomBookingDialog
        room={bookingDialogRoom}
        open={!!bookingDialogRoom}
        onClose={() => setBookingDialogRoom(null)}
        currency={currency}
        onConfirm={(details) => {
          if (!bookingDialogRoom) return;
          addToCart({
            id: bookingDialogRoom.id,
            name: `Room ${bookingDialogRoom.room_number}`,
            unit_price: Number(bookingDialogRoom.cost_amount),
            quantity: details.duration_count,
            source: 'room',
            room_id: bookingDialogRoom.id,
            booking_details: details,
          });
          setBookingDialogRoom(null);
        }}
      />

      {/* Meal Detail Dialog */}
      <Dialog open={mealDetailOpen} onClose={() => setMealDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <RestaurantIcon />
            <Typography variant="h6">Meal Details</Typography>
          </Stack>
          <Tooltip title="Close"><IconButton onClick={() => setMealDetailOpen(false)}><CloseIcon /></IconButton></Tooltip>
        </DialogTitle>
        <DialogContent dividers>
          {mealDetailLoading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
          ) : mealDetailData ? (
            <Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                {mealDetailData.media_url && (
                  <Avatar src={mealDetailData.media_url} variant="rounded" sx={{ width: 140, height: 140 }} />
                )}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" fontWeight={700}>{mealDetailData.name ?? '—'}</Typography>
                  {mealDetailData.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{mealDetailData.description}</Typography>
                  )}
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    {mealDetailData.base_price != null && (
                      <Typography variant="body2"><strong>Price:</strong> {formatCurrency(mealDetailData.base_price, currency)}</Typography>
                    )}
                  </Stack>
                </Box>
              </Stack>

              {mealDetailData.menu_item_ingredients?.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Ingredients</Typography>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1.5, py: 0.75, fontSize: 13 }, '& th': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                    <thead><tr><th>Ingredient</th><th>Quantity</th><th>Unit</th></tr></thead>
                    <tbody>
                      {mealDetailData.menu_item_ingredients.map((ing: any) => (
                        <tr key={ing.id}>
                          <td>{ing.name ?? ing.inventory_items?.name ?? '—'}</td>
                          <td>{ing.quantity_used}</td>
                          <td>{ing.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Box>
                </>
              )}

              {mealDetailData.menu_item_extras?.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Extras</Typography>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1.5, py: 0.75, fontSize: 13 }, '& th': { bgcolor: 'action.hover', fontWeight: 700 } }}>
                    <thead><tr><th>Extra</th><th>Price</th><th>Available</th></tr></thead>
                    <tbody>
                      {mealDetailData.menu_item_extras.map((ext: any) => (
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
            </Box>
          ) : (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No data available</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMealDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Room Booking Dialog
   Opens when a user clicks an available room in the picker.
   Collects: duration, guests, check-in/out, computes total.
   ═══════════════════════════════════════════════════════ */
function RoomBookingDialog({
  room, open, onClose, onConfirm, currency,
}: {
  room: any;
  open: boolean;
  onClose: () => void;
  onConfirm: (details: BookingDetails) => void;
  currency: string;
}) {
  const [numPeople, setNumPeople] = useState(1);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [durationCount, setDurationCount] = useState(1);

  // Reset when a new room is selected
  useEffect(() => {
    if (room) {
      setNumPeople(1);
      setCheckIn('');
      setCheckOut('');
      setDurationCount(1);
    }
  }, [room]);

  const durationUnit = room?.cost_duration ?? 'night';
  const durationLabel = durationUnit === 'hour' ? 'hour' : durationUnit === 'day' ? 'day' : 'night';
  const total = Number(room?.cost_amount ?? 0) * durationCount;

  const handleConfirm = () => {
    if (!checkIn) return toast.error('Check-in date & time is required');
    if (durationCount < 1) return toast.error(`Number of ${durationLabel}s must be at least 1`);
    if (numPeople < 1) return toast.error('At least 1 guest required');
    if (numPeople > (room?.max_occupants ?? 99)) {
      return toast.error(`Max ${room?.max_occupants} occupants allowed for this room`);
    }
    onConfirm({
      num_people: numPeople,
      check_in: checkIn,
      check_out: checkOut || undefined,
      duration_count: durationCount,
      duration_unit: durationUnit,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
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
            {room?.floor_section && (
              <Typography variant="body2"><strong>Section:</strong> {room.floor_section}</Typography>
            )}
          </Paper>

          <TextField
            label={`Number of ${durationLabel}s *`}
            type="number"
            fullWidth
            value={durationCount}
            onChange={(e) => setDurationCount(Math.max(1, Number(e.target.value)))}
            inputProps={{ min: 1 }}
            helperText={`Sub-total: ${formatCurrency(total, currency)}`}
          />

          <TextField
            label="Number of Guests *"
            type="number"
            fullWidth
            value={numPeople}
            onChange={(e) => setNumPeople(Math.max(1, Math.min(room?.max_occupants ?? 99, Number(e.target.value))))}
            inputProps={{ min: 1, max: room?.max_occupants }}
            helperText={`Max: ${room?.max_occupants ?? '—'}`}
            slotProps={{ input: { startAdornment: <PeopleIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          />

          <TextField
            label="Check-in Date & Time *"
            type="datetime-local"
            fullWidth
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            label="Departure Date & Time (optional)"
            type="datetime-local"
            fullWidth
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1 }}>
            <Typography variant="h6" fontWeight={700}>
              Total: {formatCurrency(total, currency)}
            </Typography>
            <Typography variant="caption">
              {durationCount} {durationLabel}{durationCount !== 1 ? 's' : ''} × {formatCurrency(room?.cost_amount ?? 0, currency)}
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

/* ═══════════════════════════════════════════════════════
   Tab 2 — Pending Orders
   ═══════════════════════════════════════════════════════ */

const ORDER_STATUS_COLORS: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error' | 'primary'> = {
  pending: 'warning', confirmed: 'info', preparing: 'info', ready: 'success', served: 'primary',
};

function PendingOrdersTab({ branchId, currency }: { branchId: string; currency: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [markingServed, setMarkingServed] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('today');
  const [detailDialog, setDetailDialog] = useState(false);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fmt = (n: number) => formatCurrency(n, currency);

  const fetchOrders = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page + 1), page_size: String(pageSize), date_range: dateRange };
      if (search.trim()) params.search = search.trim();
      const data = await api<{ orders: any[]; total: number }>('accommodation', 'pending-orders', { params, branchId });
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, dateRange, search]);

  useEffect(() => { setLoading(true); fetchOrders(); }, [fetchOrders]);
  useRealtime('orders', branchId ? { column: 'branch_id', value: branchId } : undefined, () => fetchOrders());

  const handleMarkServed = async (orderId: string) => {
    setMarkingServed(orderId);
    try {
      await api('accommodation', 'mark-served', { body: { order_id: orderId }, branchId });
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
      const data = await api<{ order: any }>('accommodation', 'order-detail', { params: { id: orderId }, branchId });
      setDetailOrder(data.order);
    } catch (err: any) { toast.error(err.message); setDetailDialog(false); }
    finally { setDetailLoading(false); }
  };

  if (loading && orders.length === 0) return <LinearProgress />;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search order # or customer…" sx={{ minWidth: 260 }}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
        />
        <ToggleButtonGroup size="small" value={dateRange} exclusive onChange={(_, v) => { if (v) { setDateRange(v); setPage(0); } }}>
          {[{ value: 'today', label: 'Today' }, { value: '7d', label: '7 Days' }, { value: '30d', label: '30 Days' }, { value: 'all', label: 'All' }].map((o) => (
            <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">{total} order{total !== 1 ? 's' : ''}</Typography>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {orders.length === 0 && !loading ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No pending accommodation orders</Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {orders.map((order) => (
            <Card key={order.id} sx={{ width: 300, borderLeft: '4px solid', borderLeftColor: `${ORDER_STATUS_COLORS[order.status] ?? 'default'}.main` }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography fontWeight={700}>#{order.order_number}</Typography>
                  <Chip size="small" label={order.status?.replace(/_/g, ' ')} color={ORDER_STATUS_COLORS[order.status] ?? 'default'} />
                </Stack>
                <Typography variant="body2" color="text.secondary">Customer: {order.customer_name || 'Walk In Customer'}</Typography>

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

      <OrderDetailDialog open={detailDialog} onClose={() => setDetailDialog(false)} order={detailOrder} loading={detailLoading} currency={currency} />
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
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('today');
  const [detailDialog, setDetailDialog] = useState(false);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fmt = (n: number) => formatCurrency(n, currency);

  const fetchOrders = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page + 1), page_size: String(pageSize), date_range: dateRange };
      if (search.trim()) params.search = search.trim();
      const data = await api<{ orders: any[]; total: number }>('accommodation', 'awaiting-payment', { params, branchId });
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, dateRange, search]);

  useEffect(() => { setLoading(true); fetchOrders(); }, [fetchOrders]);
  useRealtime('orders', branchId ? { column: 'branch_id', value: branchId } : undefined, () => fetchOrders());

  const openDetail = async (orderId: string) => {
    setDetailDialog(true);
    setDetailLoading(true);
    setDetailOrder(null);
    try {
      const data = await api<{ order: any }>('accommodation', 'order-detail', { params: { id: orderId }, branchId });
      setDetailOrder(data.order);
    } catch (err: any) { toast.error(err.message); setDetailDialog(false); }
    finally { setDetailLoading(false); }
  };

  if (loading && orders.length === 0) return <LinearProgress />;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Orders awaiting payment. Checkout can be completed at the POS Terminal.
      </Alert>

      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search order # or customer…" sx={{ minWidth: 260 }}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
        />
        <ToggleButtonGroup size="small" value={dateRange} exclusive onChange={(_, v) => { if (v) { setDateRange(v); setPage(0); } }}>
          {[{ value: 'today', label: 'Today' }, { value: '7d', label: '7 Days' }, { value: '30d', label: '30 Days' }, { value: 'all', label: 'All' }].map((o) => (
            <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">{total} order{total !== 1 ? 's' : ''}</Typography>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {orders.length === 0 && !loading ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No orders awaiting payment</Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {orders.map((order) => (
            <Card key={order.id} sx={{ width: 320, borderTop: '3px solid', borderTopColor: 'warning.main' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight={700}>#{order.order_number}</Typography>
                  <Chip size="small" label="Awaiting Payment" color="warning" />
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Customer: {order.customer_name || 'Walk In Customer'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Created by: {order.created_by_name ?? '—'} · {order.department ?? 'accommodation'}
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

      <OrderDetailDialog open={detailDialog} onClose={() => setDetailDialog(false)} order={detailOrder} loading={detailLoading} currency={currency} />
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Shared Order Detail Dialog — printable + PDF support
   ═══════════════════════════════════════════════════════ */
function OrderDetailDialog({
  open, onClose, order, loading, currency,
}: {
  open: boolean; onClose: () => void; order: any; loading: boolean; currency: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency);

  const handlePrint = () => {
    const el = document.getElementById('accom-order-detail-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Accommodation Order #${order?.order_number ?? ''}</title>
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <HotelIcon />
          <Typography variant="h6">Order Details</Typography>
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Print"><IconButton onClick={handlePrint} disabled={loading}><PrintIcon /></IconButton></Tooltip>
          <Tooltip title="Download PDF"><IconButton onClick={handlePrint} disabled={loading}><PictureAsPdfIcon /></IconButton></Tooltip>
          <Tooltip title="Close"><IconButton onClick={onClose}><CloseIcon /></IconButton></Tooltip>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
        ) : order ? (
          <Box id="accom-order-detail-print">
            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Typography variant="h5" fontWeight={700}>Order #{order.order_number}</Typography>
                <Chip label={order.status?.replace(/_/g, ' ')} color={ORDER_STATUS_COLORS[order.status] ?? 'default'} />
              </Stack>
            </Paper>

            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 6 }}>
                <Typography variant="body2"><strong>Customer:</strong> {order.customer_name || 'Walk In Customer'}</Typography>
                <Typography variant="body2"><strong>Type:</strong> {order.order_type?.replace(/_/g, ' ')}</Typography>
                <Typography variant="body2"><strong>Department:</strong> {order.department ?? 'accommodation'}</Typography>
                <Typography variant="body2"><strong>Source:</strong> {order.source ?? 'accommodation'}</Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="body2"><strong>Created By:</strong> {order.created_by_name ?? '—'}</Typography>
                <Typography variant="body2"><strong>Created:</strong> {new Date(order.created_at).toLocaleString()}</Typography>
                {order.served_at && (
                  <Typography variant="body2"><strong>Served:</strong> {new Date(order.served_at).toLocaleString()}</Typography>
                )}
                {order.linked_room_number && (
                  <Typography variant="body2"><strong>Room:</strong> Room {order.linked_room_number}</Typography>
                )}
                {order.table_id && (
                  <Typography variant="body2"><strong>Table:</strong> #{String(order.table_id).slice(-4).toUpperCase()}</Typography>
                )}
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Order Items Breakdown</Typography>

            {(order.order_items ?? []).map((item: any, idx: number) => {
              const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
              const isStore = item.menu_item_id === ZERO_UUID || (!item.menu_item_id);

              // Detect room booking metadata stored in order_items.modifiers
              const bookingMeta = (() => {
                const mods = Array.isArray(item.modifiers) ? item.modifiers : (() => {
                  try { return JSON.parse(item.modifiers ?? '[]'); } catch { return []; }
                })();
                return mods.find((m: any) => m?.type === 'booking') ?? null;
              })();

              let extras: any[] = [];
              if (Array.isArray(item.selected_extras)) {
                extras = item.selected_extras;
              } else if (typeof item.selected_extras === 'string') {
                try { extras = JSON.parse(item.selected_extras); } catch { extras = []; }
              }

              const removed = Array.isArray(item.removed_ingredients) ? item.removed_ingredients : [];

              let ingredients: any[] = [];
              const tryParse = (v: any): any[] => {
                if (Array.isArray(v) && v.length > 0) return v;
                if (typeof v === 'string' && v.length > 2) {
                  try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch { /* ignore */ }
                }
                return [];
              };
              ingredients = tryParse(item.ingredients);
              if (ingredients.length === 0) ingredients = tryParse(item.modifiers);
              ingredients = ingredients.filter((ig: any) => ig && (ig.name || ig.ingredient_name));

              const extrasTotal = extras.reduce((s: number, ex: any) => s + (typeof ex === 'object' && ex.price ? Number(ex.price) : 0), 0);

              return (
                <Paper key={item.id} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography fontWeight={700}>{idx + 1}.</Typography>
                      <Box>
                        <Typography variant="body1" fontWeight={600}>{item.menu_item_name}</Typography>
                        {item.variant_name && (
                          <Typography variant="caption" color="text.secondary">Variant: {item.variant_name}</Typography>
                        )}
                      </Box>
                      <Chip size="small" label={isStore ? 'Internal Store' : 'Menu/Room'}
                        color={isStore ? 'primary' : 'success'} variant="outlined" />
                    </Stack>
                    <Typography variant="body1" fontWeight={700}>{fmt(item.item_total ?? item.unit_price * item.quantity)}</Typography>
                  </Stack>

                  <Box sx={{ pl: 3, mt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {fmt(item.unit_price)} × {item.quantity} = {fmt(item.unit_price * item.quantity)}
                    </Typography>

                    {/* Booking details block for room items */}
                    {bookingMeta && (
                      <Paper variant="outlined" sx={{ p: 1, mt: 1, bgcolor: 'action.hover' }}>
                        <Typography variant="caption" fontWeight={700} color="info.main" display="block" sx={{ mb: 0.5 }}>
                          🏨 Booking Details
                        </Typography>
                        <Stack direction="row" spacing={2} flexWrap="wrap">
                          <Typography variant="caption" color="text.secondary">
                            <strong>Guests:</strong> {bookingMeta.num_people}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            <strong>Duration:</strong> {bookingMeta.duration_count} {bookingMeta.duration_unit}{bookingMeta.duration_count !== 1 ? 's' : ''}
                          </Typography>
                        </Stack>
                        {bookingMeta.check_in && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            📅 <strong>Check-in:</strong> {new Date(bookingMeta.check_in).toLocaleString()}
                          </Typography>
                        )}
                        {bookingMeta.check_out && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            🚪 <strong>Departure:</strong> {new Date(bookingMeta.check_out).toLocaleString()}
                          </Typography>
                        )}
                      </Paper>
                    )}

                    {ingredients.length > 0 && (
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">Ingredients:</Typography>
                        {ingredients.map((ig: any, i: number) => (
                          <Stack key={i} direction="row" justifyContent="space-between" sx={{ pl: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              • {ig.name ?? ig.ingredient_name ?? ig}{ig.quantity_used ? ` (${ig.quantity_used} ${ig.unit ?? ''})` : ''}
                            </Typography>
                            {ig.cost_contribution != null && ig.cost_contribution > 0 && (
                              <Typography variant="caption" color="text.secondary">{fmt(ig.cost_contribution)}</Typography>
                            )}
                          </Stack>
                        ))}
                      </Box>
                    )}

                    {removed.length > 0 && (
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" fontWeight={700} color="error.main">Removed Ingredients:</Typography>
                        {removed.map((r: any, i: number) => (
                          <Typography key={i} variant="caption" display="block" color="error.main" sx={{ pl: 1 }}>
                            ✕ {typeof r === 'string' ? r : r.name ?? r.ingredient_name ?? JSON.stringify(r)}
                          </Typography>
                        ))}
                      </Box>
                    )}

                    {extras.length > 0 && (
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" fontWeight={700} color="success.main">Extras / Add-ons:</Typography>
                        {extras.map((ex: any, i: number) => {
                          const n = typeof ex === 'string' ? ex : ex.name ?? ex.extra_name ?? '';
                          const p = typeof ex === 'object' && ex.price ? Number(ex.price) : 0;
                          return (
                            <Stack key={i} direction="row" justifyContent="space-between" sx={{ pl: 1 }}>
                              <Typography variant="caption" color="success.main">+ {n}</Typography>
                              {p > 0 && <Typography variant="caption" color="success.main">{fmt(p)}</Typography>}
                            </Stack>
                          );
                        })}
                        {extrasTotal > 0 && (
                          <Typography variant="caption" fontWeight={600} color="success.main" sx={{ pl: 1 }}>
                            Extras subtotal: {fmt(extrasTotal)}
                          </Typography>
                        )}
                      </Box>
                    )}

                    {item.special_instructions && (
                      <Typography variant="caption" display="block" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                        📝 {item.special_instructions}
                      </Typography>
                    )}
                  </Box>
                </Paper>
              );
            })}

            <Divider sx={{ my: 2 }} />
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Price Breakdown</Typography>
              {(order.order_items ?? []).map((item: any) => (
                <Stack key={item.id} direction="row" justifyContent="space-between" sx={{ py: 0.25 }}>
                  <Typography variant="body2">{item.quantity}× {item.menu_item_name}</Typography>
                  <Typography variant="body2">{fmt(item.item_total ?? item.unit_price * item.quantity)}</Typography>
                </Stack>
              ))}

              <Divider sx={{ my: 1 }} />

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Subtotal</Typography>
                <Typography variant="body2" fontWeight={600}>{fmt(order.subtotal ?? order.total)}</Typography>
              </Stack>

              {order.discount_amount > 0 && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="error.main">
                    Discount{order.discount_reason ? ` (${order.discount_reason})` : ''}
                  </Typography>
                  <Typography variant="body2" color="error.main">-{fmt(order.discount_amount)}</Typography>
                </Stack>
              )}

              <Divider sx={{ my: 1 }} />

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="h6" fontWeight={700}>Total</Typography>
                <Typography variant="h6" fontWeight={700} color="primary.main">{fmt(order.total)}</Typography>
              </Stack>
            </Paper>

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
        <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={handlePrint} disabled={loading || !order}>Save as PDF</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 4 — Create Rooms
   ═══════════════════════════════════════════════════════ */
const ROOM_CATEGORIES = ['VIP', 'Express', 'Luxury', 'Regular'];
const COST_DURATIONS = [
  { value: 'night', label: 'Per Night' },
  { value: 'day', label: 'Per Day' },
  { value: 'hour', label: 'Per Hour' },
];
const ROOM_STATUS_COLORS: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  available: 'success', occupied: 'error', maintenance: 'warning', reserved: 'info',
};

function CreateRoomsTab({ branchId, currency }: { branchId: string; currency: string }) {
  const { profile, company } = useAuth();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Dialog
  const [dialog, setDialog] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any>(null);
  const [form, setForm] = useState({
    room_number: '',
    floor_section: '',
    max_occupants: 1,
    category: 'Regular',
    custom_category: '',
    cost_amount: '',
    cost_duration: 'night' as string,
    benefits: [] as string[],
    new_benefit: '',
    media_url: '',
    media_type: '' as string,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Free-room dialog state
  const [freeDialog, setFreeDialog] = useState(false);
  const [freeDialogRoom, setFreeDialogRoom] = useState<any>(null);
  const [freeDialogPeople, setFreeDialogPeople] = useState(1);
  const [freeLoading, setFreeLoading] = useState(false);

  const fmt = (n: number) => formatCurrency(n, currency);

  const fetchRooms = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page + 1), page_size: String(pageSize) };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const data = await api<{ rooms: any[]; total: number }>('accommodation', 'list-rooms', { params, branchId });
      setRooms(data.rooms ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, search, statusFilter]);

  useEffect(() => { setLoading(true); fetchRooms(); }, [fetchRooms]);

  // Real-time: automatically refresh when any room in this branch changes (occupancy, status)
  useRealtime('rooms', branchId ? { column: 'branch_id', value: branchId } : undefined, () => {
    fetchRooms();
  });

  const openNew = () => {
    setEditingRoom(null);
    setForm({
      room_number: '', floor_section: '', max_occupants: 1,
      category: 'Regular', custom_category: '', cost_amount: '',
      cost_duration: 'night', benefits: [], new_benefit: '',
      media_url: '', media_type: '',
    });
    setDialog(true);
  };

  const openEdit = (room: any) => {
    setEditingRoom(room);
    const isCustomCat = !ROOM_CATEGORIES.map((c) => c.toLowerCase()).includes(room.category?.toLowerCase());
    setForm({
      room_number: room.room_number ?? '',
      floor_section: room.floor_section ?? '',
      max_occupants: room.max_occupants ?? 1,
      category: isCustomCat ? 'Custom' : room.category ?? 'Regular',
      custom_category: isCustomCat ? room.category : '',
      cost_amount: String(room.cost_amount ?? ''),
      cost_duration: room.cost_duration ?? 'night',
      benefits: room.benefits ?? [],
      new_benefit: '',
      media_url: room.media_url ?? '',
      media_type: room.media_type ?? '',
    });
    setDialog(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB');
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      toast.error('Only images and videos are allowed');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `rooms/${branchId}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('media')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      setForm((prev) => ({
        ...prev,
        media_url: urlData.publicUrl,
        media_type: isImage ? 'image' : 'video',
      }));
      toast.success('File uploaded');
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const addBenefit = () => {
    if (!form.new_benefit.trim()) return;
    if (form.benefits.includes(form.new_benefit.trim())) {
      toast.error('Benefit already added');
      return;
    }
    setForm({ ...form, benefits: [...form.benefits, form.new_benefit.trim()], new_benefit: '' });
  };

  const removeBenefit = (idx: number) => {
    setForm({ ...form, benefits: form.benefits.filter((_, i) => i !== idx) });
  };

  const handleSave = async () => {
    if (!form.room_number.trim()) return toast.error('Room number is required');
    if (!form.cost_amount || Number(form.cost_amount) <= 0) return toast.error('Cost must be positive');
    if (form.max_occupants < 1) return toast.error('Max occupants must be at least 1');

    const category = form.category === 'Custom'
      ? (form.custom_category.trim() || 'Custom')
      : form.category;

    setSaving(true);
    try {
      if (editingRoom) {
        await api('accommodation', 'update-room', {
          body: {
            room_id: editingRoom.id,
            room_number: form.room_number.trim(),
            floor_section: form.floor_section.trim() || null,
            max_occupants: form.max_occupants,
            category,
            cost_amount: Number(form.cost_amount),
            cost_duration: form.cost_duration,
            benefits: form.benefits,
            media_url: form.media_url || null,
            media_type: form.media_type || null,
          },
          branchId,
        });
        toast.success('Room updated');
      } else {
        await api('accommodation', 'create-room', {
          body: {
            room_number: form.room_number.trim(),
            floor_section: form.floor_section.trim() || null,
            max_occupants: form.max_occupants,
            category,
            cost_amount: Number(form.cost_amount),
            cost_duration: form.cost_duration,
            benefits: form.benefits,
            media_url: form.media_url || null,
            media_type: form.media_type || null,
          },
          branchId,
        });
        toast.success('Room created');
      }
      setDialog(false);
      fetchRooms();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (roomId: string) => {
    if (!window.confirm('Delete this room?')) return;
    try {
      await api('accommodation', 'delete-room', { body: { room_id: roomId }, branchId });
      toast.success('Room deleted');
      fetchRooms();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleFreeRoom = async () => {
    if (!freeDialogRoom || freeDialogPeople < 1) return;
    const currentOccupants = Number(freeDialogRoom.current_occupants ?? 0);
    if (freeDialogPeople > currentOccupants && currentOccupants > 0) {
      toast.error(`Only ${currentOccupants} guest${currentOccupants !== 1 ? 's' : ''} currently recorded in this room`);
      return;
    }
    setFreeLoading(true);
    try {
      const res = await api<{ room: any }>('accommodation', 'free-room', {
        body: { room_id: freeDialogRoom.id, people_leaving: freeDialogPeople },
        branchId,
      });
      const updated = res.room;
      toast.success(
        updated.status === 'available'
          ? `Room ${freeDialogRoom.room_number} is now available`
          : `Room ${freeDialogRoom.room_number}: ${updated.current_occupants} guest(s) remaining`
      );
      setFreeDialog(false);
      setFreeDialogRoom(null);
      fetchRooms();
    } catch (err: any) { toast.error(err.message); }
    finally { setFreeLoading(false); }
  };

  if (loading && rooms.length === 0) return <LinearProgress />;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small" placeholder="Search rooms…" sx={{ minWidth: 220 }}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
              <MuiMenuItem value="">All</MuiMenuItem>
              <MuiMenuItem value="available">Available</MuiMenuItem>
              <MuiMenuItem value="occupied">Occupied</MuiMenuItem>
              <MuiMenuItem value="reserved">Reserved</MuiMenuItem>
              <MuiMenuItem value="maintenance">Maintenance</MuiMenuItem>
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary">{total} room{total !== 1 ? 's' : ''}</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>Create Room</Button>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {rooms.length === 0 && !loading ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No rooms yet. Click "Create Room" to add your first room.
        </Alert>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {rooms.map((room) => {
            const catLC = room.category?.toLowerCase();
            const catColorMap: Record<string, string> = { vip: '#FFD700', express: '#2196F3', luxury: '#9C27B0', regular: '#4CAF50' };
            const catColor = catColorMap[catLC] ?? '#757575';
            return (
              <Card key={room.id} sx={{ width: 260, borderLeft: `4px solid ${catColor}` }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  {room.media_url && (
                    <Box sx={{ width: '100%', height: 100, borderRadius: 1, overflow: 'hidden', mb: 1 }}>
                      {room.media_type === 'video' ? (
                        <video src={room.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      ) : (
                        <img src={room.media_url} alt={`Room ${room.room_number}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </Box>
                  )}

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" fontWeight={700}>Room {room.room_number}</Typography>
                    <Chip size="small" label={room.status} color={ROOM_STATUS_COLORS[room.status] ?? 'default'} />
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <Chip size="small" label={room.category} sx={{ bgcolor: catColor, color: '#fff', fontSize: 11 }} />
                    {room.floor_section && <Chip size="small" label={room.floor_section} variant="outlined" />}
                  </Stack>

                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    <strong>{fmt(room.cost_amount)}</strong>{' '}
                    <Typography component="span" variant="caption" color="text.secondary">
                      / {room.cost_duration}
                    </Typography>
                  </Typography>

                  <Typography variant="caption" color="text.secondary" display="block">
                    Max {room.max_occupants} occupant{room.max_occupants !== 1 ? 's' : ''}
                  </Typography>

                  {room.benefits?.length > 0 && (
                    <Stack direction="row" spacing={0.3} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                      {room.benefits.map((b: string, i: number) => (
                        <Chip key={i} size="small" label={b} variant="outlined" sx={{ fontSize: 10, mb: 0.3 }} />
                      ))}
                    </Stack>
                  )}

                  <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                    <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => openEdit(room)}>Edit</Button>
                    <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => handleDelete(room.id)}>Delete</Button>
                    {room.status === 'occupied' && (
                      <Tooltip title="Check out guests and free this room">
                        <Button
                          size="small" variant="outlined" color="warning"
                          startIcon={<ExitToAppIcon />}
                          onClick={() => { setFreeDialogRoom(room); setFreeDialogPeople(1); setFreeDialog(true); }}
                        >
                          Free
                        </Button>
                      </Tooltip>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {total > 0 && (
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPageSize(+e.target.value); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}

      {/* Create / Edit Room Dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRoom ? 'Edit Room' : 'Create New Room'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* File Upload */}
            <Box>
              <Button
                variant="outlined" component="label" startIcon={<CloudUploadIcon />}
                disabled={uploading} fullWidth
              >
                {uploading ? 'Uploading…' : 'Upload Image/Video (max 5MB)'}
                <input type="file" hidden accept="image/*,video/*" onChange={handleFileUpload} />
              </Button>
              {form.media_url && (
                <Box sx={{ mt: 1, position: 'relative' }}>
                  {form.media_type === 'video' ? (
                    <video src={form.media_url} style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 8 }} controls />
                  ) : (
                    <img src={form.media_url} alt="Room" style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 8 }} />
                  )}
                  <IconButton
                    size="small" sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'background.paper' }}
                    onClick={() => setForm({ ...form, media_url: '', media_type: '' })}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
            </Box>

            <TextField
              label="Room Number *" fullWidth
              value={form.room_number}
              onChange={(e) => setForm({ ...form, room_number: e.target.value })}
            />

            <TextField
              label="Floor / Section (optional)" fullWidth
              value={form.floor_section}
              onChange={(e) => setForm({ ...form, floor_section: e.target.value })}
            />

            <TextField
              label="Max Occupants *" type="number" fullWidth
              value={form.max_occupants}
              onChange={(e) => setForm({ ...form, max_occupants: Math.max(1, Number(e.target.value)) })}
              inputProps={{ min: 1 }}
            />

            {/* Category */}
            <FormControl fullWidth>
              <InputLabel>Category *</InputLabel>
              <Select
                value={form.category}
                label="Category *"
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {ROOM_CATEGORIES.map((cat) => (
                  <MuiMenuItem key={cat} value={cat}>{cat}</MuiMenuItem>
                ))}
                <MuiMenuItem value="Custom">Custom</MuiMenuItem>
              </Select>
            </FormControl>

            {form.category === 'Custom' && (
              <TextField
                label="Custom Category Name" fullWidth
                value={form.custom_category}
                onChange={(e) => setForm({ ...form, custom_category: e.target.value })}
                placeholder="e.g. Penthouse, Suite"
              />
            )}

            {/* Cost */}
            <Stack direction="row" spacing={1}>
              <TextField
                label="Cost *" type="number" sx={{ flex: 1 }}
                value={form.cost_amount}
                onChange={(e) => setForm({ ...form, cost_amount: e.target.value })}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <FormControl sx={{ minWidth: 140 }}>
                <InputLabel>Duration *</InputLabel>
                <Select
                  value={form.cost_duration}
                  label="Duration *"
                  onChange={(e) => setForm({ ...form, cost_duration: e.target.value })}
                >
                  {COST_DURATIONS.map((d) => (
                    <MuiMenuItem key={d.value} value={d.value}>{d.label}</MuiMenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            {/* Benefits */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Benefits</Typography>
              <Stack direction="row" spacing={0.5} sx={{ mb: 1, flexWrap: 'wrap' }}>
                {form.benefits.map((b, i) => (
                  <Chip key={i} label={b} onDelete={() => removeBenefit(i)} size="small" sx={{ mb: 0.5 }} />
                ))}
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small" fullWidth placeholder="e.g. Free WiFi, Free Meal"
                  value={form.new_benefit}
                  onChange={(e) => setForm({ ...form, new_benefit: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBenefit(); } }}
                />
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addBenefit}>Add</Button>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {editingRoom ? 'Update' : 'Create Room'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Free Room Dialog — record guests checking out */}
      <Dialog open={freeDialog} onClose={() => { setFreeDialog(false); setFreeDialogRoom(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <ExitToAppIcon />
            <Typography variant="h6">Free Room {freeDialogRoom?.room_number}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {freeDialogRoom && (
              <Alert severity="info">
                Room {freeDialogRoom.room_number} currently has{' '}
                <strong>{freeDialogRoom.current_occupants ?? 0}</strong>
                {' '}guest{(freeDialogRoom.current_occupants ?? 0) !== 1 ? 's' : ''}.
                When all guests leave the room becomes available automatically.
              </Alert>
            )}
            <TextField
              label="Number of guests checking out *"
              type="number"
              fullWidth
              value={freeDialogPeople}
              onChange={(e) => setFreeDialogPeople(Math.max(1, Number(e.target.value)))}
              inputProps={{ min: 1, max: freeDialogRoom?.current_occupants ?? 99 }}
              slotProps={{ input: { startAdornment: <PeopleIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setFreeDialog(false); setFreeDialogRoom(null); }}>Cancel</Button>
          <Button
            variant="contained" color="warning"
            startIcon={<ExitToAppIcon />}
            disabled={freeLoading}
            onClick={handleFreeRoom}
          >
            {freeLoading ? 'Processing…' : 'Confirm Check-out'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Tab 5 — Request for Items
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
      {subTab === 0 && <AccomRequisitionsSubTab branchId={branchId} />}
      {subTab === 1 && <AccomInternalStoreSubTab branchId={branchId} />}
    </Box>
  );
}

/* ─── Accommodation Requisitions Sub-Tab ─── */
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

function AccomRequisitionsSubTab({ branchId }: { branchId: string }) {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState('today');
  const [statusFilter, setStatusFilter] = useState('');

  const [dialog, setDialog] = useState(false);
  const [editingRequest, setEditingRequest] = useState<any>(null);
  const [form, setForm] = useState({ notes: '', items: [{ inventory_item_id: '', quantity_requested: 1 }] });
  const [saving, setSaving] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [returnDialog, setReturnDialog] = useState<string | null>(null);
  const [returnNotes, setReturnNotes] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [receiveDialog, setReceiveDialog] = useState<any>(null);
  const [receiveItems, setReceiveItems] = useState<any[]>([]);

  const { data: invData } = useApi<{ items: any[] }>('inventory', 'items', { page_size: '200' }, [branchId]);
  const inventoryItems = invData?.items ?? [];

  const fetchRequests = useCallback(async () => {
    try {
      const params: Record<string, string> = {
        page: String(page + 1), page_size: String(pageSize),
        date_range: dateRange, station: 'accommodation',
      };
      if (statusFilter) params.status = statusFilter;
      const data = await api<{ items: any[]; total: number }>('inventory', 'ingredient-requests', { params, branchId });
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
          body: { notes: form.notes || undefined, items: validItems, station: 'accommodation' },
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
          items: receiveItems.map((i) => ({ id: i.id, quantity_received: Number(i.quantity_received) })),
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
      toast.success('Return requested');
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

      {requests.length === 0 && !loading ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No ingredient requests found</Typography>
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
                              onClick={() => openReceive(req)} disabled={actionLoading === req.id}>Receive</Button>
                          )}
                          {canReturn && (
                            <Button size="small" variant="outlined" color="warning" startIcon={<UndoIcon />}
                              onClick={() => { setReturnDialog(req.id); setReturnNotes(''); }}
                              disabled={actionLoading === req.id}>Return</Button>
                          )}
                          {status === 'return_requested' && (
                            <Chip size="small" label="Return Pending" color="warning" variant="outlined" />
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
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
                                <Typography variant="caption" color="text.secondary">Response notes: {req.response_notes}</Typography>
                              )}
                              {req.disbursed_at && (
                                <Typography variant="caption" color="text.secondary">Disbursed: {new Date(req.disbursed_at).toLocaleString()}</Typography>
                              )}
                              {req.received_at && (
                                <Typography variant="caption" color="text.secondary">Received: {new Date(req.received_at).toLocaleString()}</Typography>
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
          <Alert severity="info" sx={{ mb: 2 }}>Confirm the actual quantity received for each item.</Alert>
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
   Accommodation Internal Store Sub-Tab
   ═══════════════════════════════════════════════════════════════════════════ */

const ACCOM_INTERNAL_VIEW_TABS = ['Current Stock', 'Sales Log', 'Movement Log'] as const;

const ACCOM_MOVEMENT_TYPE_LABELS: Record<string, string> = {
  received: 'Received from Inventory',
  returned_to_inventory: 'Returned to Inventory',
  sale: 'Sale',
  cancel_sale: 'Cancelled Sale',
};

const ACCOM_MOVEMENT_TYPE_COLORS: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  received: 'success', returned_to_inventory: 'error', sale: 'warning', cancel_sale: 'info',
};

function AccomInternalStoreSubTab({ branchId }: { branchId: string }) {
  const [view, setView] = useState(0);

  return (
    <Box>
      <ToggleButtonGroup size="small" value={view} exclusive onChange={(_, v) => { if (v !== null) setView(v); }} sx={{ mb: 2 }}>
        {ACCOM_INTERNAL_VIEW_TABS.map((label, i) => (
          <ToggleButton key={label} value={i}>{label}</ToggleButton>
        ))}
      </ToggleButtonGroup>
      {view === 0 && <AccomStockView branchId={branchId} />}
      {view === 1 && <AccomSalesView branchId={branchId} />}
      {view === 2 && <AccomMovementsView branchId={branchId} />}
    </Box>
  );
}

function AccomStockView({ branchId }: { branchId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');

  const fetchItems = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page + 1), page_size: String(pageSize) };
      if (search) params.search = search;
      const data = await api<{ items: any[]; total: number }>('accommodation', 'internal-store', { params, branchId });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, search]);

  useEffect(() => { setLoading(true); fetchItems(); }, [fetchItems]);

  if (loading && items.length === 0) return <LinearProgress />;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search items…" sx={{ minWidth: 220 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <Typography variant="body2" color="text.secondary">{total} item{total !== 1 ? 's' : ''} in store</Typography>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {items.length === 0 && !loading ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No items in the accommodation store yet. Items are automatically added when ingredient requests are received from inventory.
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item Name</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell align="right">Cost Price</TableCell>
                <TableCell align="right">Selling Price</TableCell>
                <TableCell>Barcode</TableCell>
                <TableCell width={160}>Last Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell><Typography variant="body2" fontWeight={600}>{item.item_name}</Typography></TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={600} color={Number(item.quantity) <= 0 ? 'error.main' : Number(item.quantity) < 5 ? 'warning.main' : 'text.primary'}>
                      {Number(item.quantity).toFixed(item.unit === 'pcs' ? 0 : 2)}
                    </Typography>
                  </TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell align="right"><Typography color="text.secondary">{item.cost_per_unit ? formatCurrency(item.cost_per_unit, 'USD') : '—'}</Typography></TableCell>
                  <TableCell align="right"><Typography fontWeight={600} color="primary.main">{item.selling_price ? formatCurrency(item.selling_price, 'USD') : '—'}</Typography></TableCell>
                  <TableCell>{item.barcode ?? '—'}</TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{new Date(item.updated_at).toLocaleString()}</Typography></TableCell>
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

function AccomSalesView({ branchId }: { branchId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState('today');

  const fetchSales = useCallback(async () => {
    try {
      const data = await api<{ items: any[]; total: number }>('accommodation', 'internal-store-sales', {
        params: { page: String(page + 1), page_size: String(pageSize), date_range: dateRange },
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
                  <TableCell><Typography variant="body2" fontWeight={600}>{s.accom_store_items?.item_name ?? '—'}</Typography></TableCell>
                  <TableCell align="right"><Typography fontWeight={600}>{Number(s.quantity).toFixed(2)}</Typography></TableCell>
                  <TableCell>{s.unit ?? s.accom_store_items?.unit ?? ''}</TableCell>
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

function AccomMovementsView({ branchId }: { branchId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState('today');

  const fetchMovements = useCallback(async () => {
    try {
      const data = await api<{ items: any[]; total: number }>('accommodation', 'internal-store-movements', {
        params: { page: String(page + 1), page_size: String(pageSize), date_range: dateRange },
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
                const change = Number(m.quantity_change);
                const isPositive = change > 0;
                return (
                  <TableRow key={m.id} hover>
                    <TableCell><Typography variant="body2" fontWeight={600}>{m.accom_store_items?.item_name ?? '—'}</Typography></TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined"
                        label={ACCOM_MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type?.replace(/_/g, ' ')}
                        color={ACCOM_MOVEMENT_TYPE_COLORS[m.movement_type] ?? 'default'} />
                    </TableCell>
                    <TableCell align="right">
                      <Typography color={isPositive ? 'success.main' : 'error.main'} fontWeight={600}>{isPositive ? '+' : ''}{change}</Typography>
                    </TableCell>
                    <TableCell align="right">{Number(m.quantity_before).toFixed(2)}</TableCell>
                    <TableCell align="right">{Number(m.quantity_after).toFixed(2)}</TableCell>
                    <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{m.notes ?? '—'}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{m.performed_by_name}</Typography></TableCell>
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
