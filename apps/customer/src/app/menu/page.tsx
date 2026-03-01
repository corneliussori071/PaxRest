'use client';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent, CardMedia,
  Chip, Stack, TextField, InputAdornment, Skeleton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio,
  Checkbox, Divider, Alert, Tabs, Tab, CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import BlockIcon from '@mui/icons-material/Block';
import { publicApi } from '@/lib/supabase';
import { useCartStore, type CartItemRemovedIngredient, type CartItemExtra } from '@/stores/cart';
import { formatCurrency } from '@paxrest/shared-utils';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/* Types (mirror the API response shapes)                              */
/* ------------------------------------------------------------------ */
interface MenuVariant { id: string; label: string; price_adjustment: number; is_default: boolean; }
interface Modifier { id: string; name: string; price: number; is_default: boolean; }
interface ModifierGroup { id: string; name: string; min_select: number; max_select: number; modifiers: Modifier[]; }
interface Ingredient { id: string; name: string; cost_contribution: number; inventory_item_name?: string; }
interface Extra { id: string; name: string; price: number; }
interface MenuItem {
  id: string; name: string; description: string | null; base_price: number;
  image_url: string | null; media_url: string | null; media_type: string | null;
  tags: string[]; is_available: boolean; sort_order: number;
  availability_status: 'available' | 'sold_out' | 'limited' | 'preorder';
  calories?: number;
  variants: MenuVariant[]; modifier_groups: ModifierGroup[];
  ingredients: Ingredient[]; extras: Extra[];
  available_quantity?: number;
}
interface MenuCategory { id: string; name: string; description: string | null; sort_order: number; items: MenuItem[]; }

