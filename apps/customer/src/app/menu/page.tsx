'use client';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent, CardMedia,
  Chip, Stack, TextField, InputAdornment, Skeleton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio,
  Checkbox, Divider, Alert, CircularProgress, Select, MenuItem as MuiMenuItem,
  InputLabel,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { publicApi } from '@/lib/supabase';
import { useCartStore, type CartItemRemovedIngredient, type CartItemExtra } from '@/stores/cart';
import { formatCurrency } from '@paxrest/shared-utils';
import toast from 'react-hot-toast';

interface MenuVariant { id: string; name: string; price_adjustment: number; is_active: boolean; is_default: boolean; }
interface Modifier { id: string; name: string; price: number; is_active: boolean; is_default: boolean; }
interface ModifierGroup { id: string; name: string; min_selections: number; max_selections: number; is_required: boolean; modifiers: Modifier[]; }
interface Ingredient { id: string; ingredient_id?: string; name: string; cost_contribution: number; inventory_item_name?: string; }
interface Extra { id: string; name: string; price: number; is_available: boolean; }
interface MenuItem {
  id: string; name: string; description: string | null; base_price: number;
  image_url: string | null; media_url: string | null; media_type: string | null;
  tags: string[]; is_available: boolean; sort_order: number;
  availability_status: 'available' | 'sold_out' | 'limited' | 'preorder';
  calories?: number; preparation_time_min?: number;
  menu_variants: MenuVariant[];
  menu_item_modifier_groups: { modifier_groups: ModifierGroup }[];
  menu_item_ingredients: Ingredient[];
  menu_item_extras: Extra[];
  available_quantity: number;
  assignment_count: number;
  kitchen_status: 'ready' | 'preparing' | null;
}
interface MenuCategory { id: string; name: string; description: string | null; sort_order: number; items: MenuItem[]; }

// Kitchen status config
const KITCHEN_STATUS = {
  ready: { label: 'Ready Now', color: '#2E7D32', bg: '#E8F5E9' },
  preparing: { label: 'Being Prepared', color: '#B45309', bg: '#FEF3C7' },
};

