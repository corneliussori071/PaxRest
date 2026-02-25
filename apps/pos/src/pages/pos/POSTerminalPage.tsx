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
import toast from 'react-hot-toast';
import { formatCurrency, MEAL_AVAILABILITY_LABELS } from '@paxrest/shared-utils';
import type { MealAvailability } from '@paxrest/shared-types';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/hooks';
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

      await api('orders', 'create', {
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

      toast.success('Order placed!');
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
              onClick={() => cart.setOrderType(t)}
              size="small"
            />
          ))}
        </Box>

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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" fontWeight={700}>Total</Typography>
          <Typography variant="h6" fontWeight={700} color="primary">{fmt(cart.total())}</Typography>
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
          {submitting ? 'Placing Order…' : `Place Order — ${fmt(cart.total())}`}
        </Button>
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
