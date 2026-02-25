import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Tabs, Tab, Chip,
  Typography, MenuItem as MuiMenuItem, Select, FormControl,
  InputLabel, IconButton, Tooltip, Alert, LinearProgress,
  InputAdornment, FormControlLabel, RadioGroup, Radio,
  Stack, Divider, Badge,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningIcon from '@mui/icons-material/Warning';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InventoryIcon from '@mui/icons-material/Inventory';
import { DataTable, type Column } from '@paxrest/ui';
import { formatCurrency, INVENTORY_CATEGORIES } from '@paxrest/shared-utils';
import type { InventoryUnit, PackagingType } from '@paxrest/shared-types';
import { usePaginated, useApi } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

const UNIT_OPTIONS: InventoryUnit[] = ['kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'box', 'bag', 'bottle', 'can', 'pack'];

interface ItemForm {
  id?: string;
  name: string;
  barcode: string;
  unit: InventoryUnit;
  quantity: number;
  min_stock_level: number;
  cost_per_unit: number;
  packaging_type: PackagingType;
  items_per_pack: number;
  category: string;
  storage_location: string;
  weight_value: string;
  weight_unit: string;
}

const emptyForm: ItemForm = {
  name: '', barcode: '', unit: 'pcs', quantity: 0, min_stock_level: 10,
  cost_per_unit: 0, packaging_type: 'single',
  items_per_pack: 1, category: '', storage_location: '', weight_value: '', weight_unit: '',
};

export default function InventoryPage() {
  return <BranchGuard><InventoryPageContent /></BranchGuard>;
}

function InventoryPageContent() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Stock" icon={<InventoryIcon />} iconPosition="start" />
        <Tab label="Movements" />
        <Tab label="Low Stock" icon={<Badge badgeContent="!" color="error" variant="dot"><WarningIcon /></Badge>} iconPosition="start" />
      </Tabs>
      {tab === 0 && <StockTab branchId={activeBranchId!} currency={currency} />}
      {tab === 1 && <MovementsTab branchId={activeBranchId!} />}
      {tab === 2 && <LowStockTab branchId={activeBranchId!} currency={currency} />}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════
   Stock Tab — Full inventory with Add/Edit/Barcode/CSV
   ═══════════════════════════════════════════════════════ */
function StockTab({ branchId, currency }: { branchId: string; currency: string }) {
  const {
    items, total, loading, page, pageSize, sortBy, sortDir,
    setPage, setPageSize, onSortChange, setSearch, refetch,
  } = usePaginated<any>('inventory', 'items', { active_only: 'true' });

  const [dialog, setDialog] = useState(false);
  const [adjustDialog, setAdjustDialog] = useState(false);
  const [csvDialog, setCsvDialog] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState<ItemForm>({ ...emptyForm });
  const [adjustForm, setAdjustForm] = useState({ quantity_change: 0, reason: '' });
  const [saving, setSaving] = useState(false);

  const updateForm = (patch: Partial<ItemForm>) => setForm((f) => ({ ...f, ...patch }));

  // Barcode scan handler
  const handleBarcodeScan = async (barcode: string) => {
    setScannerOpen(false);
    try {
      const res = await api<{ item: any }>('inventory', 'barcode-lookup', { params: { barcode }, branchId });
      if (res.item) {
        // Found existing item — open for editing
        setForm({
          id: res.item.id, name: res.item.name, barcode: res.item.barcode ?? '',
          unit: res.item.unit, quantity: res.item.quantity, min_stock_level: res.item.min_stock_level,
          cost_per_unit: res.item.cost_per_unit,
          packaging_type: res.item.packaging_type, items_per_pack: res.item.items_per_pack,
          category: res.item.category ?? '', storage_location: res.item.storage_location ?? '',
          weight_value: res.item.weight_value?.toString() ?? '', weight_unit: res.item.weight_unit ?? '',
        });
        setDialog(true);
        toast.success(`Found: ${res.item.name}`);
      } else {
        // New barcode — open empty form with barcode pre-filled
        setForm({ ...emptyForm, barcode });
        setDialog(true);
        toast('New barcode scanned — fill in details');
      }
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api('inventory', 'items', {
        body: {
          id: form.id || undefined,
          name: form.name,
          barcode: form.barcode || null,
          unit: form.unit,
          quantity: form.quantity,
          min_stock_level: form.min_stock_level,
          cost_per_unit: form.cost_per_unit,
          packaging_type: form.packaging_type,
          items_per_pack: form.packaging_type === 'pack' ? form.items_per_pack : 1,
          category: form.category || null,
          storage_location: form.storage_location || null,
          weight_value: form.weight_value ? parseFloat(form.weight_value) : null,
          weight_unit: form.weight_unit || null,
        },
        branchId,
      });
      toast.success(form.id ? 'Item updated' : 'Item created');
      setDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleAdjust = async () => {
    if (!selected) return;
    if (!adjustForm.reason.trim()) { toast.error('Reason is required'); return; }
    setSaving(true);
    try {
      await api('inventory', 'adjust', {
        body: { inventory_item_id: selected.id, quantity_change: adjustForm.quantity_change, reason: adjustForm.reason },
        branchId,
      });
      toast.success('Stock adjusted');
      setAdjustDialog(false);
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const openNewItem = () => { setForm({ ...emptyForm }); setDialog(true); };
  const openEditItem = (row: any) => {
    setForm({
      id: row.id, name: row.name, barcode: row.barcode ?? '',
      unit: row.unit, quantity: row.quantity, min_stock_level: row.min_stock_level,
      cost_per_unit: row.cost_per_unit,
      packaging_type: row.packaging_type ?? 'single', items_per_pack: row.items_per_pack ?? 1,
      category: row.category ?? '', storage_location: row.storage_location ?? '',
      weight_value: row.weight_value?.toString() ?? '', weight_unit: row.weight_unit ?? '',
    });
    setDialog(true);
  };

  const costPerItem = form.packaging_type === 'pack' && form.items_per_pack > 0
    ? (form.cost_per_unit / form.items_per_pack).toFixed(2)
    : form.cost_per_unit.toFixed(2);

  const handleDelete = async (item: any) => {
    if (!window.confirm(`Delete "${item.name}"? This will deactivate the item.`)) return;
    try {
      await api('inventory', 'item', { method: 'DELETE', params: { id: item.id }, branchId });
      toast.success('Item deleted');
      refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Item', render: (r) => (
      <Box>
        <Typography fontWeight={600}>{r.name}</Typography>
        {r.barcode && <Typography variant="caption" color="text.secondary">{r.barcode}</Typography>}
      </Box>
    )},
    { id: 'category', label: 'Category', width: 130, render: (r) => r.category ? <Chip size="small" label={r.category} /> : '—' },
    { id: 'quantity', label: 'Qty', width: 100, render: (r) => (
      <Typography fontWeight={600} color={r.quantity <= r.min_stock_level ? 'error' : 'text.primary'}>
        {r.quantity} {r.unit}
      </Typography>
    )},
    { id: 'packaging_type', label: 'Type', width: 80, render: (r) => r.packaging_type === 'pack' ? `Pack (${r.items_per_pack})` : 'Single' },
    { id: 'cost_per_unit', label: 'Cost', width: 100, render: (r) => formatCurrency(r.cost_per_unit, currency) },
    { id: 'actions', label: '', width: 180, sortable: false, render: (r) => (
      <Stack direction="row" spacing={0.5}>
        <Tooltip title="Edit"><IconButton size="small" onClick={(e) => { e.stopPropagation(); openEditItem(r); }}><EditIcon fontSize="small" /></IconButton></Tooltip>
        <Button size="small" onClick={(e) => { e.stopPropagation(); setSelected(r); setAdjustForm({ quantity_change: 0, reason: '' }); setAdjustDialog(true); }}>
          Adjust
        </Button>
        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDelete(r); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>
    )},
  ];

  return (
    <>
      {/* Action Bar */}
      <Box sx={{ mb: 2, display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Tooltip title="Scan Barcode">
          <Button variant="outlined" startIcon={<QrCodeScannerIcon />} onClick={() => setScannerOpen(true)}>
            Scan
          </Button>
        </Tooltip>
        <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setCsvDialog(true)}>
          CSV Import
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNewItem}>
          Add Item
        </Button>
      </Box>

      <DataTable
        columns={columns} rows={items} totalRows={total}
        page={page} pageSize={pageSize} loading={loading}
        sortBy={sortBy} sortDir={sortDir}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={onSortChange} searchable onSearchChange={setSearch}
        onRowClick={openEditItem}
        rowKey={(r) => r.id}
      />

      {/* ─── Upsert Dialog ─── */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{form.id ? 'Edit Item' : 'New Inventory Item'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {/* Name */}
            <Grid size={12}>
              <TextField fullWidth required label="Item Name" value={form.name} onChange={(e) => updateForm({ name: e.target.value })} />
            </Grid>

            {/* Barcode + scan */}
            <Grid size={12}>
              <TextField
                fullWidth label="Barcode" value={form.barcode}
                onChange={(e) => updateForm({ barcode: e.target.value })}
                slotProps={{ input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setScannerOpen(true)} size="small"><QrCodeScannerIcon /></IconButton>
                    </InputAdornment>
                  ),
                }}}
              />
            </Grid>

            {/* Unit & Category */}
            <Grid size={6}>
              <FormControl fullWidth>
                <InputLabel>Unit</InputLabel>
                <Select value={form.unit} label="Unit" onChange={(e) => updateForm({ unit: e.target.value as InventoryUnit })}>
                  {UNIT_OPTIONS.map((u) => <MuiMenuItem key={u} value={u}>{u}</MuiMenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select value={form.category} label="Category" onChange={(e) => updateForm({ category: e.target.value })}>
                  <MuiMenuItem value="">None</MuiMenuItem>
                  {INVENTORY_CATEGORIES.map((c) => <MuiMenuItem key={c} value={c}>{c}</MuiMenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {/* Packaging Type */}
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Packaging Type</Typography>
              <RadioGroup row value={form.packaging_type} onChange={(e) => updateForm({ packaging_type: e.target.value as PackagingType })}>
                <FormControlLabel value="single" control={<Radio />} label="Single Item" />
                <FormControlLabel value="pack" control={<Radio />} label="Pack / Bundle" />
              </RadioGroup>
            </Grid>

            {form.packaging_type === 'pack' && (
              <Grid size={6}>
                <TextField
                  fullWidth label="Items per Pack" type="number"
                  value={form.items_per_pack}
                  onChange={(e) => updateForm({ items_per_pack: Math.max(1, Number(e.target.value)) })}
                />
              </Grid>
            )}

            {/* Pricing */}
            <Grid size={12}><Divider><Typography variant="caption">Pricing</Typography></Divider></Grid>
            <Grid size={form.packaging_type === 'pack' ? 6 : 12}>
              <TextField
                fullWidth label={form.packaging_type === 'pack' ? 'Cost per Pack' : 'Cost per Unit'}
                type="number" value={form.cost_per_unit}
                onChange={(e) => updateForm({ cost_per_unit: Number(e.target.value) })}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> }}}
              />
            </Grid>
            {form.packaging_type === 'pack' && (
              <Grid size={6}>
                <TextField fullWidth label="Cost per Item" value={costPerItem} disabled
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> }}}
                />
              </Grid>
            )}

            {/* Quantity & Threshold */}
            <Grid size={12}><Divider><Typography variant="caption">Stock Levels</Typography></Divider></Grid>
            <Grid size={6}>
              <TextField fullWidth label="Opening Quantity" type="number" value={form.quantity} onChange={(e) => updateForm({ quantity: Number(e.target.value) })} disabled={!!form.id} helperText={form.id ? 'Use Adjust to change' : ''} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Low Stock Threshold" type="number" value={form.min_stock_level} onChange={(e) => updateForm({ min_stock_level: Number(e.target.value) })} />
            </Grid>

            {/* Storage Location */}
            <Grid size={12}>
              <TextField fullWidth label="Storage Location" value={form.storage_location} onChange={(e) => updateForm({ storage_location: e.target.value })} placeholder="e.g. Shelf A, Fridge 2" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>{form.id ? 'Update' : 'Create'}</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Adjust Stock Dialog ─── */}
      <Dialog open={adjustDialog} onClose={() => setAdjustDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Adjust Stock: {selected?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Current: <strong>{selected?.quantity} {selected?.unit}</strong>
          </Typography>
          <TextField
            fullWidth label="Quantity Change (+/-)" type="number" sx={{ mb: 2 }}
            value={adjustForm.quantity_change}
            onChange={(e) => setAdjustForm({ ...adjustForm, quantity_change: Number(e.target.value) })}
            helperText={adjustForm.quantity_change !== 0 ? `New: ${(selected?.quantity ?? 0) + adjustForm.quantity_change} ${selected?.unit}` : ''}
          />
          <TextField fullWidth required label="Reason" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdjust} disabled={saving || !adjustForm.reason}>Adjust</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Barcode Scanner Dialog ─── */}
      <BarcodeDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />

      {/* ─── CSV Import Dialog ─── */}
      <CSVImportDialog open={csvDialog} onClose={() => setCsvDialog(false)} branchId={branchId} onComplete={() => { setCsvDialog(false); refetch(); }} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   Barcode Scanner Dialog (using html5-qrcode)
   ═══════════════════════════════════════════════════════ */
function BarcodeDialog({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan: (code: string) => void }) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mounted || !scannerRef.current) return;

        const scanner = new Html5Qrcode('barcode-scanner-region');
        html5QrRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            scanner.stop().catch(() => {});
            onScan(decodedText);
          },
          () => {},
        );
      } catch (err) {
        console.error('Scanner error:', err);
        toast.error('Camera access failed. Enter barcode manually.');
      }
    };

    startScanner();
    return () => {
      mounted = false;
      html5QrRef.current?.stop?.().catch(() => {});
    };
  }, [open]);

  const [manualCode, setManualCode] = useState('');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Scan Barcode</DialogTitle>
      <DialogContent>
        <Box id="barcode-scanner-region" ref={scannerRef} sx={{ width: '100%', minHeight: 250, mb: 2 }} />
        <Divider sx={{ my: 2 }}>or enter manually</Divider>
        <Stack direction="row" spacing={1}>
          <TextField fullWidth label="Barcode" value={manualCode} onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && manualCode) { onScan(manualCode); setManualCode(''); }}} />
          <Button variant="contained" disabled={!manualCode} onClick={() => { onScan(manualCode); setManualCode(''); }}>
            Go
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════
   CSV Import Dialog
   ═══════════════════════════════════════════════════════ */
