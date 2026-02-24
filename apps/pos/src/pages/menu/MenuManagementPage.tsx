import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Tabs, Tab, Switch, FormControlLabel, Grid,
  Card, CardContent, CardMedia, Chip, IconButton, Stack, Divider, Alert,
  FormControl, InputLabel, Select, MenuItem as MuiMenuItem, Tooltip,
  LinearProgress, InputAdornment, CircularProgress, Autocomplete,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import { DataTable, type Column } from '@paxrest/ui';
import { formatCurrency, MEAL_AVAILABILITY_LABELS } from '@paxrest/shared-utils';
import type { MealAvailability } from '@paxrest/shared-types';
import { usePaginated, useApi } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api, supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const MENU_CATEGORIES = [
  'Appetizers', 'Main Dishes', 'Drinks', 'Desserts', 'Specials',
];

const MAX_MEDIA_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_MEDIA_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
];

export default function MenuManagementPage() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Menu Items" icon={<RestaurantMenuIcon />} iconPosition="start" />
        <Tab label="Categories" />
        <Tab label="Modifier Groups" />
      </Tabs>

      {tab === 0 && <MenuItemsTab branchId={activeBranchId!} currency={currency} />}
      {tab === 1 && <CategoriesTab branchId={activeBranchId!} />}
      {tab === 2 && <ModifierGroupsTab branchId={activeBranchId!} />}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Ingredient row type
   ═══════════════════════════════════════════════════════ */
interface IngredientRow {
  ingredient_id: string | null; // null = custom
  name: string;
  quantity_used: number;
  unit: string;
  cost_contribution: number;
  is_custom: boolean;
}

interface ExtraRow {
  name: string;
  price: number;
}

/* ═══════════════════════════════════════════════════════
   Main Menu Items Tab
   ═══════════════════════════════════════════════════════ */
