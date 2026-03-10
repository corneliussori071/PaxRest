import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Stack, Typography, Button, TextField, MenuItem,
  Divider, Alert, CircularProgress, Paper, IconButton,
  Select, FormControl, InputLabel, ListItemIcon, ListItemText,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PaymentIcon from '@mui/icons-material/Payment';
import CashIcon from '@mui/icons-material/AttachMoney';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PrintIcon from '@mui/icons-material/Print';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { formatCurrency } from '@paxrest/shared-utils';
import { api } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import toast from 'react-hot-toast';

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash',            icon: <CashIcon /> },
  { value: 'mobile_money',  label: 'Mobile Money',    icon: <PhoneAndroidIcon /> },
  { value: 'card',          label: 'Card / POS',      icon: <CreditCardIcon /> },
  { value: 'bank_transfer', label: 'Bank Transfer',   icon: <AccountBalanceIcon /> },
];

/** Generate a human-readable transaction ID from a UUID */
function generateTxnId(paymentId: string, orderNumber: string | number): string {
  const short = paymentId.replace(/-/g, '').substring(0, 8).toUpperCase();
  return `TXN-${orderNumber}-${short}`;
}

export interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  order: any | null;
  currency?: string;
  effectiveBranchId: string;
  onPaid?: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Receipt HTML builder — generates a professional thermal / A4 receipt
   ═══════════════════════════════════════════════════════════════════════════ */
