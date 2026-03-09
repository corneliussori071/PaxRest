import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Tabs, Tab, TextField, InputAdornment, ButtonGroup,
  Button, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, FormControl, InputLabel, Select, MenuItem,
  Stack, Divider, Paper, Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { DataTable } from '@paxrest/ui';
import type { Column } from '@paxrest/ui';
import { formatDateTime } from '@paxrest/shared-utils';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

type AuditCategory = 'management' | 'financial' | 'administrative';

interface AuditLog {
  id: string;
  company_id: string;
  branch_id: string | null;
  branch_name: string | null;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_fields: string[] | null;
  performed_by: string | null;
  performed_by_name: string;
  performed_by_role: string | null;
  category: AuditCategory;
  created_at: string;
}

// ─── Static helpers (no state dependency — defined once) ────────────────────

/** Map a table name to a human-readable station/area label */
const TABLE_STATION: Record<string, string> = {
  orders:          'POS',
  order_items:     'POS',
  tables:          'Tables',
  menu_items:      'Menu',
  menu_categories: 'Menu',
  deliveries:      'Delivery',
  shifts:          'Shifts',
  wastage_records: 'Wastage',
  purchase_orders: 'Procurement',
  profiles:        'HR / Staff',
  inventory_items: 'Inventory',
};

/** Human-readable description for each (table, action) combination */
const ACTIVITY_LABEL: Record<string, Record<string, string>> = {
  orders:          { INSERT: 'Order Created',          UPDATE: 'Order Updated',          DELETE: 'Order Deleted' },
  order_items:     { INSERT: 'Item Added to Order',    UPDATE: 'Order Item Updated',     DELETE: 'Item Removed from Order' },
  tables:          { INSERT: 'Table Created',          UPDATE: 'Table Status Updated',   DELETE: 'Table Removed' },
  menu_items:      { INSERT: 'Menu Item Added',        UPDATE: 'Menu Item Updated',      DELETE: 'Menu Item Deleted' },
  menu_categories: { INSERT: 'Category Created',       UPDATE: 'Category Updated',       DELETE: 'Category Deleted' },
  deliveries:      { INSERT: 'Delivery Created',       UPDATE: 'Delivery Updated',       DELETE: 'Delivery Deleted' },
  shifts:          { INSERT: 'Shift Opened',           UPDATE: 'Shift Updated',          DELETE: 'Shift Deleted' },
  wastage_records: { INSERT: 'Wastage Recorded',       UPDATE: 'Wastage Entry Updated',  DELETE: 'Wastage Entry Deleted' },
  purchase_orders: { INSERT: 'Purchase Order Created', UPDATE: 'Purchase Order Updated', DELETE: 'Purchase Order Deleted' },
  profiles:        { INSERT: 'Staff Account Created',  UPDATE: 'Staff Profile Updated',  DELETE: 'Staff Account Removed' },
  inventory_items: { INSERT: 'Inventory Item Added',   UPDATE: 'Stock Updated',          DELETE: 'Inventory Item Removed' },
};

/** Chip color for each action type */
const ACTION_COLOR: Record<string, 'success' | 'info' | 'error'> = {
  INSERT: 'success',
  UPDATE: 'info',
  DELETE: 'error',
};

/** Important fields to display per table (excludes noise like UUIDs, timestamps) */
const TABLE_DISPLAY_FIELDS: Record<string, string[]> = {
  orders:          ['order_number', 'status', 'total_amount', 'payment_status', 'station', 'customer_name'],
  order_items:     ['item_name', 'quantity', 'unit_price', 'line_total', 'station'],
  tables:          ['name', 'station', 'capacity', 'status'],
  menu_items:      ['name', 'base_price', 'station', 'is_available', 'is_active'],
  menu_categories: ['name', 'slug', 'is_active'],
  deliveries:      ['status', 'customer_name', 'delivery_address', 'total_amount'],
  shifts:          ['status', 'opening_balance', 'closing_balance', 'total_cash', 'cashier_name'],
  wastage_records: ['source', 'quantity', 'unit_type', 'reason', 'waste_type'],
  purchase_orders: ['status', 'total_amount', 'notes'],
  profiles:        ['name', 'email', 'role'],
  inventory_items: ['name', 'sku', 'unit_type', 'quantity', 'low_stock_threshold'],
};

