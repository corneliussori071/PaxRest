import React, { useEffect, useState } from 'react';
import {
  Box, Grid, Typography, Chip, TextField, Button, Divider,
  IconButton, Paper, Tabs, Tab, Badge, Select, MenuItem,
  FormControl, InputLabel, Dialog, DialogTitle, DialogContent,
  DialogActions, List, ListItem, ListItemButton, ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import toast from 'react-hot-toast';
import { formatCurrency } from '@paxrest/shared-utils';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import { useMenuStore, useCartStore, type CartItem } from '@/stores';
import type { MenuCategoryWithItems, MenuItemWithDetails } from '@paxrest/shared-types';

export default function POSTerminalPage() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const { categories, loading: menuLoading, fetchMenu } = useMenuStore();
  const cart = useCartStore();

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [customerDialog, setCustomerDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const fmt = (n: number) => formatCurrency(n, currency);

  useEffect(() => {
    if (activeBranchId) fetchMenu(activeBranchId);
  }, [activeBranchId]);

  useEffect(() => {
    if (categories.length && !activeCat) setActiveCat(categories[0].id);
  }, [categories]);

  // Filter items
  const activeCategory = categories.find((c) => c.id === activeCat);
  const allItems = categories.flatMap((c) => c.items ?? []);
  const displayItems = search
    ? allItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : activeCategory?.items ?? [];

  const handleAddItem = (item: MenuItemWithDetails) => {
    // If variants exist, we could open a variant picker — for now, pick first / default
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
        {/* Search */}
        <TextField
          size="small" fullWidth placeholder="Search menu…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          sx={{ mb: 1.5 }}
        />

        {/* Category Tabs */}
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

        {/* Item Grid */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Grid container spacing={1.5}>
            {displayItems.map((item) => {
              const firstVariant = item.variants?.[0];
              const price = firstVariant ? item.base_price + (firstVariant.price_adjustment ?? 0) : item.base_price;
              return (
                <Grid size={{ xs: 6, sm: 4, md: 3 }} key={item.id}>
                  <Paper
                    onClick={() => handleAddItem(item as MenuItemWithDetails)}
                    sx={{
                      p: 1.5, cursor: 'pointer', textAlign: 'center',
                      opacity: item.is_available ? 1 : 0.4,
                      '&:hover': { boxShadow: 3, borderColor: 'primary.main' },
                      transition: 'all 0.15s',
                      border: '1px solid', borderColor: 'divider',
                      borderRadius: 2,
                    }}
                  >
                    {item.image_url && (
                      <Box
                        component="img" src={item.image_url} alt={item.name}
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
            cart.items.map((item, i) => (
              <Box key={i} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {item.name}{item.variantName ? ` (${item.variantName})` : ''}
                    </Typography>
                    {item.modifiers.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {item.modifiers.map((m) => m.name).join(', ')}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="body2" fontWeight={600}>
                    {fmt((item.basePrice + item.modifiers.reduce((s, m) => s + m.price, 0)) * item.quantity)}
                  </Typography>
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
            ))
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
    </Box>
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
