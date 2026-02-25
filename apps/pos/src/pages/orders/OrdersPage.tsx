import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Chip, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, Divider, Grid,
} from '@mui/material';
import { DataTable, StatusBadge, type Column } from '@paxrest/ui';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';
import { usePaginated, useRealtime } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import BranchSelector from '@/components/BranchSelector';
import toast from 'react-hot-toast';

export default function OrdersPage() {
  const { activeBranchId, company, activeBranch, isGlobalStaff, branches } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // For global staff: local branch filter (null = all branches)
  const [branchFilter, setBranchFilter] = useState<string | null>(
    isGlobalStaff ? null : activeBranchId,
  );

  // The branchId to send in API calls
  const effectiveBranchId = isGlobalStaff ? (branchFilter ?? '__all__') : (activeBranchId ?? '');

  const {
    items: orders, total, loading, page, pageSize, sortBy, sortDir,
    setPage, setPageSize, onSortChange, refetch,
  } = usePaginated<any>('orders', 'list', statusFilter ? { status: statusFilter } : undefined);

  // Real-time order updates
  useRealtime('orders', activeBranchId ? { column: 'branch_id', value: activeBranchId } : undefined, () => {
    refetch();
  });

  const openDetail = async (order: any) => {
    setSelectedOrder(order);
    setDetailLoading(true);
    try {
      const data = await api('orders', 'get', {
        params: { id: order.id },
        branchId: effectiveBranchId,
      });
      setDetail(data.order);
    } catch { /* ignore */ } finally { setDetailLoading(false); }
  };

  const updateStatus = async (orderId: string, status: string) => {
    try {
      await api('orders', 'update-status', {
        body: { order_id: orderId, status },
        branchId: effectiveBranchId,
      });
      toast.success(`Order updated to ${status}`);
      refetch();
      if (detail?.id === orderId) setDetail({ ...detail, status });
    } catch (err: any) { toast.error(err.message); }
  };

  const statuses = ['', 'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];

  const columns: Column[] = useMemo(() => {
    const base: Column[] = [
      { id: 'order_number', label: '#', width: 80, render: (r) => <Typography fontWeight={700}>#{r.order_number}</Typography> },
      { id: 'order_type', label: 'Type', render: (r) => <Chip size="small" label={r.order_type?.replace('_', ' ')} /> },
      { id: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} type="order" /> },
      { id: 'total_amount', label: 'Total', render: (r) => formatCurrency(r.total_amount, currency) },
      { id: 'customer_name', label: 'Customer', render: (r) => r.customer_name ?? '—' },
    ];
    // Show branch column when global staff views all branches
    if (isGlobalStaff && !branchFilter) {
      base.push({
        id: 'branch_id', label: 'Branch', width: 140,
        render: (r) => {
          const b = branches.find((br) => br.id === r.branch_id);
          return <Typography variant="body2">{b?.name ?? '—'}</Typography>;
        },
      });
    }
    base.push({ id: 'created_at', label: 'Time', render: (r) => formatDateTime(r.created_at) });
    return base;
  }, [isGlobalStaff, branchFilter, currency, branches]);

  return (
    <Box>
      {/* Branch filter for global staff */}
      {isGlobalStaff && (
        <Box sx={{ mb: 2 }}>
          <BranchSelector
            showAll
            compact
            value={branchFilter}
            onChange={(id) => setBranchFilter(id)}
          />
        </Box>
      )}

      {/* Status filter chips */}
      <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {statuses.map((s) => (
          <Chip
            key={s || 'all'}
            label={s ? s.replace('_', ' ') : 'All'}
            color={statusFilter === s ? 'primary' : 'default'}
            variant={statusFilter === s ? 'filled' : 'outlined'}
            onClick={() => setStatusFilter(s)}
            size="small"
          />
        ))}
      </Box>

      <DataTable
        columns={columns}
        rows={orders}
        totalRows={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        sortBy={sortBy}
        sortDir={sortDir}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSortChange={onSortChange}
        onRowClick={openDetail}
        rowKey={(r) => r.id}
      />

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onClose={() => setSelectedOrder(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Order #{selectedOrder?.order_number}
          <StatusBadge status={detail?.status ?? selectedOrder?.status ?? ''} type="order" sx={{ ml: 1 }} />
        </DialogTitle>
        <DialogContent>
          {detail && (
            <>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {detail.order_type?.replace('_', ' ')} • {formatDateTime(detail.created_at)}
                {detail.customer_name && ` • ${detail.customer_name}`}
                {detail.table_name && ` • Table: ${detail.table_name}`}
              </Typography>
              <Divider sx={{ my: 1.5 }} />
              {detail.items?.map((item: any) => (
                <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                  <Typography variant="body2">
                    {item.quantity}× {item.item_name}
                    {item.variant_name ? ` (${item.variant_name})` : ''}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {formatCurrency(item.line_total, currency)}
                  </Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography fontWeight={700}>Total</Typography>
                <Typography fontWeight={700}>{formatCurrency(detail.total_amount, currency)}</Typography>
              </Box>
              {detail.notes && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Notes: {detail.notes}
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          {detail?.status === 'pending' && (
            <Button variant="contained" onClick={() => updateStatus(detail.id, 'confirmed')}>Confirm</Button>
          )}
          {detail?.status === 'confirmed' && (
            <Button variant="contained" onClick={() => updateStatus(detail.id, 'preparing')}>Start Preparing</Button>
          )}
          {detail?.status === 'ready' && detail?.order_type !== 'delivery' && (
            <Button variant="contained" color="success" onClick={() => updateStatus(detail.id, 'completed')}>Complete</Button>
          )}
          {['pending', 'confirmed'].includes(detail?.status) && (
            <Button variant="outlined" color="error" onClick={() => updateStatus(detail.id, 'cancelled')}>Cancel</Button>
          )}
          <Button onClick={() => setSelectedOrder(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
