import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Tabs, Tab, Chip,
  Typography, MenuItem as MuiMenuItem, Select, FormControl,
  InputLabel, IconButton, Tooltip, Alert, LinearProgress,
  InputAdornment, FormControlLabel, RadioGroup, Radio,
  Stack, Divider, Badge,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Paper,
  ToggleButtonGroup, ToggleButton, Collapse, TablePagination,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningIcon from '@mui/icons-material/Warning';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InventoryIcon from '@mui/icons-material/Inventory';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { DataTable, type Column } from '@paxrest/ui';
import {
  formatCurrency,
  INVENTORY_CATEGORIES,
  INGREDIENT_REQUEST_STATUS_LABELS,
  INGREDIENT_REQUEST_STATUS_COLORS,
} from '@paxrest/shared-utils';
import type { InventoryUnit, PackagingType, IngredientRequestStatus } from '@paxrest/shared-types';
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
   Movements Tab — sub-tabs: Stock Movements, Pending, Completed, Rejected
   ═══════════════════════════════════════════════════════ */
function MovementsTab({ branchId }: { branchId: string }) {
  const [subTab, setSubTab] = useState(0);

  return (
    <Box>
      <Tabs value={subTab} onChange={(_, v) => setSubTab(v)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="Stock Movements" />
        <Tab label="Pending Requests" />
        <Tab label="Completed Requests" />
        <Tab label="Rejected Requests" />
      </Tabs>
      {subTab === 0 && <StockMovementsSubTab branchId={branchId} />}
      {subTab === 1 && <RequestsSubTab branchId={branchId} statusFilter="pending,approved" title="Pending & Approved Requests" />}
      {subTab === 2 && <RequestsSubTab branchId={branchId} statusFilter="in_transit,disbursed,received,return_requested,returned,fulfilled" title="Completed Requests" />}
      {subTab === 3 && <RequestsSubTab branchId={branchId} statusFilter="rejected,cancelled" title="Rejected & Cancelled Requests" />}
    </Box>
  );
}

/* ─── Stock Movements (original) ─── */
function StockMovementsSubTab({ branchId }: { branchId: string }) {
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

/* ─── Ingredient Requests Sub Tab (for Pending / Completed / Rejected) ─── */
const DATE_RANGE_OPTS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All' },
];

function RequestsSubTab({ branchId, statusFilter, title }: { branchId: string; statusFilter: string; title: string }) {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState('today');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Disbursement state
  const [disburseDialog, setDisburseDialog] = useState<any>(null);
  const [disburseItems, setDisburseItems] = useState<any[]>([]);
  const [respondDialog, setRespondDialog] = useState<{ id: string; action: 'approved' | 'rejected' } | null>(null);
  const [responseNotes, setResponseNotes] = useState('');

  // Return response state
  const [returnRespondDialog, setReturnRespondDialog] = useState<{ id: string; action: 'accept' | 'reject' } | null>(null);
  const [returnResponseNotes, setReturnResponseNotes] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      const data = await api<{ items: any[]; total: number }>('inventory', 'ingredient-requests', {
        params: {
          page: String(page + 1),
          page_size: String(pageSize),
          status: statusFilter,
          date_range: dateRange,
        },
        branchId,
      });
      setRequests(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [branchId, page, pageSize, statusFilter, dateRange]);

  useEffect(() => { setLoading(true); fetchRequests(); }, [fetchRequests]);

  // ─── Approve / Reject ─────────────────────────────────────────────────
  const handleRespond = async () => {
    if (!respondDialog) return;
    setActionLoading(respondDialog.id);
    try {
      await api('inventory', 'ingredient-request-respond', {
        body: {
          request_id: respondDialog.id,
          status: respondDialog.action,
          response_notes: responseNotes || undefined,
        },
        branchId,
      });
      toast.success(respondDialog.action === 'approved' ? 'Request approved' : 'Request rejected');
      setRespondDialog(null);
      setResponseNotes('');
      fetchRequests();
    } catch (err: any) { toast.error(err.message); }
    finally { setActionLoading(null); }
  };

  // ─── Disburse ─────────────────────────────────────────────────────────
  const openDisburse = (req: any) => {
    const items = (req.ingredient_request_items ?? []).map((i: any) => ({
      id: i.id,
      name: i.inventory_items?.name ?? i.inventory_item_name ?? 'Item',
      quantity_requested: i.quantity_requested,
      quantity_approved: i.quantity_approved ?? i.quantity_requested,
      quantity_disbursed: i.quantity_approved ?? i.quantity_requested,
      disbursement_notes: '',
      unit: i.unit,
      stock_available: i.inventory_items?.quantity ?? '?',
    }));
    setDisburseItems(items);
    setDisburseDialog(req);
  };

  const handleDisburse = async () => {
    if (!disburseDialog) return;
    setActionLoading(disburseDialog.id);
    try {
      await api('inventory', 'ingredient-request-disburse', {
        body: {
          request_id: disburseDialog.id,
          items: disburseItems.map((i) => ({
            id: i.id,
            quantity_disbursed: Number(i.quantity_disbursed),
            disbursement_notes: i.disbursement_notes || undefined,
          })),
        },
        branchId,
      });
      toast.success('Items disbursed and sent to kitchen');
      setDisburseDialog(null);
      fetchRequests();
    } catch (err: any) { toast.error(err.message); }
    finally { setActionLoading(null); }
  };

  // ─── Accept / Reject Return ────────────────────────────────────────
  const handleReturnRespond = async () => {
    if (!returnRespondDialog) return;
    setActionLoading(returnRespondDialog.id);
    const endpoint = returnRespondDialog.action === 'accept'
      ? 'ingredient-request-accept-return'
      : 'ingredient-request-reject-return';
    try {
      await api('inventory', endpoint, {
        body: {
          request_id: returnRespondDialog.id,
          return_response_notes: returnResponseNotes || undefined,
        },
        branchId,
      });
      toast.success(returnRespondDialog.action === 'accept' ? 'Return accepted — stock restored' : 'Return rejected');
      setReturnRespondDialog(null);
      setReturnResponseNotes('');
      fetchRequests();
    } catch (err: any) { toast.error(err.message); }
    finally { setActionLoading(null); }
  };

  const getStatusColor = (status: string) =>
    (INGREDIENT_REQUEST_STATUS_COLORS as Record<string, string>)[status] ?? 'default';

  if (loading && requests.length === 0) return <LinearProgress />;

  return (
    <Box>
      {/* ─── Date Range Filter ─── */}
      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
        <ToggleButtonGroup size="small" value={dateRange} exclusive onChange={(_, v) => { if (v) { setDateRange(v); setPage(0); } }}>
          {DATE_RANGE_OPTS.map((o) => <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>)}
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">{total} request{total !== 1 ? 's' : ''}</Typography>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      {requests.length === 0 && !loading ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No {title.toLowerCase()}</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={40} />
                <TableCell>Items</TableCell>
                <TableCell width={140}>Requested By</TableCell>
                <TableCell width={100}>Station</TableCell>
                <TableCell width={150}>Date &amp; Time</TableCell>
                <TableCell width={120}>Status</TableCell>
                <TableCell width={220} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((req) => {
                const items = req.ingredient_request_items ?? [];
                const isExpanded = expandedRow === req.id;
                const status = req.status as IngredientRequestStatus;
                const itemSummary = items.map((i: any) =>
                  `${i.quantity_requested}× ${i.inventory_items?.name ?? i.inventory_item_name ?? 'Item'}`
                ).join(', ');

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
                        <Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>{itemSummary || '—'}</Typography>
                        {req.notes && <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 280, display: 'block' }}>{req.notes}</Typography>}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{req.requested_by_name ?? '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={req.station || 'kitchen'} variant="outlined" />
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
                          {status === 'pending' && (
                            <>
                              <Button size="small" variant="contained" color="success"
                                startIcon={<CheckCircleIcon />}
                                onClick={() => { setRespondDialog({ id: req.id, action: 'approved' }); setResponseNotes(''); }}
                                disabled={actionLoading === req.id}>
                                Approve
                              </Button>
                              <Button size="small" variant="outlined" color="error"
                                startIcon={<CancelIcon />}
                                onClick={() => { setRespondDialog({ id: req.id, action: 'rejected' }); setResponseNotes(''); }}
                                disabled={actionLoading === req.id}>
                                Reject
                              </Button>
                            </>
                          )}
                          {status === 'approved' && (
                            <Button size="small" variant="contained" color="primary"
                              startIcon={<LocalShippingIcon />}
                              onClick={() => openDisburse(req)}
                              disabled={actionLoading === req.id}>
                              Disburse
                            </Button>
                          )}
                          {status === 'return_requested' && (
                            <>
                              <Button size="small" variant="contained" color="success"
                                startIcon={<CheckCircleIcon />}
                                onClick={() => { setReturnRespondDialog({ id: req.id, action: 'accept' }); setReturnResponseNotes(''); }}
                                disabled={actionLoading === req.id}>
                                Accept Return
                              </Button>
                              <Button size="small" variant="outlined" color="error"
                                startIcon={<CancelIcon />}
                                onClick={() => { setReturnRespondDialog({ id: req.id, action: 'reject' }); setReturnResponseNotes(''); }}
                                disabled={actionLoading === req.id}>
                                Reject Return
                              </Button>
                            </>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                    {/* Expanded detail */}
                    <TableRow>
                      <TableCell colSpan={7} sx={{ py: 0, px: 0 }}>
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
                                  <TableCell>In Stock</TableCell>
                                  <TableCell>Disburse Notes</TableCell>
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
                                    <TableCell>{item.inventory_items?.quantity ?? '—'} {item.inventory_items?.unit ?? ''}</TableCell>
                                    <TableCell>{item.disbursement_notes ?? '—'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            {/* Timeline */}
                            <Stack direction="row" spacing={3} sx={{ mt: 1.5 }} flexWrap="wrap">
                              {req.approved_by_name && (
                                <Typography variant="caption" color="text.secondary">
                                  Responded by: <strong>{req.approved_by_name}</strong>
                                  {req.responded_at && ` at ${new Date(req.responded_at).toLocaleString()}`}
                                </Typography>
                              )}
                              {req.response_notes && (
                                <Typography variant="caption" color="text.secondary">Notes: {req.response_notes}</Typography>
                              )}
                              {req.disbursed_at && (
                                <Typography variant="caption" color="text.secondary">Disbursed: {new Date(req.disbursed_at).toLocaleString()}</Typography>
                              )}
                              {req.received_at && (
                                <Typography variant="caption" color="text.secondary">Received: {new Date(req.received_at).toLocaleString()}</Typography>
                              )}
                              {req.return_notes && (
                                <Typography variant="caption" color="text.secondary">
                                  Return notes: {req.return_notes}
                                </Typography>
                              )}
                              {req.return_accepted_by_name && (
                                <Typography variant="caption" color="text.secondary">
                                  Return handled by: <strong>{req.return_accepted_by_name}</strong>
                                  {req.return_response_notes && ` — ${req.return_response_notes}`}
                                </Typography>
                              )}
                              {req.returned_at && (
                                <Typography variant="caption" color="text.secondary">
                                  Returned: {new Date(req.returned_at).toLocaleString()}
                                </Typography>
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

      {/* ─── Approve/Reject Dialog ─── */}
      <Dialog open={!!respondDialog} onClose={() => setRespondDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{respondDialog?.action === 'approved' ? 'Approve Request' : 'Reject Request'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Notes (optional)" multiline rows={2} sx={{ mt: 1 }}
            value={responseNotes}
            onChange={(e) => setResponseNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRespondDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={respondDialog?.action === 'approved' ? 'success' : 'error'}
            onClick={handleRespond}
            disabled={actionLoading === respondDialog?.id}
          >
            {respondDialog?.action === 'approved' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Accept/Reject Return Dialog ─── */}
      <Dialog open={!!returnRespondDialog} onClose={() => setReturnRespondDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{returnRespondDialog?.action === 'accept' ? 'Accept Return' : 'Reject Return'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {returnRespondDialog?.action === 'accept'
              ? 'Accepting will restore the returned quantities back to inventory stock.'
              : 'Rejecting will keep the items with kitchen. Status will revert to "Received".'}
          </Typography>
          <TextField
            fullWidth label="Notes (optional)" multiline rows={2}
            value={returnResponseNotes}
            onChange={(e) => setReturnResponseNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnRespondDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={returnRespondDialog?.action === 'accept' ? 'success' : 'error'}
            onClick={handleReturnRespond}
            disabled={actionLoading === returnRespondDialog?.id}
          >
            {returnRespondDialog?.action === 'accept' ? 'Accept Return' : 'Reject Return'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Disburse Dialog ─── */}
      <Dialog open={!!disburseDialog} onClose={() => setDisburseDialog(null)} maxWidth="md" fullWidth>
        <DialogTitle>Disburse Items</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Set the actual quantity to disburse for each item. Stock will be deducted from inventory.
          </Alert>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell align="right">Requested</TableCell>
                <TableCell align="right">In Stock</TableCell>
                <TableCell align="right" width={120}>Disburse Qty</TableCell>
                <TableCell width={200}>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {disburseItems.map((item, idx) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name} <Typography variant="caption" color="text.secondary">({item.unit})</Typography></TableCell>
                  <TableCell align="right">{item.quantity_requested}</TableCell>
                  <TableCell align="right">
                    <Typography color={Number(item.stock_available) < Number(item.quantity_disbursed) ? 'error.main' : 'text.primary'}>
                      {item.stock_available}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small" type="number" sx={{ width: 100 }}
                      value={item.quantity_disbursed}
                      onChange={(e) => {
                        const updated = [...disburseItems];
                        updated[idx] = { ...updated[idx], quantity_disbursed: e.target.value };
                        setDisburseItems(updated);
                      }}
                      inputProps={{ min: 0 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small" fullWidth placeholder="Optional note"
                      value={item.disbursement_notes}
                      onChange={(e) => {
                        const updated = [...disburseItems];
                        updated[idx] = { ...updated[idx], disbursement_notes: e.target.value };
                        setDisburseItems(updated);
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisburseDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleDisburse} disabled={actionLoading === disburseDialog?.id}>
            Disburse &amp; Send to Kitchen
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
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