function CSVImportDialog({ open, onClose, branchId, onComplete }: {
  open: boolean; onClose: () => void; branchId: string; onComplete: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const Papa = (await import('papaparse')).default;
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const parsed = res.data.map((row: any) => ({
            name: row.name?.trim(),
            barcode: row.barcode?.trim() || undefined,
            unit: row.unit?.trim() || 'pcs',
            quantity: Number(row.quantity) || 0,
            cost_per_unit: Number(row.cost_per_unit || row.cost) || 0,
            selling_price: Number(row.selling_price || row.price) || 0,
            category: row.category?.trim() || undefined,
            min_stock_level: Number(row.min_stock_level || row.threshold) || 0,
            packaging_type: row.packaging_type || 'single',
            items_per_pack: Number(row.items_per_pack) || 1,
          }));
          setRows(parsed.filter((r: any) => r.name));
          setResult(null);
        },
        error: (err) => toast.error(`Parse error: ${err.message}`),
      });
    } catch { toast.error('Failed to load CSV parser'); }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await api<{ created: number; updated: number; errors: string[] }>('inventory', 'csv-import', {
        body: { rows },
        branchId,
      });
      setResult(res);
      if (res.created + res.updated > 0) {
        toast.success(`Created: ${res.created}, Updated: ${res.updated}`);
        setTimeout(onComplete, 1500);
      }
    } catch (err: any) { toast.error(err.message); }
    finally { setImporting(false); }
  };

  const handleClose = () => { setRows([]); setResult(null); onClose(); };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>CSV Import</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          CSV should have columns: name, barcode, unit, quantity, cost_per_unit, selling_price, category, min_stock_level, packaging_type, items_per_pack
        </Alert>

        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
        <Button variant="outlined" fullWidth onClick={() => fileRef.current?.click()} startIcon={<UploadFileIcon />}>
          Select CSV File
        </Button>

        {rows.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" fontWeight={600}>{rows.length} items parsed</Typography>
            <Typography variant="caption" color="text.secondary">
              Preview: {rows.slice(0, 3).map((r) => r.name).join(', ')}{rows.length > 3 ? '...' : ''}
            </Typography>
          </Box>
        )}

        {importing && <LinearProgress sx={{ mt: 2 }} />}

        {result && (
          <Alert severity={result.errors.length > 0 ? 'warning' : 'success'} sx={{ mt: 2 }}>
            Created: {result.created}, Updated: {result.updated}
            {result.errors.length > 0 && (
              <Box sx={{ mt: 1, maxHeight: 100, overflow: 'auto' }}>
                {result.errors.map((e, i) => <Typography key={i} variant="caption" display="block" color="error">{e}</Typography>)}
              </Box>
            )}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
        <Button variant="contained" onClick={handleImport} disabled={rows.length === 0 || importing}>
          Import {rows.length} Items
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════
   Movements Tab
   ═══════════════════════════════════════════════════════ */
function MovementsTab({ branchId }: { branchId: string }) {
  const { items, total, loading, page, pageSize, setPage, setPageSize, setSearch } = usePaginated<any>('inventory', 'movements');

  const columns: Column[] = [
    { id: 'inventory_item_name', label: 'Item', render: (r) => r.inventory_items?.name ?? '—' },
    { id: 'movement_type', label: 'Type', render: (r) => (
      <Chip size="small" label={r.movement_type?.replace(/_/g, ' ')}
        color={r.quantity_change > 0 ? 'success' : 'error'} variant="outlined" />
    )},
    { id: 'quantity_change', label: 'Change', render: (r) => (
      <Typography color={r.quantity_change > 0 ? 'success.main' : 'error.main'} fontWeight={600}>
        {r.quantity_change > 0 ? '+' : ''}{r.quantity_change}
      </Typography>
    )},
    { id: 'quantity_after', label: 'After', width: 80 },
    { id: 'notes', label: 'Notes', render: (r) => r.notes ?? '—' },
    { id: 'performed_by_name', label: 'By', width: 120 },
    { id: 'created_at', label: 'Time', width: 160, render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <DataTable
      columns={columns} rows={items} totalRows={total}
      page={page} pageSize={pageSize} loading={loading}
      onPageChange={setPage} onPageSizeChange={setPageSize}
      searchable onSearchChange={setSearch}
      rowKey={(r) => r.id}
    />
  );
}

/* ═══════════════════════════════════════════════════════
   Low Stock Tab (paginated, SQL-filtered)
   ═══════════════════════════════════════════════════════ */
function LowStockTab({ branchId, currency }: { branchId: string; currency: string }) {
  const { items, total, loading, page, pageSize, setPage, setPageSize } = usePaginated<any>('inventory', 'low-stock');

  const columns: Column[] = [
    { id: 'name', label: 'Item', render: (r) => (
      <Box>
        <Typography fontWeight={600}>{r.name}</Typography>
        {r.barcode && <Typography variant="caption" color="text.secondary">{r.barcode}</Typography>}
      </Box>
    )},
    { id: 'category', label: 'Category', width: 130 },
    { id: 'quantity', label: 'Current Qty', render: (r) => (
      <Typography color="error" fontWeight={600}>{r.quantity} {r.unit}</Typography>
    )},
    { id: 'min_stock_level', label: 'Threshold', width: 100 },
    { id: 'deficit', label: 'Deficit', width: 100, render: (r) => (
      <Typography color="error.main" fontWeight={600}>
        {Math.max(0, r.min_stock_level - r.quantity)} {r.unit}
      </Typography>
    )},
    { id: 'cost_per_unit', label: 'Cost', width: 100, render: (r) => formatCurrency(r.cost_per_unit, currency) },
  ];

  return (
    <DataTable
      columns={columns} rows={items} totalRows={total}
      page={page} pageSize={pageSize} loading={loading}
      onPageChange={setPage} onPageSizeChange={setPageSize}
      rowKey={(r) => r.id}
      emptyMessage="All items are above threshold 🎉"
    />
  );
}
