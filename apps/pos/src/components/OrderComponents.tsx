/**
 * Shared order management components used by both POSTerminalPage and OrdersPage.
 * - OrderDetailDialog: full order detail with status transition buttons
 * - OrderCard: compact card for grid display
 * - OrdersGrid: paginated grid with search + status filter chips
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Divider, Stack,
  Card, CardContent, CardActions, Alert, IconButton,
  Table, TableHead, TableBody, TableRow, TableCell,
  InputAdornment, TextField, CircularProgress,
  TablePagination, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PaymentIcon from '@mui/icons-material/Payment';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';
import { usePaginated, useApi } from '@/hooks';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ─── Constants ──────────────────────────────────────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
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

export const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  room_service: 'Room Svc',
  bar: 'Bar',
  accommodation: 'Room',
};

// ─── Order Detail Dialog ────────────────────────────────────────────────────────
export interface OrderDetailProps {
  order: any | null;
  currency: string;
  effectiveBranchId: string;
  onClose: () => void;
  onStatusChange?: () => void;
  onPaymentOpen?: (order: any) => void;
}

export function OrderDetailDialog({
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
  const [riderDialogOpen, setRiderDialogOpen] = useState(false);
  const [deliveryRecord, setDeliveryRecord] = useState<any>(null);
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);

  React.useEffect(() => {
    if (!order) { setDetail(null); setDeliveryRecord(null); return; }
    setLoading(true);
    api('orders', 'get', { params: { id: order.id }, branchId: effectiveBranchId })
      .then((d: any) => setDetail(d.order))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
    // Fetch delivery record for delivery orders
    if (order.order_type === 'delivery') {
      api('delivery', 'deliveries', { params: { order_id: order.id }, branchId: effectiveBranchId })
        .then((d: any) => {
          const deliveries = d?.deliveries ?? d?.items ?? [];
          const active = Array.isArray(deliveries)
            ? deliveries.find((del: any) => del.status !== 'cancelled')
            : null;
          setDeliveryRecord(active ?? null);
        })
        .catch(() => setDeliveryRecord(null));
    }
  }, [order?.id]);

  const doStatus = async (newStatus: string) => {
    if (!detail) return;
    setActioning(true);
    try {
      await api('orders', 'update-status', {
        body: { order_id: detail.id, new_status: newStatus },
        branchId: effectiveBranchId,
      });
      // If marking as delivered/completed on a delivery order, also update the delivery record
      if ((newStatus === 'completed' || newStatus === 'delivered') && deliveryRecord?.id) {
        await api('delivery', 'update-status', {
          method: 'POST',
          body: { delivery_id: deliveryRecord.id, old_status: deliveryRecord.status, new_status: 'delivered' },
          branchId: effectiveBranchId,
        }).catch(() => {/* non-critical */});
      }
      toast.success(`Order #${detail.order_number} → ${newStatus.replace(/_/g, ' ')}`);
      setDetail((d: any) => ({ ...d, status: newStatus }));
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
  const orderTotal = Number(d?.total ?? d?.total_amount ?? 0);

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
                  {items.map((it: any, idx: number) => {
                    const extras: any[] = Array.isArray(it.selected_extras) ? it.selected_extras : [];
                    const removed: any[] = Array.isArray(it.removed_ingredients) ? it.removed_ingredients : [];
                    return (
                    <TableRow key={it.id ?? idx}>
                      <TableCell>
                        {it.item_name ?? it.menu_item_name ?? it.name}
                        {it.variant_name ? <Typography variant="caption" display="block" color="text.secondary">{it.variant_name}</Typography> : null}
                        {extras.length > 0 && extras.map((e: any, i: number) => (
                          <Typography key={i} variant="caption" display="block" color="success.main">
                            + {e.name} (+{formatCurrency(e.price ?? 0, currency)})
                          </Typography>
                        ))}
                        {removed.length > 0 && removed.map((r: any, i: number) => (
                          <Typography key={i} variant="caption" display="block" color="error.main">
                            − {r.name}{(r.cost_contribution ?? 0) > 0 ? ` (−${formatCurrency(r.cost_contribution, currency)})` : ''}
                          </Typography>
                        ))}
                      </TableCell>
                      <TableCell align="right">{it.quantity}</TableCell>
                      <TableCell align="right">{formatCurrency(it.unit_price ?? it.price ?? 0, currency)}</TableCell>
                      <TableCell align="right">{formatCurrency(it.line_total ?? it.item_total ?? ((it.quantity ?? 0) * (it.unit_price ?? it.price ?? 0)), currency)}</TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <Typography variant="body2" color="text.secondary">No item details available</Typography>
            )}

            <Divider sx={{ my: 1.5 }} />

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
            {d?.is_special_request ? (
              <Button variant="contained" color="success" size="small" disabled={actioning} onClick={() => setPricingDialogOpen(true)}>
                Approve & Set Price
              </Button>
            ) : (
              <Button variant="contained" color="success" size="small" disabled={actioning} onClick={() => doStatus('pending')}>
                Approve
              </Button>
            )}
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
          <Button variant="contained" color="info" size="small" disabled={actioning}
            startIcon={<LocalShippingIcon />}
            onClick={() => setRiderDialogOpen(true)}>
            Assign to Rider
          </Button>
        )}
        {d?.status === 'out_for_delivery' && (
          <Button variant="contained" color="success" size="small" disabled={actioning} onClick={() => doStatus('completed')}>
            Delivered
          </Button>
        )}
        {d?.status === 'ready' && d?.order_type !== 'delivery' && (
          <Button variant="contained" color="success" size="small" disabled={actioning}
            onClick={() => doStatus(d?.source === 'online' ? 'completed' : 'awaiting_payment')}>
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

      {/* Rider Assignment Dialog */}
      <RiderAssignDialog
        open={riderDialogOpen}
        orderNumber={d?.order_number}
        deliveryRecord={deliveryRecord}
        orderId={d?.id}
        branchId={effectiveBranchId}
        onClose={() => setRiderDialogOpen(false)}
        onAssigned={() => {
          setRiderDialogOpen(false);
          doStatus('out_for_delivery');
        }}
      />

      {/* Special Request Pricing Dialog */}
      <SpecialRequestPricingDialog
        open={pricingDialogOpen}
        orderNumber={d?.order_number}
        specialRequestNotes={d?.special_request_notes}
        orderId={d?.id}
        branchId={effectiveBranchId}
        currency={currency}
        onClose={() => setPricingDialogOpen(false)}
        onPriced={() => {
          setPricingDialogOpen(false);
          setDetail((prev: any) => ({ ...prev, status: 'awaiting_payment' }));
          onStatusChange?.();
        }}
      />
    </Dialog>
  );
}