export default function MenuPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'ready' | 'preparing'>('all');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
  const [removedIngredientIds, setRemovedIngredientIds] = useState<Set<string>>(new Set());
  const [selectedExtraIds, setSelectedExtraIds] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(1);
  const [specialOpen, setSpecialOpen] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const branchId = useCartStore((s) => s.branchId);

  const fetchMenu = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await publicApi<{ menu: MenuCategory[] }>(`/customer/menu?branch_id=${encodeURIComponent(branchId)}`);
      const cats = res.data?.menu ?? [];
      setCategories(cats);
      if (cats.length > 0) setActiveCategory(cats[0].id);
    } catch {
      toast.error('Unable to load menu. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);

  const filteredCategories = useMemo(() => {
    let cats = categories;
    if (filterTab === 'ready') cats = cats.map((c) => ({ ...c, items: c.items.filter((i) => i.kitchen_status === 'ready') })).filter((c) => c.items.length > 0);
    if (filterTab === 'preparing') cats = cats.map((c) => ({ ...c, items: c.items.filter((i) => i.kitchen_status === 'preparing') })).filter((c) => c.items.length > 0);
    if (!search.trim()) return cats;
    const q = search.toLowerCase();
    return cats.map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q) || (i.tags ?? []).some((t) => t.toLowerCase().includes(q))) })).filter((c) => c.items.length > 0);
  }, [categories, search, filterTab]);

  const openCustomize = (item: MenuItem) => {
    if (item.availability_status === 'sold_out') { toast.error('This dish is currently unavailable.'); return; }
    setSelectedItem(item);
    const defVariant = item.menu_variants?.find((v) => v.is_default) ?? item.menu_variants?.[0] ?? null;
    setSelectedVariant(defVariant?.id ?? null);
    const defMods: Record<string, string[]> = {};
    (item.menu_item_modifier_groups ?? []).forEach(({ modifier_groups: g }) => {
      if (!g) return;
      defMods[g.id] = (g.modifiers ?? []).filter((m) => m.is_default).map((m) => m.id);
    });
    setSelectedModifiers(defMods);
    setRemovedIngredientIds(new Set());
    setSelectedExtraIds(new Set());
    setQty(1);
  };

  const computeItemPrice = () => {
    if (!selectedItem) return 0;
    let price = selectedItem.base_price;
    if (selectedVariant) { const v = selectedItem.menu_variants.find((v) => v.id === selectedVariant); if (v) price += v.price_adjustment; }
    Object.entries(selectedModifiers).forEach(([gid, mIds]) => {
      const group = selectedItem.menu_item_modifier_groups.find(({ modifier_groups: g }) => g?.id === gid);
      if (!group) return;
      mIds.forEach((mId) => { const mod = group.modifier_groups.modifiers.find((m) => m.id === mId); if (mod) price += mod.price; });
    });
    [...selectedExtraIds].forEach((eid) => { const e = selectedItem.menu_item_extras.find((e) => e.id === eid); if (e) price += e.price; });
    [...removedIngredientIds].forEach((iid) => { const ing = selectedItem.menu_item_ingredients.find((i) => i.id === iid); if (ing) price -= ing.cost_contribution; });
    return Math.max(0, price);
  };

  const handleAddToCart = () => {
    if (!selectedItem) return;
    const variant = selectedItem.menu_variants.find((v) => v.id === selectedVariant);
    const modifiers = Object.entries(selectedModifiers).flatMap(([gid, mIds]) => {
      const group = selectedItem.menu_item_modifier_groups.find(({ modifier_groups: g }) => g?.id === gid);
      if (!group) return [];
      return mIds.map((mId) => { const mod = group.modifier_groups.modifiers.find((m) => m.id === mId); return mod ? { id: mod.id, name: mod.name, price: mod.price } : null; }).filter(Boolean) as { id: string; name: string; price: number }[];
    });
    const removedIngredients: CartItemRemovedIngredient[] = [...removedIngredientIds].map((iid) => {
      const ing = selectedItem.menu_item_ingredients.find((i) => i.id === iid);
      return { ingredient_id: ing?.ingredient_id ?? iid, name: ing?.name ?? ing?.inventory_item_name ?? iid, cost_contribution: ing?.cost_contribution ?? 0 };
    });
    const selectedExtras: CartItemExtra[] = [...selectedExtraIds].map((eid) => {
      const e = selectedItem.menu_item_extras.find((e) => e.id === eid);
      return { id: e?.id ?? eid, name: e?.name ?? eid, price: e?.price ?? 0 };
    });
    addItem({
      menuItemId: selectedItem.id, name: selectedItem.name, basePrice: selectedItem.base_price,
      variantId: variant?.id, variantLabel: variant?.name, variantPriceAdjustment: variant?.price_adjustment ?? 0,
      modifiers, quantity: qty, notes: '',
      removedIngredients: removedIngredients.length ? removedIngredients : undefined,
      selectedExtras: selectedExtras.length ? selectedExtras : undefined,
    });
    setSelectedItem(null);
    toast.success(`${selectedItem.name} added to your order`);
  };

  const toggleModifier = (groupId: string, modId: string, maxSelect: number) => {
    setSelectedModifiers((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(modId)) return { ...prev, [groupId]: current.filter((id) => id !== modId) };
      if (current.length >= maxSelect) return prev;
      return { ...prev, [groupId]: [...current, modId] };
    });
  };

  if (loading) {
    return (
      <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', py: 6 }}>
        <Container maxWidth="lg">
          <Skeleton variant="text" width={240} height={48} sx={{ mb: 1 }} />
          <Skeleton variant="text" width={180} height={24} sx={{ mb: 4 }} />
          <Grid container spacing={3}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
                <Skeleton variant="rounded" height={300} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* Section header */}
      <Box sx={{ bgcolor: '#1C2B4A', py: { xs: 5, md: 7 }, px: 2 }}>
        <Container maxWidth="lg">
          <Typography variant="overline" sx={{ color: '#C9973A', letterSpacing: '0.15em', display: 'block', mb: 1 }}>
            Culinary Experience
          </Typography>
          <Typography variant="h3" sx={{ color: '#fff', fontFamily: '"Playfair Display", serif', mb: 1 }}>
            Our Menu
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 480 }}>
            Freshly prepared dishes crafted from seasonal ingredients by our kitchen team.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 5 }}>
        {/* Controls row */}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 4 }}>
          {/* Filter tabs */}
          <Stack direction="row" spacing={1}>
            {([
              { key: 'all', label: 'All Dishes' },
              { key: 'ready', label: 'Ready Now' },
              { key: 'preparing', label: 'Being Prepared' },
            ] as const).map((f) => (
              <Button
                key={f.key}
                variant={filterTab === f.key ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setFilterTab(f.key)}
                sx={{
                  borderRadius: 2,
                  ...(filterTab === f.key
                    ? { bgcolor: '#1C2B4A', borderColor: '#1C2B4A', color: '#fff' }
                    : { borderColor: '#E0DBD0', color: 'text.secondary', '&:hover': { borderColor: '#1C2B4A', color: '#1C2B4A', bgcolor: 'transparent' } }),
                }}
              >
                {f.label}
              </Button>
            ))}
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              placeholder="Search dishes"
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 220, '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} /></InputAdornment> } }}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => setSpecialOpen(true)}
              disabled={allItems.length === 0}
              sx={{ whiteSpace: 'nowrap', borderColor: '#C9973A', color: '#C9973A', '&:hover': { bgcolor: '#C9973A', color: '#fff', borderColor: '#C9973A' } }}
            >
              Special Request
            </Button>
          </Stack>
        </Stack>

        {/* Category nav */}
        <Stack direction="row" spacing={1} sx={{ mb: 4, overflowX: 'auto', pb: 1 }}>
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              onClick={() => { setActiveCategory(c.id); document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              sx={{
                cursor: 'pointer',
                fontSize: '0.8rem',
                letterSpacing: '0.04em',
                borderRadius: 2,
                ...(activeCategory === c.id
                  ? { bgcolor: '#1C2B4A', color: '#fff', border: '1px solid #1C2B4A' }
                  : { bgcolor: '#fff', color: 'text.secondary', border: '1px solid #E0DBD0', '&:hover': { borderColor: '#1C2B4A', color: '#1C2B4A' } }),
              }}
            />
          ))}
        </Stack>

        {filteredCategories.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <Typography color="text.secondary">No dishes match your selection.</Typography>
          </Box>
        )}

        {/* Menu grid */}
        {filteredCategories.map((cat) => (
          <Box key={cat.id} id={`cat-${cat.id}`} sx={{ mb: 7 }}>
            <Box sx={{ mb: 3, pb: 2, borderBottom: '1px solid #E0DBD0' }}>
              <Typography variant="h5" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A' }}>{cat.name}</Typography>
              {cat.description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{cat.description}</Typography>}
            </Box>

            <Grid container spacing={3}>
              {cat.items.map((item) => {
                const isSoldOut = item.availability_status === 'sold_out';
                const mediaUrl = item.media_url || item.image_url;
                const isVideo = item.media_type === 'video';
                const ks = item.kitchen_status ? KITCHEN_STATUS[item.kitchen_status] : null;

                return (
                  <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                    <Card
                      onClick={() => !isSoldOut && openCustomize(item)}
                      sx={{
                        height: '100%', display: 'flex', flexDirection: 'column',
                        cursor: isSoldOut ? 'default' : 'pointer',
                        opacity: isSoldOut ? 0.55 : 1,
                        position: 'relative',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      {/* Status badge */}
                      {ks && !isSoldOut && (
                        <Box sx={{
                          position: 'absolute', top: 10, left: 10, zIndex: 1,
                          px: 1.5, py: 0.4, borderRadius: 1,
                          bgcolor: ks.bg, border: `1px solid ${ks.color}20`,
                        }}>
                          <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: ks.color, letterSpacing: '0.04em' }}>
                            {ks.label}
                          </Typography>
                        </Box>
                      )}
                      {isSoldOut && (
                        <Box sx={{ position: 'absolute', top: 10, right: 10, zIndex: 1, px: 1.5, py: 0.4, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.55)' }}>
                          <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: '#fff', letterSpacing: '0.04em' }}>Sold Out</Typography>
                        </Box>
                      )}

                      {/* Media */}
                      <Box sx={{ height: 180, bgcolor: '#F3EFE8', overflow: 'hidden', position: 'relative' }}>
                        {mediaUrl ? (
                          isVideo ? (
                            <Box component="video" src={mediaUrl} muted loop autoPlay playsInline sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <CardMedia component="img" image={mediaUrl} alt={item.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: '#E8E0D4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: '#C9973A', opacity: 0.6 }} />
                            </Box>
                          </Box>
                        )}
                      </Box>

                      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5, color: '#1C2B4A', letterSpacing: '0.01em' }}>
                          {item.name}
                        </Typography>
                        {item.description && (
                          <Typography variant="caption" color="text.secondary"
                            sx={{ mb: 0.5, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', lineHeight: 1.5 }}>
                            {item.description}
                          </Typography>
                        )}
                        <Box sx={{ mt: 'auto', pt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#C9973A', fontSize: '0.95rem' }}>
                            {formatCurrency(item.base_price)}
                          </Typography>
                          {item.preparation_time_min && (
                            <Typography variant="caption" color="text.secondary">{item.preparation_time_min} min</Typography>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        ))}
      </Container>

      {/*  Customization Dialog  */}
      <Dialog open={!!selectedItem} onClose={() => setSelectedItem(null)} maxWidth="sm" fullWidth>
        {selectedItem && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pb: 1 }}>
              <Box>
                <Typography variant="h6" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A', pr: 4 }}>
                  {selectedItem.name}
                </Typography>
                {selectedItem.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 300 }}>
                    {selectedItem.description}
                  </Typography>
                )}
              </Box>
              <IconButton onClick={() => setSelectedItem(null)} size="small" sx={{ mt: -0.5 }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ px: 3 }}>
              {/* Variants */}
              {selectedItem.menu_variants?.filter((v) => v.is_active).length > 0 && (
                <Box sx={{ mb: 2.5 }}>
                  <Typography variant="overline" sx={{ color: '#1C2B4A', letterSpacing: '0.1em', display: 'block', mb: 1 }}>Select Size</Typography>
                  <FormControl component="fieldset">
                    <RadioGroup value={selectedVariant ?? ''} onChange={(e) => setSelectedVariant(e.target.value)}>
                      {selectedItem.menu_variants.filter((v) => v.is_active).map((v) => (
                        <FormControlLabel
                          key={v.id} value={v.id}
                          control={<Radio size="small" sx={{ color: '#C9973A', '&.Mui-checked': { color: '#C9973A' } }} />}
                          label={<Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2">{v.name}</Typography>
                            {v.price_adjustment !== 0 && <Typography variant="caption" color="text.secondary">{v.price_adjustment > 0 ? '+' : ''}{formatCurrency(v.price_adjustment)}</Typography>}
                          </Stack>}
                        />
                      ))}
                    </RadioGroup>
                  </FormControl>
                </Box>
              )}

              {/* Modifier groups */}
              {selectedItem.menu_item_modifier_groups?.map(({ modifier_groups: g }) => {
                if (!g) return null;
                const selected = selectedModifiers[g.id] ?? [];
                return (
                  <Box key={g.id} sx={{ mb: 2.5 }}>
                    <Typography variant="overline" sx={{ color: '#1C2B4A', letterSpacing: '0.1em', display: 'block', mb: 0.5 }}>{g.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      {g.is_required ? 'Required' : 'Optional'}  choose up to {g.max_selections}
                    </Typography>
                    {g.modifiers?.filter((m) => m.is_active).map((m) => (
                      <FormControlLabel
                        key={m.id}
                        control={<Checkbox size="small" checked={selected.includes(m.id)} onChange={() => toggleModifier(g.id, m.id, g.max_selections)} sx={{ color: '#C9973A', '&.Mui-checked': { color: '#C9973A' } }} />}
                        label={<Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2">{m.name}</Typography>
                          {m.price > 0 && <Typography variant="caption" color="text.secondary">+{formatCurrency(m.price)}</Typography>}
                        </Stack>}
                      />
                    ))}
                  </Box>
                );
              })}

              {/* Ingredients to remove */}
              {selectedItem.menu_item_ingredients?.length > 0 && (
                <Box sx={{ mb: 2.5 }}>
                  <Typography variant="overline" sx={{ color: '#1C2B4A', letterSpacing: '0.1em', display: 'block', mb: 1 }}>Remove Ingredients</Typography>
                  {selectedItem.menu_item_ingredients.map((ing) => (
                    <FormControlLabel
                      key={ing.id}
                      control={<Checkbox size="small" checked={removedIngredientIds.has(ing.id)} onChange={() => setRemovedIngredientIds((prev) => { const s = new Set(prev); s.has(ing.id) ? s.delete(ing.id) : s.add(ing.id); return s; })} sx={{ color: '#9A8F7E' }} />}
                      label={<Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2">{ing.name || ing.inventory_item_name}</Typography>
                        {ing.cost_contribution > 0 && <Typography variant="caption" color="text.secondary">-{formatCurrency(ing.cost_contribution)}</Typography>}
                      </Stack>}
                    />
                  ))}
                </Box>
              )}

              {/* Extras */}
              {selectedItem.menu_item_extras?.filter((e) => e.is_available).length > 0 && (
                <Box sx={{ mb: 2.5 }}>
                  <Typography variant="overline" sx={{ color: '#1C2B4A', letterSpacing: '0.1em', display: 'block', mb: 1 }}>Add Extras</Typography>
                  {selectedItem.menu_item_extras.filter((e) => e.is_available).map((e) => (
                    <FormControlLabel
                      key={e.id}
                      control={<Checkbox size="small" checked={selectedExtraIds.has(e.id)} onChange={() => setSelectedExtraIds((prev) => { const s = new Set(prev); s.has(e.id) ? s.delete(e.id) : s.add(e.id); return s; })} sx={{ color: '#C9973A', '&.Mui-checked': { color: '#C9973A' } }} />}
                      label={<Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2">{e.name}</Typography>
                        <Typography variant="caption" color="text.secondary">+{formatCurrency(e.price)}</Typography>
                      </Stack>}
                    />
                  ))}
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Quantity */}
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography variant="body2" color="text.secondary" sx={{ letterSpacing: '0.04em' }}>Quantity</Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <IconButton onClick={() => setQty((q) => Math.max(1, q - 1))} size="small" sx={{ border: '1px solid #E0DBD0' }}>
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ minWidth: 24, textAlign: 'center' }}>{qty}</Typography>
                  <IconButton onClick={() => setQty((q) => q + 1)} size="small" sx={{ border: '1px solid #E0DBD0' }}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2.5, borderTop: '1px solid #E0DBD0' }}>
              <Typography variant="h6" sx={{ mr: 'auto', fontFamily: '"Playfair Display", serif', color: '#1C2B4A' }}>
                {formatCurrency(computeItemPrice() * qty)}
              </Typography>
              <Button
                variant="contained"
                startIcon={<ShoppingCartIcon sx={{ fontSize: '1rem !important' }} />}
                onClick={handleAddToCart}
                sx={{ bgcolor: '#1C2B4A', '&:hover': { bgcolor: '#253559' } }}
              >
                Add to Order
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/*  Special Request Dialog  */}
      <SpecialRequestDialog
        open={specialOpen}
        allItems={allItems}
        onClose={() => setSpecialOpen(false)}
      />
    </Box>
  );
}