const SYSTEM_FIELDS = new Set([
  'id', 'company_id', 'branch_id', 'created_at', 'updated_at', 'deleted_at',
]);

function getActivityLabel(tableName: string, action: string): string {
  return ACTIVITY_LABEL[tableName]?.[action] ?? `${action} on ${tableName}`;
}

function getStation(tableName: string): string {
  return TABLE_STATION[tableName] ?? tableName;
}

/** Extract key fields from a data snapshot for display */
function extractDisplayFields(
  tableName: string,
  data: Record<string, any> | null,
): Array<{ key: string; value: string }> {
  if (!data) return [];
  const fields = TABLE_DISPLAY_FIELDS[tableName]
    ?? Object.keys(data).filter((k) => !SYSTEM_FIELDS.has(k)).slice(0, 10);
  return fields
    .filter((f) => data[f] !== undefined && data[f] !== null && data[f] !== '')
    .map((f) => ({ key: f, value: String(data[f]) }));
}

/** Format a snake_case field name into a readable label */
function labelField(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDateRange(preset: 'today' | 'week' | 'custom'): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  if (preset === 'today') return { from: to, to };
  const d = new Date(today);
  d.setDate(d.getDate() - 6);
  return { from: d.toISOString().slice(0, 10), to };
}

// ─── Detail Dialog ───────────────────────────────────────────────────────────

interface DetailDialogProps {
  log: AuditLog | null;
  onClose: () => void;
}

