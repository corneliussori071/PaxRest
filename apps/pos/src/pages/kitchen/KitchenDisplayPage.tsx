import React, { useState, useEffect, useCallback } from 'react';
import { Box, ToggleButtonGroup, ToggleButton, Typography, Grid } from '@mui/material';
import { KDSOrderCard } from '@paxrest/ui';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/hooks';
import toast from 'react-hot-toast';

const STATIONS = [
  { id: '', label: 'All' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bar', label: 'Bar' },
  { id: 'shisha', label: 'Shisha' },
];

interface KDSOrder {
  id: string;
  order_number: number;
  order_type: string;
  table_name?: string;
  customer_name?: string;
  created_at: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    modifiers?: string[];
    notes?: string;
    status: string;
  }[];
}

export default function KitchenDisplayPage() {
  const { activeBranchId } = useAuth();
  const [station, setStation] = useState('');
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (station) params.station = station;
      const data = await api<{ orders: KDSOrder[] }>('kitchen', 'orders', {
        params,
        branchId: activeBranchId ?? undefined,
      });
      setOrders(data.orders ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [station, activeBranchId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-refresh every 15s
  useEffect(() => {
    const iv = setInterval(fetchOrders, 15_000);
    return () => clearInterval(iv);
  }, [fetchOrders]);

  // Realtime
  useRealtime('orders', activeBranchId ? { column: 'branch_id', value: activeBranchId } : undefined, () => {
    fetchOrders();
  });

  const handleItemReady = async (orderId: string, itemId: string) => {
    try {
      await api('kitchen', 'update-item', {
        body: { order_item_id: itemId, status: 'ready' },
        branchId: activeBranchId!,
      });
      toast.success('Item marked ready');
      fetchOrders();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleBump = async (orderId: string) => {
    try {
      await api('kitchen', 'bump', {
        body: { order_id: orderId, station: station || 'kitchen' },
        branchId: activeBranchId!,
      });
      toast.success('Order bumped');
      fetchOrders();
    } catch (err: any) { toast.error(err.message); }
  };

  const now = Date.now();

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <ToggleButtonGroup
          value={station} exclusive
          onChange={(_, v) => v !== null && setStation(v)}
          size="small"
        >
          {STATIONS.map((s) => (
            <ToggleButton key={s.id} value={s.id}>{s.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {loading ? (
        <Typography color="text.secondary">Loading orders…</Typography>
      ) : orders.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No active orders for this station
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {orders.map((order) => {
            const elapsed = Math.floor((now - new Date(order.created_at).getTime()) / 60_000);
            return (
              <KDSOrderCard
                key={order.id}
                orderNumber={order.order_number}
                orderType={order.order_type}
                tableName={order.table_name}
                customerName={order.customer_name}
                items={order.items.map((i) => ({
                  id: i.id,
                  name: i.name,
                  quantity: i.quantity,
                  modifiers: i.modifiers,
                  notes: i.notes,
                  status: i.status,
                }))}
                createdAt={order.created_at}
                elapsedMinutes={elapsed}
                onItemReady={(itemId) => handleItemReady(order.id, itemId)}
                onBump={() => handleBump(order.id)}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}
