'use client';
import React, { useState } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack,
  Button, Divider, CircularProgress, Alert,
} from '@mui/material';
import PaymentIcon from '@mui/icons-material/Payment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useCartStore } from '@/stores/cart';
import { publicApi } from '@/lib/supabase';
import { formatCurrency } from '@paxrest/shared-utils';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function CheckoutPage() {
  const router = useRouter();
  const {
    items, orderType, deliveryAddress, deliveryFee, deliveryZoneId,
    customerName, customerPhone, notes, subtotal, total, itemCount,
    branchId, clearCart,
  } = useCartStore();
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const handlePlaceOrder = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const orderItems = items.map((item) => {
        const extrasTotal = item.selectedExtras?.reduce((s, e) => s + e.price, 0) ?? 0;
        const ingredientsDiscount = item.removedIngredients?.reduce((s, r) => s + r.cost_contribution, 0) ?? 0;
        return {
          menu_item_id: item.menuItemId,
          variant_id: item.variantId ?? null,
          quantity: item.quantity,
          unit_price: item.basePrice + (item.variantPriceAdjustment ?? 0),
          modifiers: item.modifiers.map((m) => ({ modifier_id: m.id, name: m.name, price: m.price })),
          removed_ingredients: item.removedIngredients?.map((r) => ({ ingredient_id: r.ingredient_id, name: r.name, cost_contribution: r.cost_contribution })) ?? [],
          selected_extras: item.selectedExtras?.map((e) => ({ extra_id: e.id, name: e.name, price: e.price })) ?? [],
          extras_total: extrasTotal,
          ingredients_discount: ingredientsDiscount,
          notes: item.notes || null,
        };
      });

      const res = await publicApi<{ order_id: string; order_number: number }>('/customer/order', {
        method: 'POST',
        body: JSON.stringify({
          branch_id: branchId,
          order_type: orderType,
          items: orderItems,
          customer_name: customerName,
          customer_phone: customerPhone,
          notes,
          delivery_fee: orderType === 'delivery' ? deliveryFee : 0,
          delivery_zone_id: orderType === 'delivery' ? deliveryZoneId : undefined,
          delivery_address: orderType === 'delivery' ? deliveryAddress : undefined,
        }),
      });

      if (res.error) throw new Error(typeof res.error === 'string' ? res.error : (res.error as { message: string }).message);

      setOrderId(res.data!.order_id);
      clearCart();
      toast.success('Order placed successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  // Success screen
  if (orderId) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
        <Typography variant="h4" fontWeight={700} gutterBottom>Order Placed!</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Your order has been received and is being prepared.
        </Typography>
        <Stack spacing={2}>
      <Button variant="contained" size="large" onClick={() => router.push(`/track/${orderId}`)}>
            Track Your Order
          </Button>
          <Button variant="outlined" onClick={() => router.push('/menu')}>
            Order More
          </Button>
        </Stack>
      </Container>
    );
  }

  if (items.length === 0) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={600}>Nothing to checkout</Typography>
        <Button variant="contained" sx={{ mt: 2 }} onClick={() => router.push('/menu')}>Browse Menu</Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>Checkout</Typography>

      {/* Order review */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Order Review</Typography>
          {items.map((item, idx) => {
            const extrasTotal = item.selectedExtras?.reduce((s, e) => s + e.price, 0) ?? 0;
            const ingredientsDiscount = item.removedIngredients?.reduce((s, r) => s + r.cost_contribution, 0) ?? 0;
            const lineTotal = (item.basePrice + (item.variantPriceAdjustment ?? 0) + item.modifiers.reduce((s, m) => s + m.price, 0) + extrasTotal - ingredientsDiscount) * item.quantity;
            return (
              <Box key={idx} sx={{ py: 0.5 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">
                    {item.quantity}× {item.name}
                    {item.variantLabel ? ` (${item.variantLabel})` : ''}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>{formatCurrency(lineTotal)}</Typography>
                </Stack>
                {item.removedIngredients && item.removedIngredients.length > 0 && (
                  <Typography variant="caption" color="error.main" sx={{ pl: 2 }}>
                    Remove: {item.removedIngredients.map((r) => r.name).join(', ')}
                    {ingredientsDiscount > 0 && ` (-${formatCurrency(ingredientsDiscount)})`}
                  </Typography>
                )}
                {item.selectedExtras && item.selectedExtras.length > 0 && (
                  <Typography variant="caption" color="success.main" sx={{ pl: 2 }}>
                    Extras: {item.selectedExtras.map((e) => `${e.name} +${formatCurrency(e.price)}`).join(', ')}
                  </Typography>
                )}
              </Box>
            );
          })}
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" justifyContent="space-between">
            <Typography>Subtotal</Typography>
            <Typography fontWeight={600}>{formatCurrency(subtotal)}</Typography>
          </Stack>
          {orderType === 'delivery' && (
            <Stack direction="row" justifyContent="space-between">
              <Typography>Delivery Fee</Typography>
              <Typography fontWeight={600}>{formatCurrency(deliveryFee)}</Typography>
            </Stack>
          )}
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="h6" fontWeight={700}>Total</Typography>
            <Typography variant="h6" fontWeight={700} color="primary">{formatCurrency(total)}</Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Customer & Delivery info */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Delivery Info</Typography>
          <Stack spacing={0.5}>
            <Typography variant="body2"><strong>Name:</strong> {customerName}</Typography>
            <Typography variant="body2"><strong>Phone:</strong> {customerPhone}</Typography>
            <Typography variant="body2"><strong>Order Type:</strong> {orderType.replace('_', ' ').toUpperCase()}</Typography>
            {orderType === 'delivery' && deliveryAddress && (
              <Typography variant="body2"><strong>Address:</strong> {deliveryAddress.line1}</Typography>
            )}
            {notes && <Typography variant="body2"><strong>Notes:</strong> {notes}</Typography>}
          </Stack>
        </CardContent>
      </Card>

      <Button
        variant="contained" fullWidth size="large"
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <PaymentIcon />}
        onClick={handlePlaceOrder}
        disabled={loading}
      >
        {loading ? 'Placing Order…' : `Place Order — ${formatCurrency(total)}`}
      </Button>
    </Container>
  );
}
