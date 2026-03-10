import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Tabs, Tab, Chip,
  Typography, Select, FormControl, InputLabel,
  IconButton, Alert, InputAdornment, Stack, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import SearchIcon from '@mui/icons-material/Search';
import { DataTable, type Column } from '@paxrest/ui';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';
import type { WastageType } from '@paxrest/shared-types';
import { usePaginated } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { api } from '@/lib/supabase';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

export default function WastagePage() {
  return <BranchGuard><WastagePageContent /></BranchGuard>;
}

type WastageSource = 'inventory' | 'kitchen' | 'bar' | 'accommodation' | 'custom';

const SOURCE_OPTIONS: { value: WastageSource; label: string }[] = [
  { value: 'inventory', label: 'Inventory (Central Store)' },
  { value: 'kitchen', label: 'Kitchen Internal Store' },
  { value: 'bar', label: 'Bar Internal Store' },
  { value: 'accommodation', label: 'Accommodation Internal Store' },
  { value: 'custom', label: 'Others (Custom)' },
];

const WASTAGE_TYPES: { value: WastageType; label: string }[] = [
  { value: 'expired', label: 'Expired' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'spillage', label: 'Spillage' },
  { value: 'other', label: 'Other' },
];

const SOURCE_LABELS: Record<string, string> = {
  inventory: 'Central Inventory',
  kitchen: 'Kitchen Store',
  bar: 'Bar Store',
  accommodation: 'Accommodation Store',
  custom: 'Custom',
};

function WastagePageContent() {
  const { activeBranchId, profile } = useAuth();
  const { currencyCode: currency } = useCurrency();
  const [tab, setTab] = useState(0);
  const [recordOpen, setRecordOpen] = useState(false);

  const wastage = usePaginated<any>('inventory', 'wastage');

  const columns: Column[] = [
    {
      id: 'created_at', label: 'Date & Time', sortable: true,
      render: (r) => formatDateTime(r.created_at),
    },
    {
      id: 'inventory_item_name', label: 'Item', sortable: true,
      render: (r) => r.inventory_item_name ?? '—',
    },
    {
      id: 'source', label: 'Source',
      render: (r) => <Chip size="small" label={SOURCE_LABELS[r.source] ?? r.source ?? 'Central Inventory'} />,
    },
    { id: 'quantity', label: 'Qty', sortable: true, align: 'right' },
    {
      id: 'total_value', label: 'Value', sortable: true, align: 'right',
      render: (r) => formatCurrency(Number(r.total_value ?? r.estimated_value ?? 0), currency),
    },
    {
      id: 'wastage_type', label: 'Type',
      render: (r) => <Chip size="small" variant="outlined" label={r.wastage_type} />,
    },
    { id: 'reason', label: 'Reason' },
    { id: 'recorded_by_name', label: 'Recorded By' },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Wastage Records</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setRecordOpen(true)}>
          Record Wastage
        </Button>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="All Records" />
      </Tabs>

      <DataTable
        columns={columns}
        rows={wastage.items}
        totalRows={wastage.total}
        page={wastage.page}
        pageSize={wastage.pageSize}
        loading={wastage.loading}
        sortBy={wastage.sortBy}
        sortDir={wastage.sortDir}
        onPageChange={wastage.setPage}
        onPageSizeChange={wastage.setPageSize}
        onSortChange={wastage.onSortChange}
        searchable
        searchPlaceholder="Search wastage records…"
        onSearchChange={wastage.setSearch}
        rowKey={(r) => r.id}
        emptyMessage="No wastage records found"
      />

      <RecordWastageDialog
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSuccess={() => { setRecordOpen(false); wastage.refetch(); }}
        branchId={activeBranchId!}
        userName={profile?.name ?? ''}
      />
    </Box>
  );
}

// ─── Record Wastage Dialog ─────────────────────────────────────────────────

interface RecordWastageDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  branchId: string;
  userName: string;
}

