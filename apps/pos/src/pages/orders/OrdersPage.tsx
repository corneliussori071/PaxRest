import React, { useState, useMemo, useCallback } from 'react';
import {
  Box, Tabs, Tab, Typography, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Divider, Stack,
  Card, CardContent, CardActions, Alert, IconButton,
  Table, TableHead, TableBody, TableRow, TableCell,
  InputAdornment, TextField, CircularProgress, Badge,
  Paper, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PaymentIcon from '@mui/icons-material/Payment';
import HotelIcon from '@mui/icons-material/Hotel';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import TwoWheelerIcon from '@mui/icons-material/TwoWheeler';
import PersonPinIcon from '@mui/icons-material/PersonPin';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';
import { StatusBadge } from '@paxrest/ui';
import { usePaginated, useRealtime, useApi } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import BranchSelector from '@/components/BranchSelector';
import PaymentDialog from '@/components/PaymentDialog';
import toast from 'react-hot-toast';

// ─── Status colour helper ──────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  awaiting_approval: '#f59e0b',
  pending: '#6366f1',
  confirmed: '#3b82f6',
  preparing: '#8b5cf6',
  ready: '#22c55e',
  out_for_delivery: '#0ea5e9',
  completed: '#10b981',
  awaiting_payment: '#ef4444',
  cancelled: '#6b7280',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  room_service: 'Room Svc',
  bar: 'Bar',
  accommodation: 'Room',
};

// ─── Order Detail Dialog (shared) ─────────────────────────────────────────────
interface OrderDetailProps {
  order: any | null;
  currency: string;
  effectiveBranchId: string;
  onClose: () => void;
  onStatusChange?: () => void;
  onPaymentOpen?: (order: any) => void;
}

