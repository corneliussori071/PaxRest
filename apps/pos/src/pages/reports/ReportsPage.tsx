import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Grid, Typography, Card, CardContent, Chip,
  Button, ButtonGroup, TextField, Select, MenuItem, FormControl, InputLabel,
  Autocomplete, Stack, Divider, Tooltip, CircularProgress,
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PeopleIcon from '@mui/icons-material/People';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import PrintIcon from '@mui/icons-material/Print';
import { DataTable, StatCard } from '@paxrest/ui';
import type { Column } from '@paxrest/ui';
import { formatCurrency } from '@paxrest/shared-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { api } from '@/lib/supabase';

// ── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ['cash', 'card', 'mobile', 'stripe', 'split', 'loyalty_points', 'credit'];
const STATION_OPTIONS = ['kitchen', 'bar', 'shisha', 'accommodation', 'other_services'];

type DatePreset = 'today' | '7days' | '30days' | 'custom';
type StockView = 'all' | 'central' | 'kitchen' | 'bar' | 'accommodation';

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  if (preset === 'today') return { from: to, to };
  if (preset === '7days') {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return { from: d.toISOString().slice(0, 10), to };
  }
  // 30days
  const d = new Date(today);
  d.setDate(d.getDate() - 29);
  return { from: d.toISOString().slice(0, 10), to };
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { activeBranchId, company, activeBranch, branches, isGlobalStaff } = useAuth();
  const { fmt, currencyCode: currency } = useCurrency();

  // ── Filter State ─────────────────────────────────────────────────────────
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>(isGlobalStaff ? '__all__' : (activeBranchId ?? ''));
  const [paymentFilter, setPaymentFilter] = useState<string[]>([]);
  const [stationFilter, setStationFilter] = useState<string[]>([]);
  const [stockView, setStockView] = useState<StockView>('all');

  // ── Dashboard State ──────────────────────────────────────────────────────
  const [dashboard, setDashboard] = useState<any>(null);
  const [loadingDash, setLoadingDash] = useState(true);

  // ── Transaction State ────────────────────────────────────────────────────
  const [txns, setTxns] = useState<any[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnPage, setTxnPage] = useState(0);
  const [txnPageSize, setTxnPageSize] = useState(20);
  const [txnSort, setTxnSort] = useState('created_at');
  const [txnDir, setTxnDir] = useState<'asc' | 'desc'>('desc');
  const [txnSearch, setTxnSearch] = useState('');
  const [loadingTxn, setLoadingTxn] = useState(true);

  const printRef = useRef<HTMLDivElement>(null);

  // ── Effective date range ─────────────────────────────────────────────────
  const dateRange = useMemo(() => {
    if (datePreset === 'custom') return { from: customFrom, to: customTo };
    return getDateRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  // ── Fetch dashboard stats ────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    if (!dateRange.from || !dateRange.to) return;
    setLoadingDash(true);
    try {
      const params: Record<string, string> = {
        date_from: dateRange.from,
        date_to: dateRange.to,
        stock_view: stockView,
      };
      if (paymentFilter.length > 0) params.payment_methods = paymentFilter.join(',');

      const data = await api('reports', 'financial-dashboard', {
        params,
        branchId: branchFilter || undefined,
      });
      setDashboard(data);
    } catch (err: any) {
      console.error('Dashboard error:', err);
    } finally {
      setLoadingDash(false);
    }
  }, [dateRange, branchFilter, paymentFilter, stockView]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // ── Fetch transactions ───────────────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    if (!dateRange.from || !dateRange.to) return;
    setLoadingTxn(true);
    try {
      const params: Record<string, string> = {
        date_from: dateRange.from,
        date_to: dateRange.to,
        page: String(txnPage + 1),
        page_size: String(txnPageSize),
        sort_column: txnSort,
        sort_direction: txnDir.toUpperCase(),
      };
      if (txnSearch) params.search = txnSearch;
      if (paymentFilter.length > 0) params.payment_methods = paymentFilter.join(',');
      if (stationFilter.length > 0) params.stations = stationFilter.join(',');

      const data = await api<{ items: any[]; total: number }>('reports', 'transaction-list', {
        params,
        branchId: branchFilter || undefined,
      });
      setTxns(data.items ?? []);
      setTxnTotal(data.total ?? 0);
    } catch (err: any) {
      console.error('Transactions error:', err);
      setTxns([]);
    } finally {
      setLoadingTxn(false);
    }
  }, [dateRange, branchFilter, paymentFilter, stationFilter, txnPage, txnPageSize, txnSort, txnDir, txnSearch]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  // Reset page when filters change
  useEffect(() => { setTxnPage(0); }, [dateRange, branchFilter, paymentFilter, stationFilter, txnSearch]);

  // ── Export: CSV ──────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    if (txns.length === 0) return;
    const headers = ['Date', 'Branch', 'Station', 'Cashier', 'Source', 'Items', 'Payment Method', 'Status', 'Total', 'COGS'];
    const csvRows = [headers.join(',')];
    for (const t of txns) {
      csvRows.push([
        new Date(t.date).toLocaleString(),
        `"${t.branch_name}"`,
        `"${t.station}"`,
        `"${t.cashier_name}"`,
        t.source,
        `"${t.items}"`,
        `"${t.payment_method}"`,
        t.order_status,
        t.total,
        t.cogs,
      ].join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${dateRange.from}_${dateRange.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [txns, dateRange]);

  // ── Export: Print ────────────────────────────────────────────────────────
  const handlePrint = useCallback(() => { window.print(); }, []);

  // ── Export: PDF (print-to-PDF approach) ─────────────────────────────────
  const handlePDF = handlePrint;

  // ── Transaction table columns ────────────────────────────────────────────
  const txnColumns: Column[] = useMemo(() => [
    { id: 'date', label: 'Date', sortable: true, width: 150, render: (r: any) => new Date(r.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) },
    { id: 'branch_name', label: 'Branch', sortable: false },
    { id: 'station', label: 'Station', sortable: false },
    { id: 'cashier_name', label: 'Cashier', sortable: false },
    { id: 'source', label: 'Source', sortable: false, render: (r: any) => <Chip size="small" label={r.source} variant="outlined" /> },
    { id: 'items', label: 'Items', sortable: false, width: 220, render: (r: any) => (
      <Tooltip title={r.items}><Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>{r.items}</Typography></Tooltip>
    )},
    { id: 'payment_method', label: 'Payment', sortable: false, render: (r: any) => <Chip size="small" label={r.payment_method} color={r.payment_status === 'paid' ? 'success' : 'default'} /> },
    { id: 'order_status', label: 'Status', sortable: true, render: (r: any) => <Chip size="small" label={r.order_status} color={r.order_status === 'completed' ? 'success' : r.order_status === 'pending' ? 'warning' : 'default'} /> },
    { id: 'total', label: 'Total', sortable: true, align: 'right', render: (r: any) => fmt(r.total) },
    { id: 'cogs', label: 'COGS', sortable: false, align: 'right', render: (r: any) => r.cogs > 0 ? fmt(r.cogs) : '—' },
  ], [currency]);

  // ── Render ───────────────────────────────────────────────────────────────
  const netColor = (dashboard?.net_position ?? 0) >= 0 ? '#1B5E20' : '#D32F2F';

  return (
    <Box ref={printRef}>
      {/* ── Print-only title ──────────────────────────────────────────────── */}
      <Typography variant="h5" fontWeight={700} sx={{ display: 'none', '@media print': { display: 'block', mb: 1 } }}>
        Financial Report — {dateRange.from} to {dateRange.to}
      </Typography>

      {/* ── Filter Bar ────────────────────────────────────────────────────── */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center" sx={{ mb: 3, gap: 1.5, '@media print': { display: 'none' } }}>
        {/* Date preset */}
        <ButtonGroup size="small" variant="outlined">
          {([['today', 'Today'], ['7days', '7 Days'], ['30days', '30 Days'], ['custom', 'Custom']] as const).map(([key, label]) => (
            <Button key={key} variant={datePreset === key ? 'contained' : 'outlined'} onClick={() => setDatePreset(key)}>
              {label}
            </Button>
          ))}
        </ButtonGroup>

        {/* Custom date inputs */}
        {datePreset === 'custom' && (
          <>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} sx={{ width: 155 }} />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={customTo} onChange={(e) => setCustomTo(e.target.value)} sx={{ width: 155 }} />
          </>
        )}

        {/* Branch filter */}
        {isGlobalStaff && (
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Branch</InputLabel>
            <Select value={branchFilter} label="Branch" onChange={(e) => setBranchFilter(e.target.value)}>
              <MenuItem value="__all__">All Branches</MenuItem>
              {branches.map((b: any) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
            </Select>
          </FormControl>
        )}

        {/* Payment methods multi-select */}
        <Autocomplete
          multiple size="small" limitTags={2}
          options={PAYMENT_METHODS}
          getOptionLabel={(o) => o.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          value={paymentFilter}
          onChange={(_, v) => setPaymentFilter(v)}
          renderInput={(p) => <TextField {...p} label="Payment Methods" />}
          sx={{ minWidth: 200 }}
        />

        {/* Station filter multi-select */}
        <Autocomplete
          multiple size="small" limitTags={2}
          options={STATION_OPTIONS}
          getOptionLabel={(o) => o.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          value={stationFilter}
          onChange={(_, v) => setStationFilter(v.slice(0, 5))}
          renderInput={(p) => <TextField {...p} label="Stations" />}
          sx={{ minWidth: 180 }}
        />

        {/* Export buttons */}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Download CSV"><Button size="small" variant="outlined" startIcon={<TableChartIcon />} onClick={handleExportCSV}>CSV</Button></Tooltip>
        <Tooltip title="Print / Save as PDF"><Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}>Print</Button></Tooltip>
      </Stack>

      {/* ── Dashboard Stats ───────────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatCard title="Total Revenue" value={fmt(dashboard?.total_revenue ?? 0)} icon={<AttachMoneyIcon />} loading={loadingDash} color="#1B5E20" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatCard title="Revenue Pending" value={fmt(dashboard?.revenue_pending ?? 0)} icon={<HourglassEmptyIcon />} loading={loadingDash} color="#EF6C00" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatCard title="COGS" value={fmt(dashboard?.cogs ?? 0)} icon={<Inventory2Icon />} loading={loadingDash} color="#C62828" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StockValueCard value={dashboard?.stock_value} currency={currency} loading={loadingDash} stockView={stockView} onStockViewChange={setStockView} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatCard title="Avg Transaction" value={fmt(dashboard?.avg_transaction ?? 0)} icon={<ReceiptIcon />} loading={loadingDash} color="#6A1B9A" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatCard title="Staffing Cost" value={fmt(dashboard?.staffing_cost ?? 0)} icon={<PeopleIcon />} loading={loadingDash} color="#00838F" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 7 }}>
          <StatCard
            title="Net Position"
            value={fmt(dashboard?.net_position ?? 0)}
            icon={(dashboard?.net_position ?? 0) >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
            loading={loadingDash}
            color={netColor}
          />
        </Grid>
      </Grid>

      {/* ── Transactions Table ────────────────────────────────────────────── */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>Transactions</Typography>
      <DataTable
        columns={txnColumns}
        rows={txns}
        totalRows={txnTotal}
        page={txnPage}
        pageSize={txnPageSize}
        loading={loadingTxn}
        sortBy={txnSort}
        sortDir={txnDir}
        onPageChange={setTxnPage}
        onPageSizeChange={setTxnPageSize}
        onSortChange={(col, dir) => { setTxnSort(col); setTxnDir(dir); }}
        rowKey={(r) => r.id}
        searchable
        searchPlaceholder="Search order # or cashier…"
        onSearchChange={setTxnSearch}
        dense
      />

      {/* ── Print styles ──────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          nav, header, [class*="MuiDrawer"], [class*="MuiAppBar"] { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </Box>
  );
}

// ── Stock Value card with dropdown ───────────────────────────────────────────

function StockValueCard({
  value, currency, loading, stockView, onStockViewChange,
}: { value: any; currency: string; loading: boolean; stockView: StockView; onStockViewChange: (v: StockView) => void }) {
  const { fmt } = useCurrency();
  const displayValue = (() => {
    if (!value) return 0;
    if (stockView === 'all') return value.total ?? 0;
    return value[stockView] ?? 0;
  })();

  return (
    <Card>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>Stock Value</Typography>
            {loading ? (
              <CircularProgress size={24} />
            ) : (
              <Typography variant="h5" fontWeight={700} color="#0277BD">{fmt(displayValue)}</Typography>
            )}
          </Box>
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: '#0277BD15', color: '#0277BD' }}>
            <WarehouseIcon />
          </Box>
        </Stack>
        <FormControl size="small" fullWidth sx={{ mt: 1 }}>
          <Select
            value={stockView}
            onChange={(e) => onStockViewChange(e.target.value as StockView)}
            variant="standard"
            sx={{ fontSize: '0.75rem' }}
          >
            <MenuItem value="all">All Stores</MenuItem>
            <MenuItem value="central">Central Inventory</MenuItem>
            <MenuItem value="kitchen">Kitchen Store</MenuItem>
            <MenuItem value="bar">Bar Store</MenuItem>
            <MenuItem value="accommodation">Accommodation Store</MenuItem>
          </Select>
        </FormControl>
      </CardContent>
    </Card>
  );
}