function RecordWastageDialog({ open, onClose, onSuccess, branchId, userName }: RecordWastageDialogProps) {
  const [source, setSource] = useState<WastageSource>('inventory');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [wastageType, setWastageType] = useState<WastageType>('expired');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Custom item fields
  const [customItemName, setCustomItemName] = useState('');
  const [customStation, setCustomStation] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customEstimatedValue, setCustomEstimatedValue] = useState('');

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = useCallback(() => {
    setSearchText('');
    setSearchResults([]);
    setSelectedItem(null);
    setQuantity('');
    setReason('');
    setWastageType('expired');
    setNotes('');
    setCustomItemName('');
    setCustomStation('');
    setCustomDescription('');
    setCustomEstimatedValue('');
  }, []);

  const handleSourceChange = (newSource: WastageSource) => {
    setSource(newSource);
    resetForm();
  };

  // Search items with debounce
  const handleSearch = useCallback(async (text: string) => {
    setSearchText(text);
    setSelectedItem(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!text.trim() || source === 'custom') { setSearchResults([]); return; }

    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await api<{ items: any[] }>('inventory', 'wastage-search-items', {
          params: { source, search: text.trim() },
          branchId,
        });
        setSearchResults(data.items ?? []);
      } catch { setSearchResults([]); }
    }, 300);
  }, [source, branchId]);

  // Barcode scan result
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    setScannerOpen(false);
    if (!barcode.trim()) return;
    try {
      const data = await api<{ items: any[] }>('inventory', 'wastage-search-items', {
        params: { source, barcode: barcode.trim() },
        branchId,
      });
      if (data.items.length > 0) {
        setSelectedItem(data.items[0]);
        setSearchText(data.items[0].name ?? data.items[0].item_name ?? barcode);
        setSearchResults([]);
      } else {
        toast.error('No item found for this barcode');
      }
    } catch { toast.error('Barcode lookup failed'); }
  }, [source, branchId]);

  const getItemName = (item: any) => item.name ?? item.item_name ?? '—';
  const getItemBarcode = (item: any) => item.barcode ?? '';
  const getItemQuantity = (item: any) => Number(item.quantity ?? 0);
  const getItemUnit = (item: any) => item.unit ?? 'pcs';

  const handleSubmit = async () => {
    if (source === 'custom') {
      if (!customItemName.trim() || !customEstimatedValue || !reason.trim()) {
        toast.error('Fill in item name, estimated value, and reason');
        return;
      }
      setSaving(true);
      try {
        await api('inventory', 'wastage-custom', {
          body: {
            item_name: customItemName.trim(),
            quantity: Number(quantity) || 1,
            estimated_value: Number(customEstimatedValue),
            reason: reason.trim(),
            wastage_type: wastageType,
            station: customStation.trim() || null,
            description: customDescription.trim() || null,
            notes: notes.trim() || null,
          },
          branchId,
        });
        toast.success('Custom wastage recorded');
        onSuccess();
        resetForm();
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to record wastage');
      } finally { setSaving(false); }
      return;
    }

    if (!selectedItem || !quantity || !reason.trim()) {
      toast.error('Select an item, enter quantity, and reason');
      return;
    }
    if (Number(quantity) <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }
    if (Number(quantity) > getItemQuantity(selectedItem)) {
      toast.error(`Quantity exceeds available stock (${getItemQuantity(selectedItem)} ${getItemUnit(selectedItem)})`);
      return;
    }

    setSaving(true);
    try {
      if (source === 'inventory') {
        await api('inventory', 'wastage', {
          body: {
            inventory_item_id: selectedItem.id,
            quantity: Number(quantity),
            reason: reason.trim(),
            wastage_type: wastageType,
            recorded_by_name: userName,
            notes: notes.trim() || null,
          },
          branchId,
        });
      } else {
        await api('inventory', 'wastage-dept', {
          body: {
            source,
            store_item_id: selectedItem.id,
            quantity: Number(quantity),
            reason: reason.trim(),
            wastage_type: wastageType,
            notes: notes.trim() || null,
          },
          branchId,
        });
      }
      toast.success('Wastage recorded successfully');
      onSuccess();
      resetForm();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to record wastage');
    } finally { setSaving(false); }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Record Wastage</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* Source Selection */}
            <FormControl fullWidth>
              <InputLabel>Source</InputLabel>
              <Select
                value={source}
                label="Source"
                onChange={(e) => handleSourceChange(e.target.value as WastageSource)}
              >
                {SOURCE_OPTIONS.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {source !== 'custom' ? (
              <>
                {/* Item Search */}
                <TextField
                  label={`Search item in ${SOURCE_LABELS[source]}`}
                  value={searchText}
                  onChange={(e) => handleSearch(e.target.value)}
                  fullWidth
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setScannerOpen(true)} title="Scan barcode">
                          <QrCodeScannerIcon />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                {/* Search Results */}
                {searchResults.length > 0 && !selectedItem && (
                  <Box sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    {searchResults.map((item: any) => (
                      <Box
                        key={item.id}
                        sx={{
                          px: 2, py: 1, cursor: 'pointer',
                          '&:hover': { bgcolor: 'action.hover' },
                          borderBottom: 1, borderColor: 'divider',
                        }}
                        onClick={() => {
                          setSelectedItem(item);
                          setSearchText(getItemName(item));
                          setSearchResults([]);
                        }}
                      >
                        <Typography variant="body2" fontWeight={500}>{getItemName(item)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Stock: {getItemQuantity(item)} {getItemUnit(item)}
                          {getItemBarcode(item) ? ` · Barcode: ${getItemBarcode(item)}` : ''}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Selected Item */}
                {selectedItem && (
                  <Alert
                    severity="info"
                    action={
                      <IconButton size="small" onClick={() => { setSelectedItem(null); setSearchText(''); }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <strong>{getItemName(selectedItem)}</strong> — Available: {getItemQuantity(selectedItem)} {getItemUnit(selectedItem)}
                  </Alert>
                )}

                {/* Quantity */}
                <TextField
                  label="Quantity"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  fullWidth
                  inputProps={{ min: 0, step: 'any' }}
                  helperText={selectedItem ? `Max: ${getItemQuantity(selectedItem)} ${getItemUnit(selectedItem)}` : ''}
                />
              </>
            ) : (
              <>
                {/* Custom item fields */}
                <TextField
                  label="Spoiled Item Name"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  fullWidth
                  required
                />
                <TextField
                  label="Station / Location"
                  value={customStation}
                  onChange={(e) => setCustomStation(e.target.value)}
                  fullWidth
                  placeholder="e.g. Kitchen, Bar, Front Desk"
                />
                <TextField
                  label="Estimated Value"
                  type="number"
                  value={customEstimatedValue}
                  onChange={(e) => setCustomEstimatedValue(e.target.value)}
                  fullWidth
                  required
                  inputProps={{ min: 0, step: '0.01' }}
                />
                <TextField
                  label="Quantity"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  fullWidth
                  inputProps={{ min: 1, step: 1 }}
                />
                <TextField
                  label="Description of what happened"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                />
              </>
            )}

            {/* Wastage Type */}
            <FormControl fullWidth>
              <InputLabel>Wastage Type</InputLabel>
              <Select
                value={wastageType}
                label="Wastage Type"
                onChange={(e) => setWastageType(e.target.value as WastageType)}
              >
                {WASTAGE_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Reason */}
            <TextField
              label="Reason for wastage"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              required
              placeholder="e.g. Expired, Broke during handling"
            />

            {/* Optional Notes */}
            <TextField
              label="Additional Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Recording…' : 'Record Wastage'}
          </Button>
        </DialogActions>
      </Dialog>

      <BarcodeDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScan}
      />
    </>
  );
}

// ─── Barcode Scanner Dialog ─────────────────────────────────────────────────

function BarcodeDialog({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan: (code: string) => void }) {
  const scannerRef = useRef<any>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (!open) return;
    let html5Qr: any = null;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        html5Qr = new Html5Qrcode('wastage-barcode-reader');
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decoded: string) => {
            html5Qr.stop().catch(() => {});
            onScan(decoded);
          },
          () => {},
        );
      } catch {
        // camera unavailable — manual entry fallback
      }
    })();
    return () => { html5Qr?.stop?.().catch(() => {}); };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Scan Barcode</DialogTitle>
      <DialogContent>
        <Box id="wastage-barcode-reader" sx={{ width: '100%', mb: 2 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Or enter barcode manually:
        </Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            fullWidth
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && manualCode.trim()) { onScan(manualCode.trim()); setManualCode(''); } }}
            placeholder="Enter barcode…"
          />
          <Button
            variant="contained"
            size="small"
            disabled={!manualCode.trim()}
            onClick={() => { onScan(manualCode.trim()); setManualCode(''); }}
          >
            Go
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
