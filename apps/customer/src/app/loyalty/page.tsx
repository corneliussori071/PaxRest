'use client';
import React, { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack, Grid,
  Button, Skeleton, Chip, Divider, LinearProgress,
  Table, TableHead, TableRow, TableCell, TableBody,
  TextField, InputAdornment,
} from '@mui/material';
import LoyaltyIcon from '@mui/icons-material/Loyalty';
import StarIcon from '@mui/icons-material/Star';
import SearchIcon from '@mui/icons-material/Search';
import { publicApi } from '@/lib/supabase';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';

interface LoyaltyInfo {
  customer: {
    id: string;
    name: string;
    phone: string;
    loyalty_points: number;
    total_spent: number;
    total_orders: number;
    tier: string;
  } | null;
  program: {
    points_per_currency: number;
    redemption_value: number;
    min_redeem_points: number;
  } | null;
  transactions: { id: string; type: string; points: number; description: string; created_at: string }[];
}

export default function LoyaltyPage() {
  const [phone, setPhone] = useState('');
  const [info, setInfo] = useState<LoyaltyInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleLookup = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      // Look up customer by phone, then fetch loyalty info
      const custRes = await publicApi<{ data: any[] }>(`/loyalty/customers?search=${encodeURIComponent(phone)}`);
      const customer = custRes.data?.data?.[0] ?? null;
      if (!customer) {
        setInfo({ customer: null, program: null, transactions: [] });
        return;
      }

      const [progRes, txRes] = await Promise.all([
        publicApi<any>('/loyalty/program'),
        publicApi<{ data: any[] }>(`/loyalty/transactions?customer_id=${customer.id}`),
      ]);

      setInfo({
        customer,
        program: progRes.data ?? null,
        transactions: txRes.data?.data ?? [],
      });
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const tierColor = (tier: string) => {
    switch (tier) {
      case 'gold': return '#FFD700';
      case 'silver': return '#C0C0C0';
      case 'platinum': return '#E5E4E2';
      default: return '#CD7F32';
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>Loyalty Rewards</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Earn points with every order and redeem them for discounts!
      </Typography>

      {/* Lookup */}
      <Stack direction="row" spacing={1} sx={{ mb: 4 }}>
        <TextField
          fullWidth size="small" placeholder="Enter your phone number"
          value={phone} onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> },
          }}
        />
        <Button variant="contained" onClick={handleLookup} disabled={loading}>Lookup</Button>
      </Stack>

      {loading && (
        <>
          <Skeleton variant="rounded" height={160} sx={{ mb: 2 }} />
          <Skeleton variant="rounded" height={200} />
        </>
      )}

      {!loading && searched && !info?.customer && (
        <Box textAlign="center" py={6}>
          <LoyaltyIcon sx={{ fontSize: 60, color: 'grey.400', mb: 1 }} />
          <Typography color="text.secondary">
            No loyalty account found for this phone number.<br />
            Create an account by placing your first order!
          </Typography>
        </Box>
      )}

      {info?.customer && (
        <>
          {/* Points card */}
          <Card sx={{ mb: 3, bgcolor: 'primary.main', color: '#fff' }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="h6">{info.customer.name}</Typography>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                    <Chip
                      label={info.customer.tier.toUpperCase()}
                      size="small"
                      sx={{ bgcolor: tierColor(info.customer.tier), color: '#000', fontWeight: 700 }}
                      icon={<StarIcon sx={{ color: '#000 !important' }} />}
                    />
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }} sx={{ textAlign: { sm: 'right' } }}>
                  <Typography variant="h3" fontWeight={700}>{info.customer.loyalty_points}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Available Points</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Stats */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 4 }}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={700}>{info.customer.total_orders}</Typography>
                  <Typography variant="caption" color="text.secondary">Total Orders</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={700}>{formatCurrency(info.customer.total_spent)}</Typography>
                  <Typography variant="caption" color="text.secondary">Total Spent</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={700}>
                    {info.program ? formatCurrency(info.customer.loyalty_points * info.program.redemption_value) : '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Points Value</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* How it works */}
          {info.program && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>How It Works</Typography>
                <Stack spacing={0.5}>
                  <Typography variant="body2">
                    • Earn <strong>{info.program.points_per_currency} point(s)</strong> for every $1 spent
                  </Typography>
                  <Typography variant="body2">
                    • Each point is worth <strong>{formatCurrency(info.program.redemption_value)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    • Minimum <strong>{info.program.min_redeem_points} points</strong> to redeem
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Transaction history */}
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>Points History</Typography>
              {info.transactions.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No transactions yet.</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Points</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {info.transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{formatDateTime(tx.created_at)}</TableCell>
                        <TableCell>
                          <Chip label={tx.type} size="small" color={tx.type === 'earn' ? 'success' : 'warning'} />
                        </TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: tx.points >= 0 ? 'success.main' : 'error.main' }}>
                          {tx.points >= 0 ? '+' : ''}{tx.points}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Container>
  );
}
