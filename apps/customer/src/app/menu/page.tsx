'use client';
import React, { useEffect, useState, useMemo } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent, CardMedia,
  Chip, Stack, TextField, InputAdornment, Skeleton, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio,
  Checkbox, Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { publicApi } from '@/lib/supabase';
import { useCartStore } from '@/stores/cart';
import { formatCurrency } from '@paxrest/shared-utils';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/* Types (mirror the API response shapes)                              */
/* ------------------------------------------------------------------ */
interface MenuVariant { id: string; label: string; price_adjustment: number; is_default: boolean; }
interface Modifier { id: string; name: string; price: number; is_default: boolean; }
interface ModifierGroup { id: string; name: string; min_select: number; max_select: number; modifiers: Modifier[]; }
interface MenuItem {
  id: string; name: string; description: string | null; base_price: number;
  image_url: string | null; tags: string[]; is_available: boolean; sort_order: number;
  variants: MenuVariant[]; modifier_groups: ModifierGroup[];
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
  const [qty, setQty] = useState(1);

  const addItem = useCartStore((s) => s.addItem);

  // Fetch full menu via public API (using the demo company slug)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await publicApi<{ categories: MenuCategory[] }>('/menu/full-menu');
        if (res.data?.categories) {
          setCategories(res.data.categories);
          if (res.data.categories.length > 0) setActiveCategory(res.data.categories[0].id);
        }
      } catch {
        toast.error('Failed to load menu');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Filtered items
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.map((c) => ({
      ...c,
      items: c.items.filter(
        (i) => i.name.toLowerCase().includes(q) || i.tags?.some((t) => t.toLowerCase().includes(q)),
      ),
    })).filter((c) => c.items.length > 0);
  }, [categories, search]);

  // ---------- Dialog helpers ----------
  const openCustomize = (item: MenuItem) => {
    setSelectedItem(item);
    const defaultVariant = item.variants.find((v) => v.is_default) || item.variants[0];
    setSelectedVariant(defaultVariant?.id ?? null);
    const mods: Record<string, string[]> = {};
    item.modifier_groups.forEach((g) => {
      mods[g.id] = g.modifiers.filter((m) => m.is_default).map((m) => m.id);
    });
    setSelectedModifiers(mods);
    setQty(1);
  };

  const computeItemPrice = () => {
    if (!selectedItem) return 0;
    let price = selectedItem.base_price;
    const variant = selectedItem.variants.find((v) => v.id === selectedVariant);
    if (variant) price += variant.price_adjustment;
    Object.entries(selectedModifiers).forEach(([gId, mIds]) => {
      const group = selectedItem.modifier_groups.find((g) => g.id === gId);
      mIds.forEach((mId) => {
        const mod = group?.modifiers.find((m) => m.id === mId);
        if (mod) price += mod.price;
      });
    });
    return price;
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
            {cat.items.filter((i) => i.is_available).map((item) => (
              <Grid key={item.id} size={{ xs: 12, sm: 6, md: 3 }}>
                <Card
                  sx={{ cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', '&:hover': { boxShadow: 4 }, transition: 'box-shadow 0.2s' }}
                  onClick={() => openCustomize(item)}
                >
                  <Box sx={{ height: 140, bgcolor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {item.image_url ? (
                      <CardMedia component="img" image={item.image_url} alt={item.name} sx={{ height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Typography sx={{ fontSize: 48 }}>🍽️</Typography>
                    )}
                  </Box>
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" fontWeight={600}>{item.name}</Typography>
                    {item.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', display: '-webkit-box', overflow: 'hidden' }}>
                        {item.description}
                      </Typography>
                    )}
                    <Box sx={{ mt: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle1" fontWeight={700} color="primary">
                        {formatCurrency(item.base_price)}
                        {item.variants.length > 1 && '+'}
                      </Typography>
                      <Chip label="Add" size="small" color="primary" icon={<AddIcon />} />
                    </Box>
                    {item.tags?.length > 0 && (
                      <Stack direction="row" spacing={0.5} mt={1} flexWrap="wrap">
                        {item.tags.map((t) => <Chip key={t} label={t} size="small" variant="outlined" />)}
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
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
          {selectedItem?.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{selectedItem.description}</Typography>
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
    </Container>
  );
}