// ─── Rider Assignment Dialog ────────────────────────────────────────────────────
function RiderAssignDialog({ open, orderNumber, deliveryRecord, orderId, branchId, onClose, onAssigned }: {
  open: boolean;
  orderNumber?: string;
  deliveryRecord: any;
  orderId?: string;
  branchId: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { data: ridersData } = useApi<{ riders: any[] }>('delivery', 'riders');
  const riders = (ridersData?.riders ?? []).filter((r: any) => r.is_available && r.is_active);
  const [riderId, setRiderId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAssign = async () => {
    if (!riderId) { toast.error('Select a rider'); return; }
    setSaving(true);
    try {
      if (deliveryRecord?.id) {
        // Existing delivery record (online orders) — reassign rider
        await api('delivery', 'reassign', {
          method: 'POST',
          body: { delivery_id: deliveryRecord.id, rider_id: riderId },
          branchId,
        });
      } else if (orderId) {
        // No delivery record — create one with rider
        await api('delivery', 'assign', {
          method: 'POST',
          body: { order_id: orderId, rider_id: riderId },
          branchId,
        });
      }
      toast.success('Rider assigned');
      setRiderId('');
      onAssigned();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to assign rider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} fullWidth maxWidth="xs" onClose={onClose}>
      <DialogTitle>Assign Rider — Order #{orderNumber}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {riders.length === 0 ? (
          <Alert severity="warning">No available riders at this time.</Alert>
        ) : (
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Select Rider</InputLabel>
            <Select label="Select Rider" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
              {riders.map((r: any) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name} — {r.vehicle_type} {r.license_plate ? `(${r.license_plate})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleAssign} disabled={saving || riders.length === 0 || !riderId}>
          {saving ? <CircularProgress size={20} /> : 'Assign & Dispatch'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Special Request Pricing Dialog ─────────────────────────────────────────
function SpecialRequestPricingDialog({ open, orderNumber, specialRequestNotes, orderId, branchId, currency, onClose, onPriced }: {
  open: boolean;
  orderNumber?: string;
  specialRequestNotes?: string;
  orderId?: string;
  branchId: string;
  currency: string;
  onClose: () => void;
  onPriced: () => void;
}) {
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const numPrice = Number(price);
    if (!price || isNaN(numPrice) || numPrice <= 0) {
      toast.error('Enter a valid price');
      return;
    }
    setSaving(true);
    try {
      await api('orders', 'price-special-request', {
        method: 'POST',
        body: { order_id: orderId, price: numPrice },
        branchId,
      });
      toast.success(`Order #${orderNumber} priced at ${formatCurrency(numPrice, currency)}`);
      setPrice('');
      onPriced();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to set price');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} fullWidth maxWidth="xs" onClose={onClose}>
      <DialogTitle>Set Price — Order #{orderNumber}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {specialRequestNotes && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={700}>⭐ Customer Request</Typography>
            <Typography variant="body2">{specialRequestNotes}</Typography>
          </Alert>
        )}
        <TextField
          fullWidth
          label="Price"
          type="number"
          size="small"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> },
            htmlInput: { min: 0, step: 0.01 },
          }}
          sx={{ mt: 1 }}
          autoFocus
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" color="success" onClick={handleSubmit} disabled={saving || !price}>
          {saving ? <CircularProgress size={20} /> : 'Approve & Set Price'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Order Card ─────────────────────────────────────────────────────────────────
export interface OrderCardProps {
  order: any;
  currency: string;
  onViewDetail: (o: any) => void;
  onPayment?: (o: any) => void;
  onQuickStatus?: (o: any, status: string) => void;
  showPayBtn?: boolean;
  showServedForPending?: boolean;
  servedTargetStatus?: string;
  showSource?: boolean;
}

export function OrderCard({ order, currency, onViewDetail, onPayment, onQuickStatus, showPayBtn, showServedForPending, servedTargetStatus, showSource }: OrderCardProps) {
  const items: any[] = order.order_items ?? order.items ?? [];
  const itemCount = items.length;
  // Online orders go straight to completed (pre-paid); POS orders go to awaiting_payment
  const servedTarget = order.source === 'online' ? 'completed' : (servedTargetStatus ?? 'awaiting_payment');
  const showServed = showServedForPending
    ? ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status)
    : order.status === 'ready';

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

        {showSource && (
          <Chip
            size="small"
            label={order.source === 'online' ? '🌐 Online' : '🏪 Internal'}
            variant="outlined"
            color={order.source === 'online' ? 'info' : 'default'}
            sx={{ fontSize: 10, height: 18, mt: 0.5 }}
          />
        )}

        {itemCount > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {itemCount} item{itemCount !== 1 ? 's' : ''}
            {items.slice(0, 2).map((it: any, i: number) => (
              <span key={i}> · {it.quantity ?? 1}× {it.item_name ?? it.menu_item_name ?? it.name ?? '?'}</span>
            ))}
            {itemCount > 2 ? <span> +{itemCount - 2} more</span> : null}
          </Typography>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11 }}>
            {formatDateTime(order.created_at)}
          </Typography>
          <Typography variant="subtitle2" fontWeight={700} color="primary.main">
            {formatCurrency(order.total ?? order.total_amount, currency)}
          </Typography>
        </Box>
      </CardContent>

      <CardActions sx={{ pt: 0, px: 2, pb: 1.5, gap: 0.75 }}>
        <Button size="small" startIcon={<VisibilityIcon />} onClick={() => onViewDetail(order)}>Details</Button>
        {order.status === 'awaiting_approval' && !order.is_special_request && onQuickStatus && (
          <Button size="small" variant="contained" color="success" onClick={() => onQuickStatus(order, 'pending')}>
            Approve
          </Button>
        )}
        {order.status === 'awaiting_approval' && order.is_special_request && (
          <Chip size="small" label="⭐ Needs Pricing" color="warning" sx={{ fontSize: 10, height: 22 }} />
        )}
        {showServed && order.order_type !== 'delivery' && onQuickStatus && (
          <Button size="small" variant="contained" color="success" onClick={() => onQuickStatus(order, servedTarget)}>
            Served?
          </Button>
        )}
        {showPayBtn && order.status === 'awaiting_payment' && onPayment && (
          <Button size="small" variant="contained" color="error" startIcon={<PaymentIcon />} onClick={() => onPayment(order)}>
            Pay
          </Button>
        )}
      </CardActions>
    </Card>
  );
}

// ─── Orders Grid ────────────────────────────────────────────────────────────────
export interface OrdersGridProps {
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
  showServedForPending?: boolean;
  servedTargetStatus?: string;
  showSource?: boolean;
}

export function OrdersGrid({
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
  showServedForPending,
  servedTargetStatus,
  showSource,
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

  const { items: orders, loading, refetch, total, page, setPage, pageSize, setPageSize } = usePaginated<any>('orders', 'list', params);

  const handleStatusChange = useCallback(async (order: any, newStatus: string) => {
    try {
      await api('orders', 'update-status', {
        body: { order_id: order.id, new_status: newStatus },
        branchId: effectiveBranchId,
      });
      toast.success(`Order #${order.order_number} → ${newStatus.replace(/_/g, ' ')}`);
      refetch();
      onQuickStatus?.(order, newStatus);
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
                showServedForPending={showServedForPending}
                servedTargetStatus={servedTargetStatus}
                showSource={showSource}
              />
            ))}
          </Box>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 20, 50]}
            sx={{ mt: 2, borderTop: '1px solid', borderColor: 'divider' }}
          />
        </>
      )}
    </Box>
  );
}