function buildReceiptHtml(opts: {
  companyName: string;
  branchName: string;
  branchAddress?: string;
  branchPhone?: string;
  orderNumber: string | number;
  orderType: string;
  customerName?: string;
  cashierName: string;
  processedByName: string;
  transactionId: string;
  paymentMethod: string;
  reference?: string;
  items: { name: string; variant?: string; qty: number; unitPrice: number; total: number }[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  deliveryFee: number;
  tipAmount: number;
  orderTotal: number;
  amountPaid: number;
  change: number;
  currency: string;
  dateTime: string;
}) {
  const fmt = (n: number) => formatCurrency(n, opts.currency);

  const itemRows = opts.items.map((it) => `
    <tr>
      <td style="padding:4px 0;border-bottom:1px dotted #ddd">
        ${it.name}${it.variant ? `<br><span style="color:#888;font-size:11px">${it.variant}</span>` : ''}
      </td>
      <td style="text-align:center;padding:4px 6px;border-bottom:1px dotted #ddd">${it.qty}</td>
      <td style="text-align:right;padding:4px 0;border-bottom:1px dotted #ddd">${fmt(it.unitPrice)}</td>
      <td style="text-align:right;padding:4px 0;border-bottom:1px dotted #ddd">${fmt(it.total)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt #${opts.orderNumber}</title>
<style>
  @media print { @page { margin: 8mm; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 13px; color: #222; max-width: 380px; margin: 0 auto; padding: 16px; }
  .header { text-align: center; margin-bottom: 12px; }
  .header h1 { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 2px; }
  .header .branch { font-size: 14px; color: #555; font-weight: 600; }
  .header .info { font-size: 11px; color: #888; }
  .divider { border: none; border-top: 2px solid #222; margin: 10px 0; }
  .divider-dash { border: none; border-top: 1px dashed #aaa; margin: 8px 0; }
  .meta { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .meta .label { color: #666; }
  .meta .value { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; border-bottom: 1px solid #333; padding: 4px 0; text-align: left; }
  th:nth-child(2) { text-align: center; }
  th:nth-child(3), th:nth-child(4) { text-align: right; }
  .totals .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
  .totals .grand { font-size: 16px; font-weight: 800; border-top: 2px solid #222; padding-top: 6px; margin-top: 4px; }
  .payment-box { background: #f5f5f5; border-radius: 6px; padding: 10px 12px; margin: 10px 0; }
  .payment-box .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 13px; }
  .payment-box .highlight { font-size: 15px; font-weight: 700; color: #1a7f37; }
  .change-box { background: #fff3cd; border-radius: 6px; padding: 8px 12px; margin: 6px 0; }
  .change-box .row { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; color: #856404; }
  .txn-id { text-align: center; font-family: 'Courier New', monospace; font-size: 13px; font-weight: 700; letter-spacing: 1px; background: #f0f0f0; padding: 6px; border-radius: 4px; margin: 10px 0; }
  .footer { text-align: center; margin-top: 14px; font-size: 11px; color: #888; }
  .footer .thanks { font-size: 14px; font-weight: 700; color: #333; margin-bottom: 4px; }
  .no-print { margin-top: 16px; text-align: center; }
  @media print { .no-print { display: none !important; } }
</style></head><body>

<div class="header">
  <h1>${opts.companyName}</h1>
  <div class="branch">${opts.branchName}</div>
  ${opts.branchAddress ? `<div class="info">${opts.branchAddress}</div>` : ''}
  ${opts.branchPhone ? `<div class="info">Tel: ${opts.branchPhone}</div>` : ''}
</div>

<hr class="divider"/>

<div class="meta"><span class="label">Order #</span><span class="value">${opts.orderNumber}</span></div>
<div class="meta"><span class="label">Type</span><span class="value">${opts.orderType}</span></div>
${opts.customerName ? `<div class="meta"><span class="label">Customer</span><span class="value">${opts.customerName}</span></div>` : ''}
<div class="meta"><span class="label">Date &amp; Time</span><span class="value">${opts.dateTime}</span></div>
<div class="meta"><span class="label">Cashier</span><span class="value">${opts.cashierName}</span></div>
${opts.processedByName !== opts.cashierName ? `<div class="meta"><span class="label">Staff</span><span class="value">${opts.processedByName}</span></div>` : ''}

<hr class="divider-dash"/>

<table>
  <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>

<hr class="divider-dash"/>

<div class="totals">
  <div class="row"><span>Subtotal</span><span>${fmt(opts.subtotal)}</span></div>
  ${opts.taxAmount > 0 ? `<div class="row"><span>Tax</span><span>${fmt(opts.taxAmount)}</span></div>` : ''}
  ${opts.discountAmount > 0 ? `<div class="row"><span>Discount</span><span style="color:#d32f2f">-${fmt(opts.discountAmount)}</span></div>` : ''}
  ${opts.deliveryFee > 0 ? `<div class="row"><span>Delivery Fee</span><span>${fmt(opts.deliveryFee)}</span></div>` : ''}
  ${opts.tipAmount > 0 ? `<div class="row"><span>Tip</span><span>${fmt(opts.tipAmount)}</span></div>` : ''}
  <div class="row grand"><span>TOTAL</span><span>${fmt(opts.orderTotal)}</span></div>
</div>

<div class="payment-box">
  <div class="row"><span>Payment Method</span><span style="font-weight:600">${opts.paymentMethod}</span></div>
  ${opts.reference ? `<div class="row"><span>Reference</span><span>${opts.reference}</span></div>` : ''}
  <div class="row highlight"><span>Amount Paid</span><span>${fmt(opts.amountPaid)}</span></div>
</div>

${opts.change > 0 ? `<div class="change-box"><div class="row"><span>Change Due</span><span>${fmt(opts.change)}</span></div></div>` : ''}

<div class="txn-id">${opts.transactionId}</div>

<hr class="divider"/>

<div class="footer">
  <div class="thanks">Thank you for your patronage!</div>
  <div>Powered by PaxRest</div>
</div>

<div class="no-print">
  <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;margin-right:8px;border:1px solid #333;border-radius:4px;background:#fff">🖨️ Print</button>
  <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;border:1px solid #1976d2;border-radius:4px;background:#1976d2;color:#fff">📄 Save as PDF</button>
</div>

</body></html>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PaymentDialog component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function PaymentDialog({
  open,
  onClose,
  order,
  currency = 'USD',
  effectiveBranchId,
  onPaid,
}: PaymentDialogProps) {
  const { profile, company, activeBranch } = useAuth();
  const { fmt } = useCurrency();

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
    transactionId: string;
    paymentId: string;
    orderDetail: any;
  } | null>(null);

  const totalPaid =
    ((order?.order_payments ?? []) as any[]).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
  const orderTotal = Number(order?.total_amount ?? order?.total ?? 0);
  const remaining = Math.max(0, orderTotal - totalPaid);

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
    amountVal <= orderTotal * 1.5;

  const handleSubmit = async () => {
    if (!order) return;
    setSubmitting(true);
    try {
      // Record payment — returns the payment record with id
      const res = await api<{ payment: any }>('orders', 'add-payment', {
        body: {
          order_id: order.id,
          payment_method: method,
          amount: amountVal,
          reference_number: reference.trim() || null,
          processed_by_name: profile?.name ?? 'Staff',
        },
        branchId: effectiveBranchId,
      });

      const paymentId = res.payment?.id ?? crypto.randomUUID();
      const txnId = generateTxnId(paymentId, order.order_number);

      // Fetch full order details for receipt (items, etc.)
      let orderDetail: any = null;
      try {
        const detail = await api<{ order: any }>('orders', 'get', {
          params: { id: order.id },
          branchId: effectiveBranchId,
        });
        orderDetail = detail.order;
      } catch { /* fallback to existing order data */ }

      setPaidResult({
        orderId: order.id,
        orderNumber: order.order_number,
        method,
        amount: amountVal,
        change,
        total: orderTotal,
        transactionId: txnId,
        paymentId,
        orderDetail: orderDetail ?? order,
      });

      toast.success(`Payment of ${fmt(amountVal)} recorded for order #${order.order_number}`);
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

  /** Build receipt data and open in new window for print / PDF save */
  const openReceipt = () => {
    if (!paidResult) return;
    const od = paidResult.orderDetail;
    const items: any[] = od?.order_items ?? od?.items ?? order?.order_items ?? [];
    const methodLabel = PAYMENT_METHODS.find((m) => m.value === paidResult.method)?.label ?? paidResult.method;
    const orderTypeLbl: Record<string, string> = {
      dine_in: 'Dine-In', takeaway: 'Takeaway', delivery: 'Delivery',
      room_service: 'Room Service', bar: 'Bar', accommodation: 'Accommodation',
    };

    const html = buildReceiptHtml({
      companyName: company?.name ?? 'PaxRest',
      branchName: activeBranch?.name ?? 'Branch',
      branchAddress: activeBranch?.address ?? undefined,
      branchPhone: (activeBranch as any)?.phone ?? undefined,
      orderNumber: paidResult.orderNumber,
      orderType: orderTypeLbl[od?.order_type] ?? od?.order_type ?? '—',
      customerName: od?.customer_name ?? order?.customer_name ?? undefined,
      cashierName: od?.created_by_name ?? order?.created_by_name ?? '—',
      processedByName: profile?.name ?? 'Staff',
      transactionId: paidResult.transactionId,
      paymentMethod: methodLabel,
      reference: reference.trim() || undefined,
      items: items.map((it: any) => ({
        name: it.menu_item_name ?? it.item_name ?? it.name ?? 'Item',
        variant: it.variant_name ?? undefined,
        qty: it.quantity ?? 1,
        unitPrice: Number(it.unit_price ?? it.price ?? 0),
        total: Number(it.item_total ?? it.line_total ?? ((it.quantity ?? 1) * (it.unit_price ?? it.price ?? 0))),
      })),
      subtotal: Number(od?.subtotal ?? orderTotal),
      taxAmount: Number(od?.tax_amount ?? 0),
      discountAmount: Number(od?.discount_amount ?? 0),
      deliveryFee: Number(od?.delivery_fee ?? 0),
      tipAmount: Number(od?.tip_amount ?? 0),
      orderTotal: Number(od?.total ?? paidResult.total),
      amountPaid: paidResult.amount,
      change: paidResult.change,
      currency,
      dateTime: new Date().toLocaleString(),
    });

    return html;
  };

  const handlePrint = () => {
    const html = openReceipt();
    if (!html) return;
    const win = window.open('', '_blank', 'width=420,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const handleDownloadPdf = () => {
    const html = openReceipt();
    if (!html) return;
    const win = window.open('', '_blank', 'width=420,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    // Use browser print-to-PDF (user selects "Save as PDF" destination)
    setTimeout(() => win.print(), 400);
  };

  if (!order) return null;

  const methodLabel = PAYMENT_METHODS.find((m) => m.value === (paidResult?.method ?? method))?.label ?? method;

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
                  <Typography variant="body2" color="text.secondary">Transaction ID</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace', letterSpacing: 0.5 }}>
                    {paidResult.transactionId}
                  </Typography>
                </Box>
                <Divider sx={{ my: 0.5 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Method</Typography>
                  <Typography variant="body2" fontWeight={600}>{methodLabel}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Amount Paid</Typography>
                  <Typography variant="body2" fontWeight={600}>{fmt(paidResult.amount)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Order Total</Typography>
                  <Typography variant="body2" fontWeight={600}>{fmt(paidResult.total)}</Typography>
                </Box>
                {paidResult.change > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                    <Typography variant="body1" fontWeight={700} color="warning.main">Change</Typography>
                    <Typography variant="body1" fontWeight={700} color="warning.main">
                      {fmt(paidResult.change)}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Paper>

            {/* Order items summary */}
            {(() => {
              const od = paidResult.orderDetail;
              const items: any[] = od?.order_items ?? od?.items ?? [];
              if (items.length === 0) return null;
              return (
                <Paper variant="outlined" sx={{ p: 1.5, width: '100%' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 0.5, display: 'block' }}>
                    ORDER ITEMS
                  </Typography>
                  {items.map((it: any, i: number) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                      <Typography variant="body2" sx={{ fontSize: 12 }}>
                        {it.quantity ?? 1}× {it.menu_item_name ?? it.item_name ?? it.name ?? 'Item'}
                        {it.variant_name ? ` (${it.variant_name})` : ''}
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600 }}>
                        {formatCurrency(it.item_total ?? it.line_total ?? ((it.quantity ?? 1) * (it.unit_price ?? 0)), currency)}
                      </Typography>
                    </Box>
                  ))}
                </Paper>
              );
            })()}
          </Stack>
        ) : (
          /* ── Payment entry form ────────────────────────────────────── */
          <Stack spacing={2.5}>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">Order Total</Typography>
                <Typography variant="body2" fontWeight={600}>{fmt(orderTotal)}</Typography>
              </Box>
              {totalPaid > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">Already Paid</Typography>
                  <Typography variant="body2" fontWeight={600} color="success.main">−{fmt(totalPaid)}</Typography>
                </Box>
              )}
              <Divider sx={{ my: 0.75 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1" fontWeight={700}>Remaining</Typography>
                <Typography variant="body1" fontWeight={700} color={remaining > 0 ? 'error.main' : 'success.main'}>
                  {fmt(remaining)}
                </Typography>
              </Box>
            </Paper>

            <FormControl fullWidth size="small">
              <InputLabel>Payment Method</InputLabel>
              <Select
                value={method}
                label="Payment Method"
                onChange={(e) => setMethod(e.target.value)}
                renderValue={(val) => {
                  const m = PAYMENT_METHODS.find((pm) => pm.value === val);
                  return m ? m.label : val;
                }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <MenuItem key={m.value} value={m.value}>
                    <ListItemIcon sx={{ minWidth: 32 }}>{m.icon}</ListItemIcon>
                    <ListItemText primary={m.label} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

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

            {method === 'cash' && change > 0 && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                <Typography variant="body2">
                  Change to return: <strong>{fmt(change)}</strong>
                </Typography>
              </Alert>
            )}

            {needsReference && (
              <TextField
                label="Reference / Transaction Number"
                fullWidth
                size="small"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={method === 'mobile_money' ? 'MoMo transaction ID' : method === 'card' ? 'POS terminal ref' : 'Reference'}
                helperText="Optional — enter if available"
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
            <Button startIcon={<PictureAsPdfIcon />} onClick={handleDownloadPdf} variant="outlined" color="secondary">
              Download PDF
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
              {submitting ? 'Processing...' : `Record Payment · ${amountVal > 0 ? fmt(amountVal) : '—'}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
