import React, { useState, useCallback, useRef } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Grid, IconButton, InputAdornment, Menu, MenuItem,
  Select, FormControl, InputLabel, Tab, Tabs, TextField, Tooltip,
  Typography, CircularProgress, Alert, Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import { DataTable, type Column } from '@paxrest/ui';
import { formatCurrency } from '@paxrest/shared-utils';
import { usePaginated, useApi } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

//  Constants 

const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'box', 'bag', 'bottle', 'can', 'pack'];
const PACKAGING_TYPES = ['single', 'pack'];

const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' }> = {
  draft:               { label: 'Draft',               color: 'default' },
  submitted:           { label: 'Submitted',           color: 'info' },
  confirmed:           { label: 'Confirmed',           color: 'secondary' },
  received:            { label: 'Received',            color: 'success' },
  partially_received:  { label: 'Partially Received',  color: 'warning' },
  cancelled:           { label: 'Cancelled',           color: 'error' },
};

//  CSV Export 

function exportPOAsCSV(po: any, currency: string) {
  const rows = [
    ['Purchase Order', po.order_number],
    ['Supplier', po.suppliers?.name ?? ''],
    ['Status', po.status],
    ['Expected Date', po.expected_date ?? ''],
    ['Notes', po.notes ?? ''],
    [],
    ['Item Name', 'Qty Ordered', 'Qty Received', 'Unit', 'Unit Cost', 'Total Cost', 'Barcode', 'Selling Price', 'Category'],
    ...(po.purchase_order_items ?? []).map((i: any) => [
      i.inventory_item_name, i.quantity_ordered, i.quantity_received ?? 0,
      i.unit ?? '', i.unit_cost, i.total_cost,
      i.barcode ?? '', i.selling_price ?? 0, i.category ?? '',
    ]),
    [],
    ['Subtotal', po.subtotal],
    ['Total', po.total_amount],
  ];
  const csv = rows.map((r: any[]) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `${po.order_number}.csv`; link.click();
  URL.revokeObjectURL(url);
}

//  Print 

function printPO(po: any, currency: string) {
  const items = po.purchase_order_items ?? [];
  const rows = items.map((i: any) =>
    `<tr><td>${i.inventory_item_name}</td><td>${i.quantity_ordered}</td><td>${i.unit ?? ''}</td><td>${formatCurrency(i.unit_cost, currency)}</td><td>${formatCurrency(i.total_cost, currency)}</td></tr>`
  ).join('');

  const w = window.open('', '_blank')!;
  w.document.write(`
    <html><head><title>${po.order_number}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f5f5f5}
    .meta{margin-bottom:16px}.total{text-align:right;margin-top:8px;font-weight:bold}
    </style></head><body>
    <h2>Purchase Order: ${po.order_number}</h2>
    <div class="meta">
      <strong>Supplier:</strong> ${po.suppliers?.name ?? ''}<br>
      <strong>Contact:</strong> ${po.suppliers?.contact_person ?? ''} ${po.suppliers?.phone ?? ''}<br>
      <strong>Status:</strong> ${po.status}<br>
      <strong>Expected:</strong> ${po.expected_date ?? ''}<br>
      <strong>Notes:</strong> ${po.notes ?? ''}
    </div>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="total">Total: ${formatCurrency(po.total_amount ?? 0, currency)}</div>
    </body></html>`);
  w.document.close(); w.print();
}

// 
// ENTRY POINT
// 

export default function SuppliersPage() {
  return <BranchGuard><SuppliersContent /></BranchGuard>;
}

function SuppliersContent() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Suppliers" />
        <Tab label="Purchase Orders" />
      </Tabs>
      {tab === 0 && <SuppliersTab />}
      {tab === 1 && <PurchaseOrdersTab />}
    </Box>
  );
}

// 
// SUPPLIERS TAB
// 

const EMPTY_SUPPLIER = { name: '', contact_person: '', phone: '', email: '', address: '', payment_terms: '', notes: '' };