// 
// Special Request Dialog
// 
interface SRProps {
  open: boolean;
  allItems: MenuItem[];
  onClose: () => void;
}

function SpecialRequestDialog({ open, allItems, onClose }: SRProps) {
  const branchId = useCartStore((s) => s.branchId);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [removeIngredients, setRemoveIngredients] = useState<Set<string>>(new Set());
  const [addExtras, setAddExtras] = useState<Set<string>>(new Set());
  const [customIngredients, setCustomIngredients] = useState('');
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [serviceType, setServiceType] = useState<'delivery' | 'dine_in' | 'pickup'>('dine_in');
  const [submitting, setSubmitting] = useState(false);

  const item = useMemo(() => allItems.find((i) => i.id === selectedItemId) ?? null, [allItems, selectedItemId]);

  useEffect(() => {
    if (open && allItems.length > 0 && !selectedItemId) setSelectedItemId(allItems[0].id);
    if (!open) { setRemoveIngredients(new Set()); setAddExtras(new Set()); setNotes(''); setCustomIngredients(''); }
  }, [open, allItems, selectedItemId]);

  useEffect(() => { setRemoveIngredients(new Set()); setAddExtras(new Set()); }, [selectedItemId]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setter((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleSubmit = async () => {
    if (!item || !branchId || !name.trim() || !phone.trim()) {
      toast.error('Please provide your name and contact number.');
      return;
    }
    if (serviceType === 'delivery' && !address.trim()) { toast.error('Please provide a delivery address.'); return; }
    setSubmitting(true);
    try {
      const removed = [...removeIngredients].map((id) => { const ing = item.menu_item_ingredients.find((i) => i.id === id); return ing?.name || ing?.inventory_item_name || id; });
      const extras = [...addExtras].map((id) => item.menu_item_extras.find((e) => e.id === id)?.name || id);
      const parts = [
        removed.length ? `Remove: ${removed.join(', ')}` : null,
        extras.length ? `Extra: ${extras.join(', ')}` : null,
        customIngredients.trim() ? `Added ingredients: ${customIngredients.trim()}` : null,
        notes.trim() ? `Notes: ${notes.trim()}` : null,
      ].filter(Boolean);

      const res = await publicApi('/customer/special-request', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          item_id: item.id,
          item_name: item.name,
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_address: address.trim() || null,
          order_type: serviceType,
          special_request_notes: parts.join(' | '),
        }),
      });
      if (res.error) throw new Error(typeof res.error === 'string' ? res.error : (res.error as { message: string }).message);
      toast.success('Your special request has been submitted. Our team will be in touch shortly.');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontFamily: '"Playfair Display", serif', color: '#1C2B4A' }}>Special Meal Request</Typography>
          <Typography variant="caption" color="text.secondary">Customise a dish or request something unique from our kitchen.</Typography>
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3} sx={{ pt: 0.5 }}>
          {/* Based on item */}
          <FormControl fullWidth size="small">
            <InputLabel>Based on dish</InputLabel>
            <Select
              label="Based on dish"
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value as string)}
            >
              {allItems.map((i) => <MuiMenuItem key={i.id} value={i.id}>{i.name}</MuiMenuItem>)}
            </Select>
          </FormControl>

          {/* Remove ingredients */}
          {item && item.menu_item_ingredients.length > 0 && (
            <Box>
              <Typography variant="overline" sx={{ color: '#1C2B4A', letterSpacing: '0.1em', display: 'block', mb: 1 }}>Remove Ingredients</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {item.menu_item_ingredients.map((ing) => (
                  <Chip
                    key={ing.id}
                    label={ing.name || ing.inventory_item_name}
                    size="small"
                    variant={removeIngredients.has(ing.id) ? 'filled' : 'outlined'}
                    onClick={() => toggle(setRemoveIngredients, ing.id)}
                    sx={removeIngredients.has(ing.id) ? { bgcolor: '#FEE2E2', borderColor: '#EF4444', color: '#B91C1C' } : { borderColor: '#E0DBD0' }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* Add extras */}
          {item && item.menu_item_extras.filter((e) => e.is_available).length > 0 && (
            <Box>
              <Typography variant="overline" sx={{ color: '#1C2B4A', letterSpacing: '0.1em', display: 'block', mb: 1 }}>Add Extras</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {item.menu_item_extras.filter((e) => e.is_available).map((e) => (
                  <Chip
                    key={e.id}
                    label={`${e.name} +${formatCurrency(e.price)}`}
                    size="small"
                    variant={addExtras.has(e.id) ? 'filled' : 'outlined'}
                    onClick={() => toggle(setAddExtras, e.id)}
                    sx={addExtras.has(e.id) ? { bgcolor: '#DCFCE7', borderColor: '#16A34A', color: '#15803D' } : { borderColor: '#E0DBD0' }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* Custom ingredients */}
          <TextField
            label="Add your own ingredients"
            size="small" fullWidth
            placeholder="e.g. avocado, extra cheese, grilled onions"
            value={customIngredients}
            onChange={(e) => setCustomIngredients(e.target.value)}
          />

          {/* Notes */}
          <TextField
            label="Additional instructions"
            size="small" fullWidth multiline minRows={2}
            placeholder="e.g. very spicy, no salt, gluten-free preparation"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <Divider />

          {/* Service type */}
          <Box>
            <Typography variant="overline" sx={{ color: '#1C2B4A', letterSpacing: '0.1em', display: 'block', mb: 1 }}>Service Type</Typography>
            <Stack direction="row" spacing={1}>
              {([
                { v: 'dine_in', l: 'Dine In' },
                { v: 'pickup', l: 'Pickup' },
                { v: 'delivery', l: 'Delivery' },
              ] as const).map(({ v, l }) => (
                <Button
                  key={v}
                  variant={serviceType === v ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setServiceType(v)}
                  sx={serviceType === v
                    ? { bgcolor: '#1C2B4A', borderColor: '#1C2B4A', color: '#fff', borderRadius: 2 }
                    : { borderColor: '#E0DBD0', color: 'text.secondary', borderRadius: 2, '&:hover': { borderColor: '#1C2B4A', color: '#1C2B4A', bgcolor: 'transparent' } }}
                >
                  {l}
                </Button>
              ))}
            </Stack>
          </Box>

          {/* Contact */}
          <Box>
            <Typography variant="overline" sx={{ color: '#1C2B4A', letterSpacing: '0.1em', display: 'block', mb: 1 }}>Your Details</Typography>
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField label="Full Name" size="small" fullWidth required value={name} onChange={(e) => setName(e.target.value)} />
                <TextField label="Phone Number" size="small" fullWidth required value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Stack>
              {serviceType === 'delivery' && (
                <TextField label="Delivery Address" size="small" fullWidth required value={address} onChange={(e) => setAddress(e.target.value)} />
              )}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2.5, borderTop: '1px solid #E0DBD0' }}>
        <Button onClick={onClose} disabled={submitting} sx={{ color: 'text.secondary' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !selectedItemId || !name.trim() || !phone.trim()}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{ bgcolor: '#1C2B4A', '&:hover': { bgcolor: '#253559' } }}
        >
          {submitting ? 'Submitting...' : 'Submit Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