function MenuItemsTab({ branchId, currency }: { branchId: string; currency: string }) {
  const {
    items, total, loading, page, pageSize, sortBy, sortDir,
    setPage, setPageSize, onSortChange, setSearch, refetch,
  } = usePaginated<any>('menu', 'items');

  // Fetch categories for the dropdown
  const { data: catData } = useApi<{ categories: any[] }>('menu', 'categories', undefined, [branchId]);
  const categories = catData?.categories ?? [];

  // Fetch inventory items for ingredient selection
  const { data: invData } = useApi<{ items: any[] }>('inventory', 'items', { page_size: '500' }, [branchId]);
  const inventoryItems = invData?.items ?? [];

  const [dialog, setDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [form, setForm] = useState<any>({
    id: '', name: '', description: '', base_price: 0,
    category_id: '', custom_category: '',
    kitchen_station: 'kitchen', is_available: true, is_active: true,
    media_url: null, media_type: null,
    calories: null,
    availability_status: 'available',
  });
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setForm({
      id: '', name: '', description: '', base_price: 0,
      category_id: '', custom_category: '',
      kitchen_station: 'kitchen', is_available: true, is_active: true,
      media_url: null, media_type: null, calories: null,
      availability_status: 'available',
    });
    setIngredients([]);
    setExtras([]);
    setMediaPreview(null);
    setDialog(true);
  };

  const openEdit = async (row: any) => {
    // Fetch full item with ingredients + extras
    try {
      const data = await api<{ item: any }>('menu', 'item', { params: { id: row.id }, branchId });
      const item = data.item;
      setForm({
        id: item.id, name: item.name, description: item.description ?? '',
        base_price: item.base_price, category_id: item.category_id ?? '',
        custom_category: '', kitchen_station: item.station ?? 'kitchen',
        is_available: item.is_available, is_active: item.is_active,
        media_url: item.media_url, media_type: item.media_type,
        calories: item.calories, availability_status: item.availability_status ?? 'available',
      });
      setIngredients(
        (item.menu_item_ingredients ?? []).map((ing: any) => ({
          ingredient_id: ing.ingredient_id,
          name: ing.name ?? inventoryItems.find((i: any) => i.id === ing.ingredient_id)?.name ?? '',
          quantity_used: ing.quantity_used ?? 1,
          unit: ing.unit ?? 'pcs',
          cost_contribution: ing.cost_contribution ?? 0,
          is_custom: !ing.ingredient_id,
        }))
      );
      setExtras(
        (item.menu_item_extras ?? []).map((ext: any) => ({
          name: ext.name, price: ext.price ?? 0,
        }))
      );
      setMediaPreview(item.media_url);
      setDialog(true);
    } catch (err: any) { toast.error(err.message); }
  };

  /* ─── File Upload ─── */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Frontend validation
    if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Allowed: JPEG, PNG, WebP, GIF, MP4, WebM');
      return;
    }
    if (file.size > MAX_MEDIA_SIZE) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 15MB`);
      return;
    }

    // Sanitize filename — strip everything except alphanumerics, dashes, dots
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file, safeName);
      formData.append('category', 'menu');

      const data = await uploadMedia(formData, branchId);
      setForm((f: any) => ({
        ...f,
        media_url: data.file.url,
        media_type: file.type.startsWith('video/') ? 'video' : 'image',
      }));
      setMediaPreview(data.file.url);
      toast.success('Media uploaded');
    } catch (err: any) { toast.error(err.message); }
    finally { setUploading(false); }
  };

  /* ─── Save menu item ─── */
  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Menu name is required'); return; }
    if (!form.category_id && !form.custom_category.trim()) {
      toast.error('Please select or type a category'); return;
    }
    if (form.base_price <= 0) { toast.error('Menu price must be greater than 0'); return; }

    setSaving(true);
    try {
      // If custom category, create it first
      let categoryId = form.category_id;
      if (!categoryId && form.custom_category.trim()) {
        const catResult = await api<{ category: any }>('menu', 'categories', {
          body: { name: form.custom_category.trim() },
          branchId,
        });
        categoryId = catResult.category.id;
      }

      await api('menu', 'items', {
        body: {
          id: form.id || undefined,
          name: form.name,
          description: form.description || null,
          base_price: form.base_price,
          category_id: categoryId,
          station: form.kitchen_station,
          is_available: form.is_available,
          is_active: form.is_active,
          availability_status: form.availability_status,
          media_url: form.media_url,
          media_type: form.media_type,
          calories: form.calories || null,
          ingredients: ingredients.map((ing) => ({
            ingredient_id: ing.is_custom ? null : ing.ingredient_id,
            name: ing.name,
            quantity_used: ing.quantity_used,
            unit: ing.unit,
            cost_contribution: ing.cost_contribution,
          })),
          extras: extras.filter((e) => e.name.trim()).map((e) => ({
            name: e.name, price: e.price,
          })),
        },
        branchId,
      });
      toast.success(form.id ? 'Menu item updated' : 'Menu item created');
      setDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  /* ─── Ingredient helpers ─── */
  const addIngredientFromInventory = (invItem: any) => {
    if (ingredients.some((i) => i.ingredient_id === invItem.id)) return;
    setIngredients([...ingredients, {
      ingredient_id: invItem.id,
      name: invItem.name,
      quantity_used: 1,
      unit: invItem.unit ?? 'pcs',
      cost_contribution: 0,
      is_custom: false,
    }]);
  };

  const addCustomIngredient = () => {
    setIngredients([...ingredients, {
      ingredient_id: null,
      name: '',
      quantity_used: 1,
      unit: 'pcs',
      cost_contribution: 0,
      is_custom: true,
    }]);
  };

  const updateIngredient = (idx: number, patch: Partial<IngredientRow>) => {
    setIngredients((prev) => prev.map((ing, i) => i === idx ? { ...ing, ...patch } : ing));
  };

  const removeIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ─── Extra helpers ─── */
  const addExtra = () => setExtras([...extras, { name: '', price: 0 }]);
  const updateExtra = (idx: number, patch: Partial<ExtraRow>) => {
    setExtras((prev) => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));
  };
  const removeExtra = (idx: number) => setExtras((prev) => prev.filter((_, i) => i !== idx));

  /* ─── Category options (built-in + existing from DB) ─── */
  const categoryOptions = useMemo(() => {
    const dbNames = categories.map((c: any) => c.name);
    const allNames = [...new Set([...MENU_CATEGORIES, ...dbNames])];
    return allNames.map((name) => {
      const existing = categories.find((c: any) => c.name === name);
      return { id: existing?.id ?? '', name };
    });
  }, [categories]);

  const columns: Column[] = [
    {
      id: 'media',
      label: '',
      width: 60,
      render: (r) => r.media_url ? (
        <Box sx={{ width: 48, height: 48, borderRadius: 1, overflow: 'hidden' }}>
          {r.media_type === 'video' ? (
            <video src={r.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
          ) : (
            <img src={r.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </Box>
      ) : null,
    },
    { id: 'name', label: 'Menu Item', sortable: true },
    { id: 'base_price', label: 'Price', render: (r) => formatCurrency(r.base_price, currency), width: 100, sortable: true },
    { id: 'station', label: 'Station', width: 90 },
    {
      id: 'availability_status', label: 'Status', width: 110,
      render: (r) => {
        const s = r.availability_status ?? 'available';
        return <Chip size="small" label={MEAL_AVAILABILITY_LABELS[s as MealAvailability] ?? s} color={s === 'available' ? 'success' : s === 'sold_out' ? 'error' : 'warning'} />;
      },
    },
    { id: 'is_active', label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No', width: 70 },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight={700}>Restaurant Menu</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Create Menu Item
        </Button>
      </Box>

      <DataTable
        columns={columns}
        rows={items}
        totalRows={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        sortBy={sortBy}
        sortDir={sortDir}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSortChange={onSortChange}
        searchable
        onSearchChange={setSearch}
        onRowClick={openEdit}
        rowKey={(r) => r.id}
      />

      {/* ─── Create / Edit Dialog ─── */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle>{form.id ? 'Edit Menu Item' : 'Create Menu Item'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            {/* ── Media Upload ── */}
            <Grid size={12}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Menu Image / Video / GIF (max 15MB)
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <Stack direction="row" spacing={2} alignItems="center">
                {mediaPreview && (
                  <Box sx={{ width: 120, height: 90, borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                    {form.media_type === 'video' ? (
                      <video src={mediaPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted autoPlay loop />
                    ) : (
                      <img src={mediaPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </Box>
                )}
                <Button
                  variant="outlined"
                  startIcon={uploading ? <CircularProgress size={18} /> : <CloudUploadIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : mediaPreview ? 'Change Media' : 'Upload Media'}
                </Button>
                {mediaPreview && (
                  <Button color="error" size="small" onClick={() => { setForm((f: any) => ({ ...f, media_url: null, media_type: null })); setMediaPreview(null); }}>
                    Remove
                  </Button>
                )}
              </Stack>
            </Grid>

            {/* ── Name ── */}
            <Grid size={12}>
              <TextField
                fullWidth label="Menu Name" required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Grid>

            {/* ── Category ── */}
            <Grid size={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={form.category_id}
                  label="Category"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__other__') {
                      setForm({ ...form, category_id: '', custom_category: '' });
                    } else {
                      setForm({ ...form, category_id: val, custom_category: '' });
                    }
                  }}
                >
                  {categoryOptions.map((opt) => (
                    <MuiMenuItem key={opt.name} value={opt.id || `__new__${opt.name}`}>
                      {opt.name} {!opt.id && '(create)'}
                    </MuiMenuItem>
                  ))}
                  <MuiMenuItem value="__other__">Others (type custom name)</MuiMenuItem>
                </Select>
              </FormControl>
            </Grid>
            {(form.category_id === '' || form.category_id === '__other__') && !categoryOptions.some((c) => c.id === form.category_id) && (
              <Grid size={6}>
                <TextField
                  fullWidth label="Custom Category Name"
                  value={form.custom_category}
                  onChange={(e) => setForm({ ...form, custom_category: e.target.value })}
                  placeholder="e.g. Salads, Smoothies…"
                />
              </Grid>
            )}

            {/* ── Price / Station / Calories ── */}
            <Grid size={4}>
              <TextField
                fullWidth label="Menu Price" type="number" required
                value={form.base_price}
                onChange={(e) => setForm({ ...form, base_price: Number(e.target.value) })}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> } }}
              />
            </Grid>
            <Grid size={4}>
              <FormControl fullWidth>
                <InputLabel>Station</InputLabel>
                <Select value={form.kitchen_station} label="Station" onChange={(e) => setForm({ ...form, kitchen_station: e.target.value })}>
                  <MuiMenuItem value="kitchen">Kitchen</MuiMenuItem>
                  <MuiMenuItem value="bar">Bar</MuiMenuItem>
                  <MuiMenuItem value="shisha">Shisha</MuiMenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={4}>
              <TextField
                fullWidth label="Calories (optional)" type="number"
                value={form.calories ?? ''}
                onChange={(e) => setForm({ ...form, calories: e.target.value ? Number(e.target.value) : null })}
              />
            </Grid>

            {/* ── Description ── */}
            <Grid size={12}>
              <TextField
                fullWidth label="Description (optional)" multiline rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Grid>

            {/* ── Availability ── */}
            <Grid size={6}>
              <FormControlLabel
                control={<Switch checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} />}
                label="Available"
              />
            </Grid>
            <Grid size={6}>
              <FormControlLabel
                control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
                label="Active"
              />
            </Grid>

            <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>

            {/* ═══ Ingredients Section ═══ */}
            <Grid size={12}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Ingredients</Typography>
              <Alert severity="info" sx={{ mb: 1.5 }} icon={false}>
                Select items from inventory stock, or click "Custom" to type ingredients that don't go through inventory (e.g. water, gas).
              </Alert>

              {/* Search inventory to add */}
              <Autocomplete
                options={inventoryItems}
                getOptionLabel={(opt: any) => `${opt.name} (${opt.quantity} ${opt.unit}${opt.quantity <= 0 ? ' — out of stock' : ''})`}
                onChange={(_, val) => val && addIngredientFromInventory(val)}
                renderInput={(params) => (
                  <TextField {...params} label="Search inventory to add ingredient" size="small" />
                )}
                value={null}
                blurOnSelect
                sx={{ mb: 1 }}
              />
              <Button size="small" variant="outlined" onClick={addCustomIngredient} sx={{ mb: 1.5 }}>
                + Custom Ingredient
              </Button>

              {ingredients.map((ing, idx) => (
                <Stack key={idx} direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  {ing.is_custom ? (
                    <TextField
                      size="small" label="Name" value={ing.name} sx={{ flex: 2 }}
                      onChange={(e) => updateIngredient(idx, { name: e.target.value })}
                      placeholder="e.g. Water, Gas, Salt…"
                    />
                  ) : (
                    <Chip label={ing.name} color="primary" variant="outlined" sx={{ flex: 2, justifyContent: 'flex-start' }} />
                  )}
                  <TextField
                    size="small" label="Qty" type="number" sx={{ width: 80 }}
                    value={ing.quantity_used}
                    onChange={(e) => updateIngredient(idx, { quantity_used: Number(e.target.value) })}
                  />
                  <TextField
                    size="small" label="Unit" sx={{ width: 80 }}
                    value={ing.unit}
                    onChange={(e) => updateIngredient(idx, { unit: e.target.value })}
                  />
                  <TextField
                    size="small" label="Price" type="number" sx={{ width: 100 }}
                    value={ing.cost_contribution}
                    onChange={(e) => updateIngredient(idx, { cost_contribution: Number(e.target.value) })}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> } }}
                  />
                  <IconButton color="error" size="small" onClick={() => removeIngredient(idx)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Grid>

            <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>

            {/* ═══ Extras Section ═══ */}
            <Grid size={12}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Extras</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Add optional extras customers can add to this dish (e.g. extra cheese, sauce).
              </Typography>

              {extras.map((ext, idx) => (
                <Stack key={idx} direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <TextField
                    size="small" label="Extra Name" value={ext.name} sx={{ flex: 2 }}
                    onChange={(e) => updateExtra(idx, { name: e.target.value })}
                  />
                  <TextField
                    size="small" label="Price" type="number" sx={{ width: 120 }}
                    value={ext.price}
                    onChange={(e) => updateExtra(idx, { price: Number(e.target.value) })}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> } }}
                  />
                  <IconButton color="error" size="small" onClick={() => removeExtra(idx)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addExtra}>
                Add Extra
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : form.id ? 'Update Menu Item' : 'Create Menu Item'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ─── Media upload helper (uses file-upload edge function) ─── */
async function uploadMedia(formData: FormData, branchId: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${supabaseUrl}/functions/v1/file-upload/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'x-branch-id': branchId,
    },
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? json.error ?? 'Upload failed');
  return json;
}

/* ─── Categories Tab ─── */
function CategoriesTab({ branchId }: { branchId: string }) {
  const { data, loading, refetch } = useApi<{ categories: any[] }>('menu', 'categories', undefined, [branchId]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('menu', 'categories', {
        body: { id: form.id || undefined, name: form.name, sort_order: form.sort_order },
        branchId,
      });
      toast.success('Category saved');
      setDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Name' },
    { id: 'sort_order', label: 'Order', width: 80 },
    { id: 'is_active', label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No', width: 80 },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm({ id: '', name: '', sort_order: 0 }); setDialog(true); }}>
          Add Category
        </Button>
      </Box>
      <DataTable
        columns={columns}
        rows={data?.categories ?? []}
        loading={loading}
        onRowClick={(r) => { setForm({ id: r.id, name: r.name, sort_order: r.sort_order }); setDialog(true); }}
        rowKey={(r) => r.id}
      />
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{form.id ? 'Edit Category' : 'New Category'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Sort Order" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ─── Modifier Groups Tab ─── */
function ModifierGroupsTab({ branchId }: { branchId: string }) {
  const { data, loading, refetch } = useApi<{ modifier_groups: any[] }>('menu', 'modifier-groups', undefined, [branchId]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState<any>({ id: '', name: '', min_select: 0, max_select: 1, is_required: false });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('menu', 'modifier-groups', {
        body: { ...form, id: form.id || undefined },
        branchId,
      });
      toast.success('Modifier group saved');
      setDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Name' },
    { id: 'min_select', label: 'Min', width: 60 },
    { id: 'max_select', label: 'Max', width: 60 },
    { id: 'is_required', label: 'Required', render: (r) => r.is_required ? 'Yes' : 'No', width: 80 },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm({ id: '', name: '', min_select: 0, max_select: 1, is_required: false }); setDialog(true); }}>
          Add Group
        </Button>
      </Box>
      <DataTable
        columns={columns}
        rows={data?.modifier_groups ?? []}
        loading={loading}
        onRowClick={(r) => { setForm(r); setDialog(true); }}
        rowKey={(r) => r.id}
      />
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{form.id ? 'Edit Modifier Group' : 'New Modifier Group'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <Grid container spacing={2}>
            <Grid size={6}><TextField fullWidth label="Min Select" type="number" value={form.min_select} onChange={(e) => setForm({ ...form, min_select: Number(e.target.value) })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Max Select" type="number" value={form.max_select} onChange={(e) => setForm({ ...form, max_select: Number(e.target.value) })} /></Grid>
          </Grid>
          <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} />} label="Required" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