function SuppliersTab() {
  const { activeBranchId } = useAuth();
  const { data, loading, refetch } = useApi<{ suppliers: any[] }>('suppliers', 'list', undefined, [activeBranchId]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState<any>(EMPTY_SUPPLIER);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setForm(EMPTY_SUPPLIER); setDialog(true); };
  const openEdit = (row: any) => { setForm(row); setDialog(true); };

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error('Supplier name is required'); return; }
    setSaving(true);
    try {
      await api('suppliers', 'upsert', { method: 'POST', body: form, branchId: activeBranchId! });
      toast.success(form.id ? 'Supplier updated' : 'Supplier added');
      setDialog(false); refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (row: any) => {
    if (!confirm(`Deactivate supplier "${row.name}"?`)) return;
    try {
      await api('suppliers', 'delete', { method: 'POST', body: { id: row.id }, branchId: activeBranchId! });
      toast.success('Supplier deactivated'); refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const field = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p: any) => ({ ...p, [f]: e.target.value }));

  const columns: Column[] = [
    { id: 'name', label: 'Name' },
    { id: 'contact_person', label: 'Contact Person' },
    { id: 'phone', label: 'Phone' },
    { id: 'email', label: 'Email' },
    { id: 'payment_terms', label: 'Payment Terms' },
    {
      id: 'actions', label: '', render: (row) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
          <Button size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>Delete</Button>
        </Box>
      ),
    },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>Add Supplier</Button>
      </Box>
      <DataTable columns={columns} rows={data?.suppliers ?? []} loading={loading} rowKey={(r) => r.id} />

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{form.id ? 'Edit Supplier' : 'New Supplier'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}><TextField fullWidth label="Name *" value={form.name} onChange={field('name')} /></Grid>
            <Grid size={6}><TextField fullWidth label="Contact Person" value={form.contact_person} onChange={field('contact_person')} /></Grid>
            <Grid size={6}><TextField fullWidth label="Phone" value={form.phone} onChange={field('phone')} /></Grid>
            <Grid size={6}><TextField fullWidth label="Email" value={form.email} onChange={field('email')} /></Grid>
            <Grid size={6}><TextField fullWidth label="Payment Terms" value={form.payment_terms} onChange={field('payment_terms')} /></Grid>
            <Grid size={12}><TextField fullWidth label="Address" multiline rows={2} value={form.address} onChange={field('address')} /></Grid>
            <Grid size={12}><TextField fullWidth label="Notes" multiline rows={2} value={form.notes} onChange={field('notes')} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// 
// PURCHASE ORDERS TAB
// 

function PurchaseOrdersTab() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';

  const { items, total, loading, page, pageSize, setPage, setPageSize, refetch } =
    usePaginated<any>('suppliers', 'purchase-orders');

  const [createOpen, setCreateOpen] = useState(false);
  const [editPO, setEditPO] = useState<any>(null);
  const [reviewPO, setReviewPO] = useState<any>(null);
  const [confirmUpdatePO, setConfirmUpdatePO] = useState<any>(null);
  const [detailPO, setDetailPO] = useState<any>(null);

  const fetchDetail = async (id: string) => {
    try {
      const d = await api<{ purchase_order: any }>('suppliers', 'purchase-order', {
        params: { id }, branchId: activeBranchId!,
      });
      return d.purchase_order;
    } catch { return null; }
  };

  const handleAction = async (action: string, row: any) => {
    switch (action) {
      case 'edit': {
        const po = await fetchDetail(row.id);
        if (po) setEditPO(po);
        break;
      }
      case 'delete':
        if (!confirm(`Delete PO ${row.order_number}? This cannot be undone.`)) return;
        try {
          await api('suppliers', 'delete-po', { method: 'POST', body: { id: row.id }, branchId: activeBranchId! });
          toast.success('Order deleted'); refetch();
        } catch (err: any) { toast.error(err.message); }
        break;
      case 'email':
        try {
          const r = await api<any>('suppliers', 'email-request', { method: 'POST', body: { id: row.id }, branchId: activeBranchId! });
          toast(r.email_note ?? 'Request sent');
        } catch (err: any) { toast.error(err.message); }
        break;
      case 'submit':
        if (!confirm('Submit this order? Status will change to Submitted.')) return;
        try {
          await api('suppliers', 'submit-order', { method: 'POST', body: { id: row.id }, branchId: activeBranchId! });
          toast.success('Order submitted'); refetch();
        } catch (err: any) { toast.error(err.message); }
        break;
      case 'confirm-receipt':
        if (!confirm('Confirm goods have been received?')) return;
        try {
          await api('suppliers', 'confirm-receipt', { method: 'POST', body: { id: row.id }, branchId: activeBranchId! });
          toast.success('Receipt confirmed'); refetch();
        } catch (err: any) { toast.error(err.message); }
        break;
      case 'review': {
        const po = await fetchDetail(row.id);
        if (po) setReviewPO(po);
        break;
      }
      case 'update-inventory': {
        const po = await fetchDetail(row.id);
        if (po) setConfirmUpdatePO(po);
        break;
      }
      case 'print': {
        const po = await fetchDetail(row.id);
        if (po) printPO(po, currency);
        break;
      }
      case 'csv': {
        const po = await fetchDetail(row.id);
        if (po) exportPOAsCSV(po, currency);
        break;
      }
    }
  };

  const columns: Column[] = [
    { id: 'order_number', label: 'Order #', render: (r) => <Typography variant="body2" fontFamily="monospace">{r.order_number}</Typography> },
    { id: 'supplier', label: 'Supplier', render: (r) => r.suppliers?.name ?? '' },
    { id: 'status', label: 'Status', render: (r) => {
      const cfg = STATUS_CONFIG[r.status] ?? { label: r.status, color: 'default' as const };
      return <Chip label={cfg.label} color={cfg.color} size="small" />;
    }},
    { id: 'items_count', label: 'Items', render: (r) => r.purchase_order_items?.length ?? 0 },
    { id: 'total_amount', label: 'Total', render: (r) => formatCurrency(r.total_amount ?? 0, currency) },
    { id: 'expected_date', label: 'Expected', render: (r) => r.expected_date ? new Date(r.expected_date).toLocaleDateString() : '' },
    { id: 'inventory_updated', label: 'Inventory', render: (r) => r.inventory_updated_at ? <Chip label="Updated" color="success" size="small" variant="outlined" /> : null },
    { id: 'actions', label: '', render: (r) => <POActionsMenu row={r} onAction={handleAction} /> },
  ];

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>New Purchase Order</Button>
      </Box>

      <DataTable
        columns={columns} rows={items} totalRows={total} page={page}
        pageSize={pageSize} loading={loading}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        rowKey={(r) => r.id}
      />

      {createOpen && (
        <CreateEditPODialog
          po={null}
          currency={currency}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); refetch(); }}
        />
      )}

      {editPO && (
        <CreateEditPODialog
          po={editPO}
          currency={currency}
          onClose={() => setEditPO(null)}
          onSaved={() => { setEditPO(null); refetch(); }}
        />
      )}

      {reviewPO && (
        <ReviewReceiptDialog
          po={reviewPO}
          currency={currency}
          onClose={() => setReviewPO(null)}
          onSaved={() => { setReviewPO(null); refetch(); }}
        />
      )}

      {confirmUpdatePO && (
        <UpdateInventoryDialog
          po={confirmUpdatePO}
          onClose={() => setConfirmUpdatePO(null)}
          onDone={() => { setConfirmUpdatePO(null); refetch(); }}
        />
      )}
    </>
  );
}