function OrderDetailDialog({
  order,
  currency,
  effectiveBranchId,
  onClose,
  onStatusChange,
  onPaymentOpen,
}: OrderDetailProps) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actioning, setActioning] = useState(false);

  React.useEffect(() => {
    if (!order) { setDetail(null); return; }
    setLoading(true);
    api('orders', 'get', { params: { id: order.id }, branchId: effectiveBranchId })
      .then((d: any) => setDetail(d.order))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [order?.id]);

  const doStatus = async (status: string) => {
    if (!detail) return;
    setActioning(true);
    try {
      await api('orders', 'update-status', {
        body: { order_id: detail.id, status },
        branchId: effectiveBranchId,
      });
      toast.success(`Order #${detail.order_number} → ${status.replace(/_/g, ' ')}`);
      setDetail((d: any) => ({ ...d, status }));
      onStatusChange?.();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update status');
    } finally {
      setActioning(false);
    }
  };

  const d = detail ?? order;
  const items: any[] = detail?.items ?? detail?.order_items ?? [];
  const payments: any[] = detail?.order_payments ?? [];
  const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
  const orderTotal = Number(d?.total_amount ?? 0);

  return (
    <Dialog open={!!order} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6">Order #{d?.order_number}</Typography>
          <Chip
            size="small"
            label={d?.status?.replace(/_/g, ' ')}
            sx={{ bgcolor: STATUS_COLORS[d?.status] ?? '#6b7280', color: '#fff', mt: 0.5, fontSize: 11 }}
          />
        </Box>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {(d?.order_type && ORDER_TYPE_LABELS[d.order_type]) || d?.order_type}
              {d?.source === 'online' ? ' · 🌐 Online' : ' · 🏪 POS'}
              {d?.customer_name ? ` · ${d.customer_name}` : ''}
              {d?.customer_phone ? ` · ${d.customer_phone}` : ''}
              {d?.table_name ? ` · Table: ${d.table_name}` : ''}
              {d?.created_at ? ` · ${formatDateTime(d.created_at)}` : ''}
            </Typography>

            <Divider sx={{ my: 1.5 }} />

            {/* Order items */}
            {items.length > 0 ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Item</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Unit</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((it: any, idx: number) => (
                    <TableRow key={it.id ?? idx}>
                      <TableCell>
                        {it.item_name ?? it.name}
                        {it.variant_name ? <Typography variant="caption" display="block" color="text.secondary">{it.variant_name}</Typography> : null}
                      </TableCell>
                      <TableCell align="right">{it.quantity}</TableCell>
                      <TableCell align="right">{formatCurrency(it.unit_price ?? it.price ?? 0, currency)}</TableCell>
                      <TableCell align="right">{formatCurrency(it.line_total ?? ((it.quantity ?? 0) * (it.unit_price ?? it.price ?? 0)), currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Typography variant="body2" color="text.secondary">No item details available</Typography>
            )}

            <Divider sx={{ my: 1.5 }} />

            {/* Totals */}
            <Stack spacing={0.5}>
              {d?.tax_amount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Tax</Typography>
                  <Typography variant="body2">{formatCurrency(d.tax_amount, currency)}</Typography>
                </Box>
              )}
              {d?.discount_amount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Discount</Typography>
                  <Typography variant="body2" color="error.main">−{formatCurrency(d.discount_amount, currency)}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography fontWeight={700}>Total</Typography>
                <Typography fontWeight={700}>{formatCurrency(orderTotal, currency)}</Typography>
              </Box>
              {totalPaid > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Paid</Typography>
                  <Typography variant="body2" color="success.main">{formatCurrency(totalPaid, currency)}</Typography>
                </Box>
              )}
            </Stack>

            {d?.notes && (
              <Alert severity="info" sx={{ mt: 2, py: 0.5 }}>
                <Typography variant="body2">{d.notes}</Typography>
              </Alert>
            )}
            {d?.is_special_request && (
              <Alert severity="warning" sx={{ mt: 1, py: 0.5 }}>
                <Typography variant="body2" fontWeight={700}>⭐ Special Request</Typography>
                {d?.special_request_notes && <Typography variant="body2">{d.special_request_notes}</Typography>}
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, py: 2 }}>
        {d?.status === 'awaiting_approval' && (
          <>
            <Button variant="contained" color="success" size="small" disabled={actioning} onClick={() => doStatus('pending')}>
              Approve
            </Button>
            <Button variant="outlined" color="error" size="small" disabled={actioning} onClick={() => doStatus('cancelled')}>
              Decline
            </Button>
          </>
        )}
        {d?.status === 'pending' && (
          <Button variant="contained" size="small" disabled={actioning} onClick={() => doStatus('confirmed')}>Confirm</Button>
        )}
        {d?.status === 'confirmed' && (
          <Button variant="contained" size="small" disabled={actioning} onClick={() => doStatus('preparing')}>Start Preparing</Button>
        )}
        {d?.status === 'preparing' && (
          <Button variant="contained" size="small" disabled={actioning} onClick={() => doStatus('ready')}>Mark Ready</Button>
        )}
        {d?.status === 'ready' && d?.order_type === 'delivery' && (
          <Button variant="contained" color="info" size="small" disabled={actioning} onClick={() => doStatus('out_for_delivery')}>
            Out for Delivery
          </Button>
        )}
        {d?.status === 'ready' && d?.order_type !== 'delivery' && (
          <Button variant="contained" color="success" size="small" disabled={actioning} onClick={() => doStatus('awaiting_payment')}>
            Mark as Served
          </Button>
        )}
        {d?.status === 'awaiting_payment' && onPaymentOpen && (
          <Button
            variant="contained"
            color="error"
            size="small"
            startIcon={<PaymentIcon />}
            onClick={() => { onPaymentOpen(d); onClose(); }}
          >
            Process Payment
          </Button>
        )}
        {['pending', 'confirmed', 'preparing'].includes(d?.status ?? '') && (
          <Button variant="outlined" color="error" size="small" disabled={actioning} onClick={() => doStatus('cancelled')}>
            Cancel
          </Button>
        )}
        <Button size="small" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Order Card (compact) ──────────────────────────────────────────────────────
interface OrderCardProps {
  order: any;
  currency: string;
  onViewDetail: (o: any) => void;
  onPayment?: (o: any) => void;
  onQuickStatus?: (o: any, status: string) => void;
  showPayBtn?: boolean;
}

function OrderCard({ order, currency, onViewDetail, onPayment, onQuickStatus, showPayBtn }: OrderCardProps) {
  const items: any[] = order.order_items ?? order.items ?? [];
  const itemCount = items.length;

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        borderLeft: `4px solid ${STATUS_COLORS[order.status] ?? '#e5e7eb'}`,
        transition: 'box-shadow 0.15s',
        '&:hover': { boxShadow: 3 },
      }}
    >
      <CardContent sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>#{order.order_number}</Typography>
            <Typography variant="caption" color="text.secondary">
              {ORDER_TYPE_LABELS[order.order_type] ?? order.order_type}
              {order.customer_name ? ` · ${order.customer_name}` : ''}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={order.status?.replace(/_/g, ' ')}
            sx={{ bgcolor: STATUS_COLORS[order.status] ?? '#6b7280', color: '#fff', fontSize: 10, height: 20 }}
          />
        </Box>

        {itemCount > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {itemCount} item{itemCount !== 1 ? 's' : ''}
            {items.slice(0, 2).map((it: any, i: number) => (
              <span key={i}> · {it.quantity ?? 1}× {it.item_name ?? it.name ?? '?'}</span>
            ))}
            {itemCount > 2 ? <span> +{itemCount - 2} more</span> : null}
          </Typography>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11 }}>
            {formatDateTime(order.created_at)}
          </Typography>
          <Typography variant="subtitle2" fontWeight={700} color="primary.main">
            {formatCurrency(order.total_amount, currency)}
          </Typography>
        </Box>
      </CardContent>

      <CardActions sx={{ pt: 0, px: 2, pb: 1.5, gap: 0.75 }}>
        <Button size="small" startIcon={<VisibilityIcon />} onClick={() => onViewDetail(order)}>Details</Button>
        {/* Quick approve for awaiting_approval */}
        {order.status === 'awaiting_approval' && onQuickStatus && (
          <Button size="small" variant="contained" color="success" onClick={() => onQuickStatus(order, 'pending')}>
            Approve
          </Button>
        )}
        {/* Mark served for dine_in/takeaway/bar when ready */}
        {order.status === 'ready' && order.order_type !== 'delivery' && onQuickStatus && (
          <Button size="small" variant="contained" color="success" onClick={() => onQuickStatus(order, 'awaiting_payment')}>
            Served?
          </Button>
        )}
        {/* Process payment */}
        {showPayBtn && order.status === 'awaiting_payment' && onPayment && (
          <Button size="small" variant="contained" color="error" startIcon={<PaymentIcon />} onClick={() => onPayment(order)}>
            Pay
          </Button>
        )}
      </CardActions>
    </Card>
  );
}

