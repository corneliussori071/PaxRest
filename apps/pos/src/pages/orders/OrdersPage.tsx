import React, { useState } from 'react';
import {
  Box, Tabs, Tab, Typography, Alert,
} from '@mui/material';
import HotelIcon from '@mui/icons-material/Hotel';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import { useRealtime } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import BranchSelector from '@/components/BranchSelector';
import { OrderDetailDialog, OrdersGrid } from '@/components/OrderComponents';

export default function OrdersPage() {
  const { activeBranchId, company, activeBranch, isGlobalStaff } = useAuth();
  const { currencyCode: currency } = useCurrency();

  const [branchFilter, setBranchFilter] = useState<string | null>(
    isGlobalStaff ? null : activeBranchId,
  );
  const effectiveBranchId = isGlobalStaff ? (branchFilter ?? '__all__') : (activeBranchId ?? '');

  const [mainTab, setMainTab] = useState(0);
  const [internalSub, setInternalSub] = useState(0);

  const [detailOrder, setDetailOrder] = useState<any | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const doRefresh = () => setRefreshKey((k) => k + 1);

  useRealtime(
    'orders',
    activeBranchId ? { column: 'branch_id', value: activeBranchId } : undefined,
    doRefresh,
  );

  return (
    <Box>
      {isGlobalStaff && (
        <Box sx={{ mb: 2 }}>
          <BranchSelector showAll compact value={branchFilter} onChange={setBranchFilter} />
        </Box>
      )}

      <Tabs
        value={mainTab}
        onChange={(_, v) => setMainTab(v)}
        sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Tab label="Internal" />
        <Tab label="Online" />
      </Tabs>

      {mainTab === 0 && (
        <Box>
          <Tabs
            value={internalSub}
            onChange={(_, v) => setInternalSub(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ mb: 2 }}
            TabIndicatorProps={{ style: { background: '#635BFF', height: 2 } }}
          >
            <Tab label="Pending Payments" />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><RestaurantIcon sx={{ fontSize: 16 }} /> Meals</Box>} />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><HotelIcon sx={{ fontSize: 16 }} /> Rooms</Box>} />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><LocalBarIcon sx={{ fontSize: 16 }} /> Bar</Box>} />
          </Tabs>

          {internalSub === 0 && (
            <OrdersGrid
              key={`pending-pay-${refreshKey}`}
              defaultStatus="awaiting_payment"
              statusOptions={['awaiting_payment']}
              currency={currency}
              effectiveBranchId={effectiveBranchId}
              onViewDetail={setDetailOrder}
            />
          )}

          {internalSub === 1 && (
            <OrdersGrid
              key={`meals-${refreshKey}`}
              source="pos"
              statusOptions={['', 'pending', 'confirmed', 'preparing', 'ready', 'awaiting_payment', 'completed', 'cancelled']}
              currency={currency}
              effectiveBranchId={effectiveBranchId}
              onViewDetail={setDetailOrder}
            />
          )}

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
              />
            </Box>
          )}

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
              />
            </Box>
          )}
        </Box>
      )}

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
          />
        </Box>
      )}

      <OrderDetailDialog
        order={detailOrder}
        currency={currency}
        effectiveBranchId={effectiveBranchId}
        onClose={() => setDetailOrder(null)}
        onStatusChange={doRefresh}
      />
    </Box>
  );
}
