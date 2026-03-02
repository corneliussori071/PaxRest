import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Stack, Typography, Button, TextField, MenuItem,
  Divider, Alert, CircularProgress, Paper, IconButton,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PaymentIcon from '@mui/icons-material/Payment';
import CashIcon from '@mui/icons-material/AttachMoney';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PrintIcon from '@mui/icons-material/Print';
import { formatCurrency } from '@paxrest/shared-utils';
import { api } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash',            icon: <CashIcon /> },
  { value: 'mobile_money',  label: 'Mobile Money',    icon: <PhoneAndroidIcon /> },
  { value: 'card',          label: 'Card / POS',      icon: <CreditCardIcon /> },
  { value: 'bank_transfer', label: 'Bank Transfer',   icon: <AccountBalanceIcon /> },
];

export interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /** The order to pay. Needs: id, order_number, total_amount, customer_name, order_payments */
  order: any | null;
  currency?: string;
  effectiveBranchId: string;
  onPaid?: () => void;
}

export default function PaymentDialog({
  open,
  onClose,
  order,
  currency = 'USD',
  effectiveBranchId,
  onPaid,
}: PaymentDialogProps) {
  const { profile } = useAuth();

  const [method, setMethod] = useState<string>('cash');
  const [amountStr, setAmountStr] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [paidResult, setPaidResult] = useState<{
    orderId: string;
    orderNumber: string;
    method: string;
    amount: number;
    change: number;
    total: number;
  } | null>(null);

  const totalPaid =
    ((order?.order_payments ?? []) as any[]).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
  const orderTotal = Number(order?.total_amount ?? order?.total ?? 0);
  const remaining = Math.max(0, orderTotal - totalPaid);

  // Reset form when a new order is opened
  useEffect(() => {
    if (open && order) {
      setMethod('cash');
      setAmountStr(remaining > 0 ? remaining.toFixed(2) : '');
      setReference('');
      setPaidResult(null);
    }
  }, [open, order?.id]);

  const amountVal = parseFloat(amountStr) || 0;
  const change = method === 'cash' && amountVal > remaining ? amountVal - remaining : 0;
  const needsReference = method !== 'cash';

  const canSubmit =
    !submitting &&
    amountVal > 0 &&
    amountVal <= orderTotal * 1.5 && // sanity cap
    (!needsReference || reference.trim().length > 0);

  const handleSubmit = async () => {
    if (!order) return;
    setSubmitting(true);
    try {
      await api('orders', 'add-payment', {
        body: {
          order_id: order.id,
          payment_method: method,
          amount: amountVal,
          reference_number: reference.trim() || null,
          processed_by_name: profile?.name ?? 'Staff',
        },
        branchId: effectiveBranchId,
      });

      setPaidResult({
        orderId: order.id,
        orderNumber: order.order_number,
        method,
        amount: amountVal,
        change,
        total: orderTotal,
      });

      toast.success(`Payment of ${formatCurrency(amountVal, currency)} recorded for order #${order.order_number}`);
      onPaid?.();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to record payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setPaidResult(null);
    onClose();
  };

  const handlePrint = () => {
    if (!paidResult) return;
    const win = window.open('', '_blank', 'width=320,height=500');
    if (!win) return;
    const methodLabel = PAYMENT_METHODS.find((m) => m.value === paidResult.method)?.label ?? paidResult.method;
    win.document.write(`
      <html><head><title>Receipt</title>
      <style>body{font-family:monospace;padding:16px;font-size:13px}h2{text-align:center}hr{border:1px dashed #333}.row{display:flex;justify-content:space-between}</style>
      </head><body>
      <h2>Payment Receipt</h2>
      <hr/>
      <p class="row"><span>Order #</span><span>${paidResult.orderNumber}</span></p>
      <p class="row"><span>Customer</span><span>${order?.customer_name ?? '—'}</span></p>
      <p class="row"><span>Method</span><span>${methodLabel}</span></p>
      <p class="row"><span>Amount Paid</span><span>${formatCurrency(paidResult.amount, currency)}</span></p>
      <p class="row"><span>Order Total</span><span>${formatCurrency(paidResult.total, currency)}</span></p>
      ${paidResult.change > 0 ? `<p class="row"><b>Change</b><b>${formatCurrency(paidResult.change, currency)}</b></p>` : ''}
      <hr/>
      <p style="text-align:center">Thank you!</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  if (!order) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PaymentIcon color="primary" />
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>Record Payment</Typography>
            <Typography variant="caption" color="text.secondary">
              Order #{order.order_number}
              {order.customer_name ? ` · ${order.customer_name}` : ''}
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={handleClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {/* ── Success / receipt view ────────────────────────────────── */}
        {paidResult ? (
          <Stack spacing={2} alignItems="center" sx={{ py: 1 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: 'success.main' }} />
            <Typography variant="h6" fontWeight={700} color="success.main">Payment Recorded!</Typography>
            <Paper variant="outlined" sx={{ p: 2, width: '100%' }}>
              <Stack spacing={0.5}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Method</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {PAYMENT_METHODS.find((m) => m.value === paidResult.method)?.label ?? paidResult.method}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Amount Paid</Typography>
                  <Typography variant="body2" fontWeight={600}>{formatCurrency(paidResult.amount, currency)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Order Total</Typography>
                  <Typography variant="body2" fontWeight={600}>{formatCurrency(paidResult.total, currency)}</Typography>
                </Box>
                {paidResult.change > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                    <Typography variant="body1" fontWeight={700} color="warning.main">Change</Typography>
                    <Typography variant="body1" fontWeight={700} color="warning.main">
                      {formatCurrency(paidResult.change, currency)}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Stack>
        ) : (
          /* ── Payment entry form ────────────────────────────────────── */
          <Stack spacing={2.5}>
            {/* Summary */}
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">Order Total</Typography>
                <Typography variant="body2" fontWeight={600}>{formatCurrency(orderTotal, currency)}</Typography>
              </Box>
              {totalPaid > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">Already Paid</Typography>
                  <Typography variant="body2" fontWeight={600} color="success.main">−{formatCurrency(totalPaid, currency)}</Typography>
                </Box>
              )}
              <Divider sx={{ my: 0.75 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1" fontWeight={700}>Remaining</Typography>
                <Typography variant="body1" fontWeight={700} color={remaining > 0 ? 'error.main' : 'success.main'}>
                  {formatCurrency(remaining, currency)}
                </Typography>
              </Box>
            </Paper>

            {/* Payment method selector */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Payment Method
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={method}
                onChange={(_, val) => { if (val) setMethod(val); }}
                sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <ToggleButton
                    key={m.value}
                    value={m.value}
                    sx={{
                      flex: '1 1 calc(50% - 4px)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      py: 1,
                      '&.Mui-selected': { bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } },
                    }}
                  >
                    {m.icon}
                    <Typography variant="body2" fontWeight={600}>{m.label}</Typography>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            {/* Amount */}
            <TextField
              label="Amount Received"
              type="number"
              fullWidth
              size="small"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              slotProps={{
                htmlInput: { min: 0.01, step: '0.01' },
                input: { startAdornment: <Typography variant="body2" sx={{ mr: 0.5, color: 'text.secondary' }}>{currency}</Typography> },
              }}
            />

            {/* Cash change helper */}
            {method === 'cash' && change > 0 && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                <Typography variant="body2">
                  Change to return: <strong>{formatCurrency(change, currency)}</strong>
                </Typography>
              </Alert>
            )}

            {/* Reference number (non-cash) */}
            {needsReference && (
              <TextField
                label="Reference / Transaction Number *"
                fullWidth
                size="small"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={method === 'mobile_money' ? 'MoMo transaction ID' : method === 'card' ? 'POS terminal ref' : 'Reference'}
                required
              />
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        {paidResult ? (
          <>
            <Button startIcon={<PrintIcon />} onClick={handlePrint} variant="outlined">
              Print Receipt
            </Button>
            <Button variant="contained" onClick={handleClose}>Done</Button>
          </>
        ) : (
          <>
            <Button onClick={handleClose} disabled={submitting} color="inherit">Cancel</Button>
            <Button
              variant="contained"
              color="success"
              onClick={handleSubmit}
              disabled={!canSubmit}
              startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : <PaymentIcon />}
            >
              {submitting ? 'Processing...' : `Record Payment · ${amountVal > 0 ? formatCurrency(amountVal, currency) : '—'}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