//  PO Actions Menu 

function POActionsMenu({ row, onAction }: { row: any; onAction: (a: string, r: any) => void }) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  const show = (action: string) => { setAnchor(null); onAction(action, row); };
  const s = row.status;

  return (
    <>
      <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {s === 'draft' && <MenuItem onClick={() => show('edit')}> Edit</MenuItem>}
        {s === 'draft' && <MenuItem onClick={() => show('submit')}> Submit Order</MenuItem>}
        {s === 'draft' && <MenuItem onClick={() => show('email')}> Request Supplier</MenuItem>}
        {['submitted', 'confirmed'].includes(s) && <MenuItem onClick={() => show('email')}> Request Supplier</MenuItem>}
        {['submitted', 'confirmed'].includes(s) && <MenuItem onClick={() => show('confirm-receipt')}> Confirm Receipt</MenuItem>}
        {['received', 'partially_received'].includes(s) && <MenuItem onClick={() => show('review')}> Review Receipt</MenuItem>}
        {['received', 'partially_received'].includes(s) && <MenuItem onClick={() => show('update-inventory')}> Update Inventory</MenuItem>}
        <MenuItem onClick={() => show('print')}><PrintIcon fontSize="small" sx={{ mr: 1 }} /> Print</MenuItem>
        <MenuItem onClick={() => show('csv')}><DownloadIcon fontSize="small" sx={{ mr: 1 }} /> Export CSV</MenuItem>
        {s === 'draft' && <Divider />}
        {s === 'draft' && <MenuItem onClick={() => show('delete')} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete</MenuItem>}
      </Menu>
    </>
  );
}