/* ------------------------------------------------------------------ */
/* Page component                                                      */
/* ------------------------------------------------------------------ */
export default function MenuPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Customization dialog
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
  const [removedIngredientIds, setRemovedIngredientIds] = useState<Set<string>>(new Set());
  const [selectedExtraIds, setSelectedExtraIds] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(1);
  // Menu view tab: 0=All, 1=Available Now
  const [menuTab, setMenuTab] = useState(0);
  // Special request dialog
  const [specialItem, setSpecialItem] = useState<MenuItem | null>(null);

  const addItem = useCartStore((s) => s.addItem);
  const branchId = useCartStore((s) => s.branchId);

  // Fetch full menu via public API (requires branchId)
  const fetchMenu = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await publicApi<{ menu: MenuCategory[] }>(`/menu/public-menu?branch_id=${encodeURIComponent(branchId)}`);
      const cats = res.data?.menu ?? [];
      setCategories(cats);
      if (cats.length > 0) setActiveCategory(cats[0].id);
    } catch {
      toast.error('Failed to load menu');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  // Filtered items
  const filteredCategories = useMemo(() => {
    let cats = categories;
    // Available Now tab: only items with available_quantity > 0
    if (menuTab === 1) {
      cats = cats.map((c) => ({
        ...c,
        items: c.items.filter((i) => (i.available_quantity ?? 0) > 0),
      })).filter((c) => c.items.length > 0);
    }
    if (!search.trim()) return cats;
    const q = search.toLowerCase();
    return cats.map((c) => ({
      ...c,
      items: c.items.filter(
        (i) => i.name.toLowerCase().includes(q) || i.tags?.some((t) => t.toLowerCase().includes(q)),
      ),
    })).filter((c) => c.items.length > 0);
  }, [categories, search, menuTab]);

  // ---------- Dialog helpers ----------
  const openCustomize = (item: MenuItem) => {
    if (item.availability_status === 'sold_out') {
      toast.error('This item is currently sold out');
      return;
    }
    setSelectedItem(item);
    const defaultVariant = item.variants.find((v) => v.is_default) || item.variants[0];
    setSelectedVariant(defaultVariant?.id ?? null);
    const mods: Record<string, string[]> = {};
    item.modifier_groups.forEach((g) => {
      mods[g.id] = g.modifiers.filter((m) => m.is_default).map((m) => m.id);
    });
    setSelectedModifiers(mods);
    setRemovedIngredientIds(new Set());
    setSelectedExtraIds(new Set());
    setQty(1);
  };

  const computeItemPrice = () => {
    if (!selectedItem) return 0;
    let price = selectedItem.base_price;
    const variant = selectedItem.variants.find((v) => v.id === selectedVariant);
    if (variant) price += variant.price_adjustment;
    // Modifiers
    Object.entries(selectedModifiers).forEach(([gId, mIds]) => {
      const group = selectedItem.modifier_groups.find((g) => g.id === gId);
      mIds.forEach((mId) => {
        const mod = group?.modifiers.find((m) => m.id === mId);
        if (mod) price += mod.price;
      });
    });
    // Extras
    selectedItem.extras?.forEach((ext) => {
      if (selectedExtraIds.has(ext.id)) price += ext.price;
    });
    // Ingredient discount
    selectedItem.ingredients?.forEach((ing) => {
      if (removedIngredientIds.has(ing.id)) price -= ing.cost_contribution ?? 0;
    });
    return Math.max(0, price);
  };

  const handleAddToCart = () => {
    if (!selectedItem) return;
    const variant = selectedItem.variants.find((v) => v.id === selectedVariant);
    const modifiers = Object.entries(selectedModifiers).flatMap(([gId, mIds]) => {
      const group = selectedItem.modifier_groups.find((g) => g.id === gId);
      return mIds.map((mId) => {
        const mod = group?.modifiers.find((m) => m.id === mId);
        return { id: mId, name: mod?.name ?? '', price: mod?.price ?? 0, groupName: group?.name ?? '' };
      });
    });

    const removedIngredients: CartItemRemovedIngredient[] = (selectedItem.ingredients ?? [])
      .filter((i) => removedIngredientIds.has(i.id))
      .map((i) => ({ ingredient_id: i.id, name: i.name || i.inventory_item_name || '', cost_contribution: i.cost_contribution ?? 0 }));

    const selectedExtras: CartItemExtra[] = (selectedItem.extras ?? [])
      .filter((e) => selectedExtraIds.has(e.id))
      .map((e) => ({ id: e.id, name: e.name, price: e.price }));

    addItem({
      menuItemId: selectedItem.id,
      name: selectedItem.name,
      basePrice: selectedItem.base_price,
      variantId: variant?.id,
      variantLabel: variant?.label,
      variantPriceAdjustment: variant?.price_adjustment ?? 0,
      modifiers,
      quantity: qty,
      notes: '',
      removedIngredients: removedIngredients.length > 0 ? removedIngredients : undefined,
      selectedExtras: selectedExtras.length > 0 ? selectedExtras : undefined,
    });
    toast.success(`${selectedItem.name} added to cart`);
    setSelectedItem(null);
  };

  const toggleModifier = (groupId: string, modId: string, maxSelect: number) => {
    setSelectedModifiers((prev) => {
      const current = prev[groupId] || [];
      if (current.includes(modId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== modId) };
      }
      if (maxSelect === 1) return { ...prev, [groupId]: [modId] };
      if (current.length >= maxSelect) return prev;
      return { ...prev, [groupId]: [...current, modId] };
    });
  };

  const toggleIngredient = (id: string) => {
    setRemovedIngredientIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExtra = (id: string) => {
    setSelectedExtraIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton variant="rounded" height={48} sx={{ mb: 3 }} />
        <Grid container spacing={3}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
              <Skeleton variant="rounded" height={240} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* View tabs: All Menu / Available Now */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Tabs value={menuTab} onChange={(_, v) => setMenuTab(v)} sx={{ minHeight: 36 }}>
          <Tab label="All Menu" sx={{ minHeight: 36, py: 0.5 }} />
          <Tab
            label={
              <Stack direction="row" spacing={0.5} alignItems="center">
                <span>Available Now</span>
                <Chip
                  size="small" label="Ready"
                  color="success" variant="filled"
                  sx={{ height: 20, fontSize: '0.65rem' }}
                />
              </Stack>
            }
            sx={{ minHeight: 36, py: 0.5 }}
          />
        </Tabs>
        <Button
          variant="outlined"
          color="secondary"
          size="small"
          onClick={() => setSpecialItem(categories.flatMap((c) => c.items)[0] ?? null)}
          disabled={categories.flatMap((c) => c.items).length === 0}
        >
          🍽️ Request Special Meal
        </Button>
      </Box>

      {/* Search & Category Chips */}
      <TextField
        fullWidth placeholder="Search menu…" size="small" sx={{ mb: 2 }}
        value={search} onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> },
        }}
      />
      <Stack direction="row" spacing={1} sx={{ mb: 3, overflowX: 'auto', pb: 1 }}>
        {categories.map((c) => (
          <Chip
            key={c.id} label={c.name}
            color={activeCategory === c.id ? 'primary' : 'default'}
            variant={activeCategory === c.id ? 'filled' : 'outlined'}
            onClick={() => {
              setActiveCategory(c.id);
              document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        ))}
      </Stack>

      {/* Menu Grid */}
      {filteredCategories.map((cat) => (
        <Box key={cat.id} id={`cat-${cat.id}`} sx={{ mb: 5 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>{cat.name}</Typography>
          {cat.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{cat.description}</Typography>}

          <Grid container spacing={2}>
            {cat.items.map((item) => {
              const isSoldOut = item.availability_status === 'sold_out';
              const isLimited = item.availability_status === 'limited';
              const mediaUrl = item.media_url || item.image_url;
              const isVideo = item.media_type === 'video';

              return (
                <Grid key={item.id} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card
                    sx={{
                      cursor: isSoldOut ? 'not-allowed' : 'pointer',
                      height: '100%', display: 'flex', flexDirection: 'column',
                      '&:hover': isSoldOut ? {} : { boxShadow: 4 },
                      transition: 'box-shadow 0.2s',
                      opacity: isSoldOut ? 0.5 : 1,
                      position: 'relative',
                    }}
                    onClick={() => openCustomize(item)}
                  >
                    {/* Availability badge */}
                    {isSoldOut && (
                      <Chip
                        icon={<BlockIcon />} label="Sold Out" color="error" size="small"
                        sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, fontWeight: 700 }}
                      />
                    )}
                    {isLimited && (
                      <Chip
                        label="Limited" color="warning" size="small"
                        sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, fontWeight: 700 }}
                      />
                    )}
                    {(item.available_quantity ?? 0) > 0 && !isSoldOut && (
                      <Chip
                        label={`${item.available_quantity} ready`} color="success" size="small"
                        sx={{ position: 'absolute', top: 8, left: 8, zIndex: 1, fontWeight: 700 }}
                      />
                    )}

                    <Box sx={{ height: 160, bgcolor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {mediaUrl ? (
                        isVideo ? (
                          <Box
                            component="video" src={mediaUrl} muted loop autoPlay playsInline
                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <CardMedia component="img" image={mediaUrl} alt={item.name} sx={{ height: '100%', objectFit: 'cover' }} />
                        )
                      ) : (
                        <Typography sx={{ fontSize: 48 }}>🍽️</Typography>
                      )}
                    </Box>
                    <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="subtitle1" fontWeight={600}>{item.name}</Typography>
                      {item.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', display: '-webkit-box', overflow: 'hidden' }}>
                          {item.description}
                        </Typography>
                      )}
                      {item.calories && (
                        <Typography variant="caption" color="text.secondary">{item.calories} cal</Typography>
                      )}
                      {/* Ingredients preview */}
                      {item.ingredients?.length > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                          {item.ingredients.map((i) => i.name || i.inventory_item_name).join(', ')}
                        </Typography>
                      )}
                      <Box sx={{ mt: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1 }}>
                        <Typography variant="subtitle1" fontWeight={700} color="primary">
                          {formatCurrency(item.base_price)}
                          {item.variants.length > 1 && '+'}
                        </Typography>
                        {!isSoldOut && <Chip label="Add" size="small" color="primary" icon={<AddIcon />} />}
                      </Box>
                      {item.tags?.length > 0 && (
                        <Stack direction="row" spacing={0.5} mt={1} flexWrap="wrap">
                          {item.tags.map((t) => <Chip key={t} label={t} size="small" variant="outlined" />)}
                        </Stack>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      ))}

      {filteredCategories.length === 0 && (
        <Box textAlign="center" py={8}>
          <Typography variant="h6" color="text.secondary">No items found</Typography>
        </Box>
      )}

      {/* ---- Customization Dialog ---- */}
      <Dialog open={!!selectedItem} onClose={() => setSelectedItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {selectedItem?.name}
          <IconButton onClick={() => setSelectedItem(null)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {/* Media */}
          {selectedItem?.media_url && (
            <Box sx={{ mb: 2, borderRadius: 2, overflow: 'hidden', maxHeight: 200 }}>
              {selectedItem.media_type === 'video' ? (
                <Box component="video" src={selectedItem.media_url} controls muted autoPlay sx={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
              ) : (
                <Box component="img" src={selectedItem.media_url} alt={selectedItem.name} sx={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
              )}
            </Box>
          )}

          {selectedItem?.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{selectedItem.description}</Typography>
          )}

          {selectedItem?.calories && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              {selectedItem.calories} calories
            </Typography>
          )}

          {/* Variants */}
          {selectedItem && selectedItem.variants.length > 1 && (
            <Box sx={{ mb: 3 }}>
              <FormControl>
                <FormLabel sx={{ fontWeight: 600, mb: 1 }}>Size / Variant</FormLabel>
                <RadioGroup
                  value={selectedVariant ?? ''}
                  onChange={(e) => setSelectedVariant(e.target.value)}
                >
                  {selectedItem.variants.map((v) => (
                    <FormControlLabel
                      key={v.id} value={v.id}
                      control={<Radio />}
                      label={`${v.label} ${v.price_adjustment > 0 ? `(+${formatCurrency(v.price_adjustment)})` : v.price_adjustment < 0 ? `(${formatCurrency(v.price_adjustment)})` : ''}`}
                    />
                  ))}
                </RadioGroup>
              </FormControl>
            </Box>
          )}

          {/* Modifier Groups */}
          {selectedItem?.modifier_groups.map((g) => (
            <Box key={g.id} sx={{ mb: 3 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                {g.name}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {g.min_select > 0 ? `Required — pick ${g.min_select === g.max_select ? g.min_select : `${g.min_select}-${g.max_select}`}` : `Optional — up to ${g.max_select}`}
                </Typography>
              </Typography>
              {g.max_select === 1 ? (
                <RadioGroup
                  value={(selectedModifiers[g.id] || [])[0] ?? ''}
                  onChange={(e) => toggleModifier(g.id, e.target.value, 1)}
                >
                  {g.modifiers.map((m) => (
                    <FormControlLabel
                      key={m.id} value={m.id} control={<Radio />}
                      label={`${m.name}${m.price > 0 ? ` (+${formatCurrency(m.price)})` : ''}`}
                    />
                  ))}
                </RadioGroup>
              ) : (
                g.modifiers.map((m) => (
                  <FormControlLabel
                    key={m.id}
                    control={
                      <Checkbox
                        checked={(selectedModifiers[g.id] || []).includes(m.id)}
                        onChange={() => toggleModifier(g.id, m.id, g.max_select)}
                      />
                    }
                    label={`${m.name}${m.price > 0 ? ` (+${formatCurrency(m.price)})` : ''}`}
                  />
                ))
              )}
            </Box>
          ))}

          {/* Ingredients — remove to get discount */}
          {selectedItem?.ingredients && selectedItem.ingredients.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Ingredients
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  Uncheck to remove — price adjusts accordingly
                </Typography>
              </Typography>
              {selectedItem.ingredients.map((ing) => (
                <FormControlLabel
                  key={ing.id}
                  control={
                    <Checkbox
                      checked={!removedIngredientIds.has(ing.id)}
                      onChange={() => toggleIngredient(ing.id)}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {ing.name || ing.inventory_item_name}
                      {(ing.cost_contribution ?? 0) > 0 && (
                        <Typography component="span" variant="caption" color="error.main">
                          {' '}(−{formatCurrency(ing.cost_contribution)} if removed)
                        </Typography>
                      )}
                    </Typography>
                  }
                  sx={{ display: 'block' }}
                />
              ))}
            </Box>
          )}

          {/* Extras — add for extra cost */}
          {selectedItem?.extras && selectedItem.extras.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Extras
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  Add extras to your order
                </Typography>
              </Typography>
              {selectedItem.extras.map((ext) => (
                <FormControlLabel
                  key={ext.id}
                  control={
                    <Checkbox
                      checked={selectedExtraIds.has(ext.id)}
                      onChange={() => toggleExtra(ext.id)}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {ext.name}
                      <Typography component="span" variant="caption" color="success.main">
                        {' '}+{formatCurrency(ext.price)}
                      </Typography>
                    </Typography>
                  }
                  sx={{ display: 'block' }}
                />
              ))}
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Quantity */}
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography fontWeight={600}>Quantity:</Typography>
            <IconButton onClick={() => setQty((q) => Math.max(1, q - 1))} size="small"><RemoveIcon /></IconButton>
            <Typography variant="h6" fontWeight={700}>{qty}</Typography>
            <IconButton onClick={() => setQty((q) => q + 1)} size="small"><AddIcon /></IconButton>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mr: 'auto' }}>
            {formatCurrency(computeItemPrice() * qty)}
          </Typography>
          <Button variant="contained" startIcon={<ShoppingCartIcon />} onClick={handleAddToCart} size="large">
            Add to Cart
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Special Request Dialog ── */}
      <SpecialRequestDialog
        open={Boolean(specialItem)}
        allItems={categories.flatMap((c) => c.items)}
        initialItem={specialItem}
        onClose={() => setSpecialItem(null)}
      />
    </Container>
  );
}

// ────────────────────────────────────────────────────────────
// SpecialRequestDialog
// ────────────────────────────────────────────────────────────
interface SRProps {
  open: boolean;
  allItems: MenuItem[];
  initialItem: MenuItem | null;
  onClose: () => void;
}

function SpecialRequestDialog({ open, allItems, initialItem, onClose }: SRProps) {
  const branchId = useCartStore((s) => s.branchId);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [removeIngredients, setRemoveIngredients] = useState<Set<string>>(new Set());
  const [addExtras, setAddExtras] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const item = useMemo(
    () => allItems.find((i) => i.id === selectedItemId) ?? null,
    [allItems, selectedItemId],
  );

  // When dialog opens, pre-select the passed item
  useEffect(() => {
    if (open && initialItem) {
      setSelectedItemId(initialItem.id);
      setRemoveIngredients(new Set());
      setAddExtras(new Set());
      setNotes('');
    }
  }, [open, initialItem]);

  const toggleIngredient = (id: string) =>
    setRemoveIngredients((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const toggleExtra = (id: string) =>
    setAddExtras((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const handleSubmit = async () => {
    if (!item || !branchId || !name.trim() || !phone.trim()) {
      toast.error('Please fill in your name and phone number.');
      return;
    }
    setSubmitting(true);
    try {
      const removed = [...removeIngredients].map((id) => {
        const ing = item.ingredients.find((i) => i.id === id);
        return ing?.name || ing?.inventory_item_name || id;
      });
      const extras = [...addExtras].map((id) => item.extras.find((e) => e.id === id)?.name || id);

      const lines = [
        removed.length > 0 ? `Remove: ${removed.join(', ')}` : null,
        extras.length > 0 ? `Add extras: ${extras.join(', ')}` : null,
        notes.trim() ? `Notes: ${notes.trim()}` : null,
      ].filter(Boolean);

      const { error } = await publicApi('/customer/special-request', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          item_id: item.id,
          item_name: item.name,
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          special_request_notes: lines.join(' | '),
        }),
      });
      if (error) throw new Error(typeof error === 'string' ? error : (error as { message: string }).message);
      toast.success('Special meal request submitted! Staff will contact you.');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>🍽️ Request a Special Meal</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info" sx={{ fontSize: '0.82rem' }}>
            Tell us how you'd like your meal prepared. Staff will review and confirm your order.
          </Alert>

          {/* Item picker */}
          <FormControl fullWidth size="small">
            <FormLabel sx={{ mb: 0.5, fontSize: '0.85rem', fontWeight: 600 }}>Based on menu item</FormLabel>
            <TextField
              select size="small" value={selectedItemId}
              onChange={(e) => { setSelectedItemId(e.target.value); setRemoveIngredients(new Set()); setAddExtras(new Set()); }}
              SelectProps={{ native: true }}
            >
              {allItems.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </TextField>
          </FormControl>

          {/* Ingredients to remove */}
          {item && item.ingredients.length > 0 && (
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Remove ingredients:</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {item.ingredients.map((ing) => (
                  <FormControlLabel
                    key={ing.id}
                    control={
                      <Checkbox
                        size="small"
                        checked={removeIngredients.has(ing.id)}
                        onChange={() => toggleIngredient(ing.id)}
                        color="error"
                      />
                    }
                    label={<Typography variant="body2">{ing.name || ing.inventory_item_name}</Typography>}
                    sx={{ mr: 0, my: 0 }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* Extras to add */}
          {item && item.extras.length > 0 && (
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Add extras:</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {item.extras.map((ext) => (
                  <FormControlLabel
                    key={ext.id}
                    control={
                      <Checkbox
                        size="small"
                        checked={addExtras.has(ext.id)}
                        onChange={() => toggleExtra(ext.id)}
                        color="success"
                      />
                    }
                    label={<Typography variant="body2">{ext.name} (+{formatCurrency(ext.price)})</Typography>}
                    sx={{ mr: 0, my: 0 }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* Free-text notes */}
          <TextField
            label="Additional requests" multiline minRows={2} fullWidth size="small"
            placeholder="E.g. extra spicy, less salt, nut allergy…"
            value={notes} onChange={(e) => setNotes(e.target.value)}
          />

          <Divider />

          {/* Contact info */}
          <Typography variant="body2" fontWeight={600}>Your contact details (required)</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              label="Name" size="small" fullWidth required
              value={name} onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="Phone" size="small" fullWidth required
              value={phone} onChange={(e) => setPhone(e.target.value)}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained" onClick={handleSubmit}
          disabled={submitting || !selectedItemId || !name.trim() || !phone.trim()}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? 'Submitting…' : 'Submit Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