function DetailDialog({ log, onClose }: DetailDialogProps) {
  if (!log) return null;

  const isUpdate  = log.action === 'UPDATE';
  const isInsert  = log.action === 'INSERT';
  const isDelete  = log.action === 'DELETE';
  const dataSnap  = isDelete ? log.old_data : log.new_data;
  const fields    = extractDisplayFields(log.table_name, dataSnap);
  const changedFields = log.changed_fields ?? [];

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Chip
            label={log.action}
            color={ACTION_COLOR[log.action] ?? 'default'}
            size="small"
          />
          <Typography variant="subtitle1" fontWeight={600}>
            {getActivityLabel(log.table_name, log.action)}
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {/* Meta info */}
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            <strong>Staff:</strong> {log.performed_by_name}
            {log.performed_by_role ? ` · ${log.performed_by_role.replace(/_/g, ' ')}` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Branch:</strong> {log.branch_name ?? '—'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Station:</strong> {getStation(log.table_name)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Date / Time:</strong> {formatDateTime(log.created_at)}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
            <strong>Record ID:</strong> {log.record_id}
          </Typography>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {/* UPDATE: show before → after for each changed field */}
        {isUpdate && changedFields.length > 0 && (
          <>
            <Typography variant="subtitle2" gutterBottom>Changes Made</Typography>
            <Stack spacing={1}>
              {changedFields
                .filter((f) => !SYSTEM_FIELDS.has(f))
                .map((f) => {
                  const oldVal = log.old_data?.[f];
                  const newVal = log.new_data?.[f];
                  return (
                    <Paper key={f} variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                        {labelField(f)}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Chip
                          label={oldVal !== undefined && oldVal !== null ? String(oldVal) : '—'}
                          size="small"
                          color="error"
                          variant="outlined"
                          sx={{ maxWidth: 200, overflow: 'hidden' }}
                        />
                        <Typography variant="caption" color="text.secondary">→</Typography>
                        <Chip
                          label={newVal !== undefined && newVal !== null ? String(newVal) : '—'}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ maxWidth: 200, overflow: 'hidden' }}
                        />
                      </Stack>
                    </Paper>
                  );
                })}
            </Stack>
          </>
        )}

        {/* INSERT / DELETE: show key field values */}
        {(isInsert || isDelete) && fields.length > 0 && (
          <>
            <Typography variant="subtitle2" gutterBottom>
              {isInsert ? 'New Record' : 'Deleted Record'}
            </Typography>
            <Stack spacing={0.75}>
              {fields.map(({ key, value }) => (
                <Stack key={key} direction="row" spacing={1} alignItems="flex-start">
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minWidth: 140, flexShrink: 0 }}
                  >
                    {labelField(key)}:
                  </Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                    {value}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </>
        )}

        {/* Fallback when there are no displayable fields */}
        {!isUpdate && fields.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No additional detail available for this entry.
          </Typography>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained" disableElevation>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const TABS: { value: AuditCategory; label: string; description: string }[] = [
  {
    value:       'management',
    label:       'Management',
    description: 'Orders, tables, menu changes, and deliveries',
  },
  {
    value:       'financial',
    label:       'Financial',
    description: 'Shift cash, wastage records, and purchase orders',
  },
  {
    value:       'administrative',
    label:       'Administrative',
    description: 'Staff accounts and inventory catalogue changes',
  },
];

export default function AuditLogPage() {
  const { activeBranchId, branches, isGlobalStaff } = useAuth();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [tab,          setTab]          = useState<AuditCategory>('management');
  const [search,       setSearch]       = useState('');
  const [liveSearch,   setLiveSearch]   = useState('');
  const [datePreset,   setDatePreset]   = useState<'today' | 'week' | 'custom'>('today');
  const [customFrom,   setCustomFrom]   = useState('');
  const [customTo,     setCustomTo]     = useState('');
  const [branchFilter, setBranchFilter] = useState<string>(
    isGlobalStaff ? '__all__' : (activeBranchId ?? ''),
  );

  // ── Pagination state ──────────────────────────────────────────────────────
  const [page,     setPage]     = useState(0);
  const [pageSize, setPageSize] = useState(25);

  // ── Data state ────────────────────────────────────────────────────────────
  const [items,   setItems]   = useState<AuditLog[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Detail dialog ─────────────────────────────────────────────────────────
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);

  // ── Debounce search input ─────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(liveSearch);
      setPage(0); // reset to first page on new search
    }, 400);
    return () => clearTimeout(timer);
  }, [liveSearch]);

  // Reset to page 0 whenever key filters change
  useEffect(() => { setPage(0); }, [tab, datePreset, branchFilter]);

  // ── Effective date range ──────────────────────────────────────────────────
  const dateRange = useMemo(() => {
    if (datePreset === 'custom') return { from: customFrom, to: customTo };
    return getDateRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  // ── Fetch audit logs ──────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    if (!dateRange.from || !dateRange.to) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page:           String(page + 1),
        page_size:      String(pageSize),
        sort_column:    'created_at',
        sort_direction: 'DESC',
        category:       tab,
        date_from:      dateRange.from,
        date_to:        dateRange.to,
        ...(search                          ? { search }                : {}),
        ...(isGlobalStaff && branchFilter   ? { branch_id: branchFilter } : {}),
      };
      const data = await api<{ items: AuditLog[]; total: number }>(
        'audit', 'list', { params },
      );
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error('Audit fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, tab, dateRange, search, branchFilter, isGlobalStaff]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Table column definitions ──────────────────────────────────────────────
  const columns: Column<AuditLog>[] = useMemo(() => [
    {
      id:    'activity',
      label: 'Activity',
      width: 220,
      render: (row) => (
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={row.action}
            color={ACTION_COLOR[row.action] ?? 'default'}
            size="small"
            sx={{ minWidth: 60, fontSize: '0.7rem' }}
          />
          <Typography variant="body2">
            {getActivityLabel(row.table_name, row.action)}
          </Typography>
        </Stack>
      ),
    },
    {
      id:    'station',
      label: 'Station',
      width: 130,
      render: (row) => (
        <Chip label={getStation(row.table_name)} size="small" variant="outlined" />
      ),
    },
    {
      id:    'performed_by_name',
      label: 'Staff',
      width: 180,
      render: (row) => (
        <Stack>
          <Typography variant="body2" fontWeight={500}>{row.performed_by_name}</Typography>
          {row.performed_by_role && (
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
              {row.performed_by_role.replace(/_/g, ' ')}
            </Typography>
          )}
        </Stack>
      ),
    },
    {
      id:    'branch_name',
      label: 'Branch',
      width: 150,
      render: (row) => (
        <Typography variant="body2">{row.branch_name ?? '—'}</Typography>
      ),
    },
    {
      id:    'created_at',
      label: 'Date & Time',
      width: 180,
      render: (row) => (
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          {formatDateTime(row.created_at)}
        </Typography>
      ),
    },
    {
      id:    'details',
      label: 'Details',
      align: 'center',
      width: 70,
      render: (row) => (
        <Tooltip title="View details">
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setDetailLog(row); }}
          >
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ], []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Audit Log</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Read-only record of all system activities
          </Typography>
        </Box>
        {/* Branch selector for global staff only */}
        {isGlobalStaff && (
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Branch</InputLabel>
            <Select
              value={branchFilter}
              label="Branch"
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <MenuItem value="__all__">All Branches</MenuItem>
              {branches.filter((b) => b.is_active).map((b) => (
                <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Stack>

      {/* ── Filters row ─────────────────────────────────────────────────── */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        mb={2}
        flexWrap="wrap"
      >
        {/* Search */}
        <TextField
          size="small"
          placeholder="Search by staff name or station…"
          value={liveSearch}
          onChange={(e) => setLiveSearch(e.target.value)}
          sx={{ flex: '1 1 260px', maxWidth: 360 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        {/* Date preset buttons */}
        <ButtonGroup size="small" variant="outlined">
          <Button
            variant={datePreset === 'today' ? 'contained' : 'outlined'}
            disableElevation
            onClick={() => setDatePreset('today')}
          >
            Today
          </Button>
          <Button
            variant={datePreset === 'week' ? 'contained' : 'outlined'}
            disableElevation
            onClick={() => setDatePreset('week')}
          >
            Last 7 Days
          </Button>
          <Button
            variant={datePreset === 'custom' ? 'contained' : 'outlined'}
            disableElevation
            onClick={() => setDatePreset('custom')}
            startIcon={<CalendarTodayIcon />}
          >
            Custom
          </Button>
        </ButtonGroup>

        {/* Custom date inputs */}
        {datePreset === 'custom' && (
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              type="date"
              size="small"
              label="From"
              value={customFrom}
              InputLabelProps={{ shrink: true }}
              onChange={(e) => setCustomFrom(e.target.value)}
              sx={{ width: 160 }}
            />
            <Typography variant="body2" color="text.secondary">–</Typography>
            <TextField
              type="date"
              size="small"
              label="To"
              value={customTo}
              InputLabelProps={{ shrink: true }}
              onChange={(e) => setCustomTo(e.target.value)}
              sx={{ width: 160 }}
            />
          </Stack>
        )}
      </Stack>

      {/* ── Category tabs ────────────────────────────────────────────────── */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as AuditCategory)}
        sx={{ mb: 0, borderBottom: 1, borderColor: 'divider' }}
      >
        {TABS.map((t) => (
          <Tab
            key={t.value}
            value={t.value}
            label={
              <Tooltip title={t.description} placement="top">
                <span>{t.label}</span>
              </Tooltip>
            }
          />
        ))}
      </Tabs>

      {/* ── Data table ──────────────────────────────────────────────────── */}
      <DataTable<AuditLog>
        columns={columns}
        rows={items}
        totalRows={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        sortBy="created_at"
        sortDir="desc"
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
        rowKey={(r) => r.id}
        emptyMessage="No audit logs found for this period."
        dense
      />

      {/* ── Detail dialog ────────────────────────────────────────────────── */}
      <DetailDialog log={detailLog} onClose={() => setDetailLog(null)} />
    </Box>
  );
}