// 
// CREATE / EDIT PO DIALOG
// 

interface POItem {
  inventory_item_id?: string | null;
  inventory_item_name: string;
  quantity_ordered: number;
  unit: string;
  unit_cost: number;
  category?: string;
  packaging_type?: string;
  items_per_pack?: number;
  is_manual: boolean;
}

function CreateEditPODialog({
  po, currency, onClose, onSaved,
}: { po: any | null; currency: string; onClose: () => void; onSaved: () => void }) {
  const { activeBranchId, company } = useAuth();

  const [supplierId, setSupplierId] = useState<string>(po?.supplier_id ?? '');
  const [expectedDate, setExpectedDate] = useState<string>(po?.expected_date?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState<string>(po?.notes ?? '');
  const [items, setItems] = useState<POItem[]>(
    po?.purchase_order_items?.map((i: any) => ({
      inventory_item_id: i.inventory_item_id,
      inventory_item_name: i.inventory_item_name,
      quantity_ordered: i.quantity_ordered,
      unit: i.unit ?? 'pcs',
      unit_cost: i.unit_cost,
      category: i.category ?? '',
      packaging_type: i.packaging_type ?? 'single',
      items_per_pack: i.items_per_pack ?? 1,
      is_manual: i.is_manual ?? false,
    })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: suppliersData } = useApi<{ suppliers: any[] }>('suppliers', 'list');
  const suppliers = suppliersData?.suppliers ?? [];

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const d = await api<{ items: any[] }>('inventory', 'items', {
        params: { search: q, page: '1', page_size: '20', active_only: 'true' },
        branchId: activeBranchId!,
      });
      setSearchResults(d.items ?? []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, [activeBranchId]);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(q), 300);
  };

  const addFromInventory = (inv: any) => {
    setItems(prev => [...prev, {
      inventory_item_id: inv.id,
      inventory_item_name: inv.name,
      quantity_ordered: 1,
      unit: inv.unit ?? 'pcs',
      unit_cost: 0,
      category: inv.category ?? '',
      packaging_type: inv.packaging_type ?? 'single',
      items_per_pack: inv.items_per_pack ?? 1,
      is_manual: false,
    }]);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const addManual = () => {
    setItems(prev => [...prev, {
      inventory_item_id: null, inventory_item_name: '', quantity_ordered: 1,
      unit: 'pcs', unit_cost: 0, category: '', packaging_type: 'single',
      items_per_pack: 1, is_manual: true,
    }]);
  };

  const updateItem = (idx: number, field: keyof POItem, value: any) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const total = items.reduce((s, it) => s + (it.quantity_ordered || 0) * (it.unit_cost || 0), 0);

  const handleSave = async () => {
    setError('');
    if (!supplierId) { setError('Please select a supplier.'); return; }
    if (items.length === 0) { setError('Add at least one item.'); return; }
    const invalid = items.find(it => !it.inventory_item_name.trim());
    if (invalid) { setError('All items must have a name.'); return; }

    setSaving(true);
    try {
      if (po?.id) {
        await api('suppliers', 'purchase-order', {
          method: 'PUT',
          body: { id: po.id, expected_date: expectedDate || null, notes, items },
          branchId: activeBranchId!,
        });
        toast.success('Order updated');
      } else {
        await api('suppliers', 'purchase-order', {
          method: 'POST',
          body: {
            supplier_id: supplierId,
            expected_date: expectedDate || null,
            notes,
            items,
            branch_id: activeBranchId,
            company_id: company?.id,
          },
          branchId: activeBranchId!,
        });
        toast.success('Order created');
      }
      onSaved();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="md" onClose={onClose}>
      <DialogTitle>{po ? `Edit Order: ${po.order_number}` : 'New Purchase Order'}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Supplier</InputLabel>
              <Select
                label="Supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={!!po}
              >
                {suppliers.map((s: any) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth size="small" label="Expected Delivery Date" type="date"
              value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth size="small" label="Notes" multiline rows={2}
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
          </Grid>
        </Grid>

        <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>Items</Typography>
          <Button size="small" variant="outlined" startIcon={<SearchIcon />} onClick={() => setSearchOpen(true)}>
            Add from Inventory
          </Button>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addManual}>
            Add Manual
          </Button>
        </Box>

        {searchOpen && (
          <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <TextField
              fullWidth size="small" placeholder="Search inventory..."
              value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
              autoFocus
              InputProps={{ startAdornment: <InputAdornment position="start">{searching ? <CircularProgress size={16} /> : <SearchIcon fontSize="small" />}</InputAdornment> }}
            />
            {searchResults.length > 0 && (
              <Box sx={{ mt: 1, maxHeight: 200, overflow: 'auto' }}>
                {searchResults.map((inv: any) => (
                  <MenuItem key={inv.id} onClick={() => addFromInventory(inv)} dense>
                    <Box>
                      <Typography variant="body2">{inv.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{inv.category}  {inv.unit}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Box>
            )}
            <Button size="small" sx={{ mt: 1 }} onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); }}>
              Cancel
            </Button>
          </Box>
        )}

        {items.map((it, idx) => (
          <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 110px 36px', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField
              size="small" placeholder="Item name" required
              value={it.inventory_item_name}
              onChange={(e) => updateItem(idx, 'inventory_item_name', e.target.value)}
              disabled={!it.is_manual && !!it.inventory_item_id}
            />
            <TextField
              size="small" type="number" placeholder="Qty" inputProps={{ min: 0 }}
              value={it.quantity_ordered || ''}
              onChange={(e) => updateItem(idx, 'quantity_ordered', parseFloat(e.target.value) || 0)}
            />
            <FormControl size="small">
              <Select value={it.unit || 'pcs'} onChange={(e) => updateItem(idx, 'unit', e.target.value)}>
                {UNITS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              size="small" type="number" placeholder="Unit cost" inputProps={{ min: 0, step: 0.01 }}
              value={it.unit_cost || ''}
              onChange={(e) => updateItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
            />
            <IconButton size="small" color="error" onClick={() => removeItem(idx)}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
        ))}

        {items.length === 0 && (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
            No items yet. Add from inventory or manually.
          </Typography>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Total: {formatCurrency(total, currency)}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? <CircularProgress size={20} /> : po ? 'Update Order' : 'Create Order'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// 
// REVIEW RECEIPT DIALOG
// 

function ReviewReceiptDialog({
  po, currency, onClose, onSaved,
}: { po: any; currency: string; onClose: () => void; onSaved: () => void }) {
  const { activeBranchId } = useAuth();
  const [items, setItems] = useState<any[]>(
    (po.purchase_order_items ?? []).map((it: any) => ({ ...it }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (idx: number, field: string, value: any) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      await api('suppliers', 'review-receipt', {
        method: 'POST',
        body: {
          id: po.id,
          items: items.map(it => ({
            id: it.id,
            inventory_item_name: it.inventory_item_name,
            barcode: it.barcode ?? '',
            selling_price: parseFloat(it.selling_price) || 0,
            unit_cost: parseFloat(it.unit_cost) || 0,
            quantity_received: parseFloat(it.quantity_received) || 0,
            unit: it.unit,
            category: it.category ?? '',
            packaging_type: it.packaging_type ?? 'single',
            items_per_pack: parseInt(it.items_per_pack) || 1,
          })),
        },
        branchId: activeBranchId!,
      });
      toast.success('Receipt reviewed');
      onSaved();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save review');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>Review Receipt  {po.order_number}</DialogTitle>
      <DialogContent sx={{ pt: 2, overflowX: 'auto' }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Alert severity="info" sx={{ mb: 2 }}>
          Verify quantities received, barcodes, and selling prices before updating inventory.
        </Alert>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1.5fr 120px 120px 90px 90px 100px 80px 80px', gap: 1, mb: 1, px: 0.5 }}>
          {['Item', 'Barcode', 'Selling Price', 'Qty Expected', 'Qty Received', 'Unit', 'Category', 'Pack Type'].map(h => (
            <Typography key={h} variant="caption" fontWeight={700} color="text.secondary">{h}</Typography>
          ))}
        </Box>
        <Divider sx={{ mb: 1 }} />

        {items.map((it, idx) => (
          <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '1.5fr 120px 120px 90px 90px 100px 80px 80px', gap: 1, mb: 1, alignItems: 'center' }}>
            <Tooltip title={it.is_manual ? 'Manual item' : 'From inventory'}>
              <TextField
                size="small" value={it.inventory_item_name}
                onChange={(e) => updateItem(idx, 'inventory_item_name', e.target.value)}
              />
            </Tooltip>
            <TextField size="small" value={it.barcode ?? ''} placeholder="Barcode"
              onChange={(e) => updateItem(idx, 'barcode', e.target.value)} />
            <TextField size="small" type="number" value={it.selling_price ?? ''}
              placeholder="0.00" inputProps={{ step: 0.01, min: 0 }}
              onChange={(e) => updateItem(idx, 'selling_price', e.target.value)} />
            <Typography variant="body2" align="center">{it.quantity_ordered}</Typography>
            <TextField size="small" type="number" value={it.quantity_received ?? ''}
              inputProps={{ min: 0, max: it.quantity_ordered, step: 0.01 }}
              onChange={(e) => updateItem(idx, 'quantity_received', e.target.value)} />
            <FormControl size="small">
              <Select value={it.unit ?? 'pcs'} onChange={(e) => updateItem(idx, 'unit', e.target.value)}>
                {UNITS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" value={it.category ?? ''}
              onChange={(e) => updateItem(idx, 'category', e.target.value)} />
            <FormControl size="small">
              <Select value={it.packaging_type ?? 'single'} onChange={(e) => updateItem(idx, 'packaging_type', e.target.value)}>
                {PACKAGING_TYPES.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? <CircularProgress size={20} /> : 'Save Review'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// 
// UPDATE INVENTORY CONFIRM DIALOG
// 

function UpdateInventoryDialog({
  po, onClose, onDone,
}: { po: any; onClose: () => void; onDone: () => void }) {
  const { activeBranchId } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const items: any[] = po.purchase_order_items ?? [];

  const handleConfirm = async () => {
    setSaving(true); setError('');
    try {
      await api('suppliers', 'update-inventory', {
        method: 'POST',
        body: { id: po.id },
        branchId: activeBranchId!,
      });
      toast.success('Inventory updated successfully');
      onDone();
    } catch (err: any) {
      setError(err.message ?? 'Failed to update inventory');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>Update Inventory  {po.order_number}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={600} gutterBottom>
            Please double-check all figures before proceeding.
          </Typography>
          <Typography variant="body2">
            Items already in inventory will have their stock updated. New items (not in inventory) will be created automatically. This action cannot be undone.
          </Typography>
        </Alert>

        <Typography variant="subtitle2" gutterBottom>Items to be applied:</Typography>
        {items.map((it, idx) => (
          <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box>
              <Typography variant="body2">{it.inventory_item_name}</Typography>
              {it.barcode && <Typography variant="caption" color="text.secondary">Barcode: {it.barcode}</Typography>}
            </Box>
            <Chip
              label={`+${it.quantity_received ?? it.quantity_ordered} ${it.unit ?? ''}`}
              size="small" color="success" variant="outlined"
            />
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" color="warning" disabled={saving}>
          {saving ? <CircularProgress size={20} /> : 'Confirm & Update Inventory'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