// ─── Orders grid with search + status filters ──────────────────────────────────
interface OrdersGridProps {
  source?: 'pos' | 'online';
  orderTypes?: string;
  extraParams?: Record<string, string>;
  currency: string;
  effectiveBranchId: string;
  onViewDetail?: (o: any) => void;
  onPayment?: (o: any) => void;
  onQuickStatus?: (o: any, status: string) => void;
  defaultStatus?: string;
  statusOptions?: string[];
  showPayBtn?: boolean;
}

function OrdersGrid({
  source,
  orderTypes,
  extraParams,
  currency,
  effectiveBranchId,
  onViewDetail,
  onPayment,
  onQuickStatus,
  defaultStatus = '',
  statusOptions,
  showPayBtn,
}: OrdersGridProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(defaultStatus);

  const params = useMemo(() => ({
    ...(source ? { source } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(orderTypes ? { order_type: orderTypes } : {}),
    ...(search ? { search } : {}),
    ...extraParams,
  }), [source, statusFilter, orderTypes, search, extraParams]);

  const { items: orders, loading, refetch, total } = usePaginated<any>('orders', 'list', params);

  const handleStatusChange = useCallback(async (order: any, status: string) => {
    try {
      await api('orders', 'update-status', {
        body: { order_id: order.id, status },
        branchId: effectiveBranchId,
      });
      toast.success(`Order #${order.order_number} → ${status.replace(/_/g, ' ')}`);
      refetch();
      onQuickStatus?.(order, status);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed');
    }
  }, [effectiveBranchId, refetch]);

  const allStatuses: string[] = statusOptions ?? [
    '', 'awaiting_approval', 'pending', 'confirmed', 'preparing', 'ready',
    'out_for_delivery', 'awaiting_payment', 'completed', 'cancelled',
  ];

  return (
    <Box>
      {/* Search + status filter */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          placeholder="Search order #, customer…"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220 }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            },
          }}
        />
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {allStatuses.map((s) => (
            <Chip
              key={s || 'all'}
              label={s ? s.replace(/_/g, ' ') : 'All'}
              size="small"
              color={statusFilter === s ? 'primary' : 'default'}
              variant={statusFilter === s ? 'filled' : 'outlined'}
              onClick={() => setStatusFilter(s)}
            />
          ))}
        </Box>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : orders.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>No orders found.</Alert>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
            {total} order{total !== 1 ? 's' : ''}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
              gap: 2,
            }}
          >
            {orders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                currency={currency}
                onViewDetail={onViewDetail ?? (() => {})}
                onPayment={onPayment}
                onQuickStatus={handleStatusChange}
                showPayBtn={showPayBtn}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { activeBranchId, company, activeBranch, isGlobalStaff } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';

  // Branch selector for global staff
  const [branchFilter, setBranchFilter] = useState<string | null>(
    isGlobalStaff ? null : activeBranchId,
  );
  const effectiveBranchId = isGlobalStaff ? (branchFilter ?? '__all__') : (activeBranchId ?? '');

  // Main tab: 0 = Internal, 1 = Online
  const [mainTab, setMainTab] = useState(0);
  // Internal sub-tabs: 0=Pending Pay, 1=Meals, 2=Rooms, 3=Bar
  const [internalSub, setInternalSub] = useState(0);

  // Shared detail / payment dialog state
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [payOrder, setPayOrder] = useState<any | null>(null);

  // Real-time refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);
  const doRefresh = () => setRefreshKey((k) => k + 1);

  useRealtime(
    'orders',
    activeBranchId ? { column: 'branch_id', value: activeBranchId } : undefined,
    doRefresh,
  );

  return (
    <Box>
      {/* ── Global staff branch picker ────────────────────────────────── */}
      {isGlobalStaff && (
        <Box sx={{ mb: 2 }}>
          <BranchSelector showAll compact value={branchFilter} onChange={setBranchFilter} />
        </Box>
      )}

      {/* ── Main tab bar ──────────────────────────────────────────────── */}
      <Tabs
        value={mainTab}
        onChange={(_, v) => setMainTab(v)}
        sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Tab label="🏪 Internal" />
        <Tab label="🌐 Online" />
      </Tabs>

      {/* ══ INTERNAL tab ════════════════════════════════════════════════ */}
      {mainTab === 0 && (
        <Box>
          <Tabs
            value={internalSub}
            onChange={(_, v) => setInternalSub(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ mb: 2 }}
            TabIndicatorProps={{ style: { background: '#1976d2', height: 3 } }}
          >
            <Tab label="💳 Pending Payments" />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><RestaurantIcon sx={{ fontSize: 16 }} /> Meals</Box>} />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><HotelIcon sx={{ fontSize: 16 }} /> Rooms</Box>} />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><LocalBarIcon sx={{ fontSize: 16 }} /> Bar</Box>} />
          </Tabs>

          {/* Sub-tab: Pending Payments */}
          {internalSub === 0 && (
            <OrdersGrid
              key={`pending-pay-${refreshKey}`}
              defaultStatus="awaiting_payment"
              statusOptions={['awaiting_payment']}
              currency={currency}
              effectiveBranchId={effectiveBranchId}
              onViewDetail={setDetailOrder}
              onPayment={setPayOrder}
              showPayBtn
            />
          )}

          {/* Sub-tab: Meals (POS food orders) */}
          {internalSub === 1 && (
            <OrdersGrid
              key={`meals-${refreshKey}`}
              source="pos"
              statusOptions={['', 'pending', 'confirmed', 'preparing', 'ready', 'awaiting_payment', 'completed', 'cancelled']}
              currency={currency}
              effectiveBranchId={effectiveBranchId}
              onViewDetail={setDetailOrder}
              onPayment={setPayOrder}
              showPayBtn
            />
          )}

          {/* Sub-tab: Rooms */}
          {internalSub === 2 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
                <Typography variant="body2">
                  Room bookings and check-ins are managed from the <strong>Accommodation</strong> page. Orders are shown below for reference.
                </Typography>
              </Alert>
              <OrdersGrid
                key={`rooms-${refreshKey}`}
                extraParams={{ order_type: 'accommodation' }}
                statusOptions={['', 'awaiting_approval', 'pending', 'confirmed', 'awaiting_payment', 'completed', 'cancelled']}
                currency={currency}
                effectiveBranchId={effectiveBranchId}
                onViewDetail={setDetailOrder}
                onPayment={setPayOrder}
                showPayBtn
              />
            </Box>
          )}

          {/* Sub-tab: Bar */}
          {internalSub === 3 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
                <Typography variant="body2">
                  Bar POS transactions are managed from the <strong>Bar</strong> page. Orders are shown below for reference.
                </Typography>
              </Alert>
              <OrdersGrid
                key={`bar-${refreshKey}`}
                extraParams={{ order_type: 'bar' }}
                statusOptions={['', 'pending', 'confirmed', 'preparing', 'ready', 'awaiting_payment', 'completed', 'cancelled']}
                currency={currency}
                effectiveBranchId={effectiveBranchId}
                onViewDetail={setDetailOrder}
                onPayment={setPayOrder}
                showPayBtn
              />
            </Box>
          )}
        </Box>
      )}

      {/* ══ ONLINE tab ══════════════════════════════════════════════════ */}
      {mainTab === 1 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
            <Typography variant="body2">
              Online orders from the customer app. Approve → Confirm → Prepare → <strong>Served?</strong> (or assign rider for delivery) → Payment.
            </Typography>
          </Alert>
          <OrdersGrid
            key={`online-${refreshKey}`}
            source="online"
            statusOptions={['', 'awaiting_approval', 'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'awaiting_payment', 'completed', 'cancelled']}
            currency={currency}
            effectiveBranchId={effectiveBranchId}
            onViewDetail={setDetailOrder}
            onPayment={setPayOrder}
            showPayBtn
          />
        </Box>
      )}

      {/* ── Shared dialogs ────────────────────────────────────────────── */}
      <OrderDetailDialog
        order={detailOrder}
        currency={currency}
        effectiveBranchId={effectiveBranchId}
        onClose={() => setDetailOrder(null)}
        onStatusChange={doRefresh}
        onPaymentOpen={(o) => { setPayOrder(o); setDetailOrder(null); }}
      />

      <PaymentDialog
        open={!!payOrder}
        order={payOrder}
        currency={currency}
        effectiveBranchId={effectiveBranchId}
        onClose={() => setPayOrder(null)}
        onPaid={doRefresh}
      />
    </Box>
  );
}
