'use client';
import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Card, CardContent, Stack, Button,
  TextField, Divider, Alert, CircularProgress, Chip, Tab, Tabs,
  Avatar, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Pagination,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LogoutIcon from '@mui/icons-material/Logout';
import EditIcon from '@mui/icons-material/Edit';
import StarIcon from '@mui/icons-material/Star';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useCustomerAuth } from '@/stores/customerAuth';
import { useCartStore } from '@/stores/cart';
import { publicApi } from '@/lib/supabase';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';
import toast from 'react-hot-toast';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface OrderSummary {
  id: string;
  order_number: number;
  status: string;
  total: number;
  created_at: string;
  item_count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Account Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const { profile } = useCustomerAuth();
  const [tab, setTab] = useState(profile ? 2 : 0); // 0=SignIn, 1=SignUp, 2=Profile

  // If profile is loaded after mount, switch to profile tab
  useEffect(() => {
    if (profile) setTab(2);
  }, [profile]);

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>Account</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Sign In" value={0} disabled={Boolean(profile)} />
        <Tab label="Create Account" value={1} disabled={Boolean(profile)} />
        <Tab label="My Profile" value={2} disabled={!profile} />
      </Tabs>

      {tab === 0 && !profile && <SignInPanel onSuccess={() => setTab(2)} />}
      {tab === 1 && !profile && <SignUpPanel onSuccess={() => setTab(2)} />}
      {tab === 2 && profile && <ProfilePanel />}
    </Container>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign In
// ─────────────────────────────────────────────────────────────────────────────
function SignInPanel({ onSuccess }: { onSuccess: () => void }) {
  const { signIn } = useCustomerAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true); setError('');
    try {
      await signIn(email, password);
      toast.success('Welcome back!');
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={600}>Sign In to Your Account</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Email" type="email" fullWidth size="small" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField
            label="Password" type="password" fullWidth size="small"
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
          />
          <Button
            variant="contained" fullWidth size="large" onClick={handleSignIn}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <LockOpenIcon />}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign Up
// ─────────────────────────────────────────────────────────────────────────────
function SignUpPanel({ onSuccess }: { onSuccess: () => void }) {
  const { signUp } = useCustomerAuth();
  const branchId = useCartStore((s) => s.branchId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignUp = async () => {
    if (!name || !phone || !email || !password) { setError('Please fill in all fields.'); return; }
    if (!branchId) { setError('Please select a branch first.'); return; }
    setLoading(true); setError('');
    try {
      await signUp({ email, password, name, phone, branchId });
      toast.success('Account created! Welcome 🎉');
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={600}>Create an Account</Typography>
          <Typography variant="body2" color="text.secondary">
            Earn loyalty points, track orders, and get exclusive offers.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField label="Full Name" fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Phone" fullWidth size="small" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Stack>
          <TextField label="Email" type="email" fullWidth size="small" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Password" type="password" fullWidth size="small" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button
            variant="contained" fullWidth size="large" onClick={handleSignUp}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <PersonIcon />}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile Panel (logged-in view)
// ─────────────────────────────────────────────────────────────────────────────
function ProfilePanel() {
  const { profile, signOut, refreshProfile } = useCustomerAuth();
  const branchId = useCartStore((s) => s.branchId);
  const [editOpen, setEditOpen] = useState(false);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 5;

  useEffect(() => {
    if (!profile) return;
    setOrdersLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (branchId) params.set('branch_id', branchId);
    publicApi<{ orders: OrderSummary[]; total: number }>(`/customer/my-orders?${params}`)
      .then((res) => {
        setOrders(res.data?.orders ?? []);
        setTotalPages(Math.max(1, Math.ceil((res.data?.total ?? 0) / PAGE_SIZE)));
      })
      .catch(() => {})
      .finally(() => setOrdersLoading(false));
  }, [profile, page, branchId]);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
  };

  if (!profile) return null;

  return (
    <Stack spacing={3}>
      {/* Profile summary card */}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontSize: '1.5rem' }}>
              {profile.name?.[0]?.toUpperCase() ?? 'U'}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" fontWeight={700}>{profile.name}</Typography>
              <Typography variant="body2" color="text.secondary">{profile.email}</Typography>
              <Typography variant="body2" color="text.secondary">{profile.phone}</Typography>
            </Box>
            <IconButton onClick={() => setEditOpen(true)} size="small" color="primary">
              <EditIcon />
            </IconButton>
          </Stack>

          <Divider sx={{ my: 2 }} />

          {/* Loyalty & stats */}
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Chip
              icon={<StarIcon />}
              label={`${profile.loyalty_points_balance ?? 0} pts`}
              color="warning"
              variant="filled"
            />
            <Chip label={`${profile.total_orders ?? 0} orders`} variant="outlined" />
            {profile.total_spent != null && (
              <Chip label={`${formatCurrency(profile.total_spent)} spent`} variant="outlined" />
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReceiptLongIcon fontSize="small" /> My Orders
            </Typography>
          </Stack>

          {ordersLoading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={28} />
            </Stack>
          ) : orders.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No orders yet. <Link href="/menu" style={{ color: 'inherit', fontWeight: 600 }}>Browse the menu</Link>!
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {orders.map((o) => (
                <Box
                  key={o.id}
                  component={Link}
                  href={`/track/${o.id}`}
                  sx={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                >
                  <Card variant="outlined" sx={{ '&:hover': { bgcolor: 'action.hover' }, transition: 'background 0.15s' }}>
                    <CardContent sx={{ py: '12px !important' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="subtitle2" fontWeight={600}>
                            Order #{o.order_number}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(o.created_at)} · {o.item_count} item{o.item_count !== 1 ? 's' : ''}
                          </Typography>
                        </Box>
                        <Stack alignItems="flex-end" spacing={0.5}>
                          <Typography variant="subtitle2" fontWeight={700} color="primary">
                            {formatCurrency(o.total)}
                          </Typography>
                          <Chip
                            label={o.status.replace(/_/g, ' ')}
                            size="small"
                            color={
                              o.status === 'delivered' || o.status === 'completed' ? 'success' :
                              o.status === 'cancelled' ? 'error' :
                              o.status === 'awaiting_approval' ? 'warning' : 'default'
                            }
                          />
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Box>
              ))}

              {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
                  <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} size="small" />
                </Box>
              )}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Button
        variant="outlined" color="error" startIcon={<LogoutIcon />}
        onClick={handleSignOut} fullWidth
      >
        Sign Out
      </Button>

      {/* Edit Profile Dialog */}
      <EditProfileDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={refreshProfile}
      />
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Profile Dialog
// ─────────────────────────────────────────────────────────────────────────────
function EditProfileDialog({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { profile } = useCustomerAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && profile) { setName(profile.name ?? ''); setPhone(profile.phone ?? ''); }
  }, [open, profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await publicApi('/customer/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, phone }),
      });
      if (error) throw new Error(typeof error === 'string' ? error : (error as { message: string }).message);
      await onSaved();
      toast.success('Profile updated!');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit Profile</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Full Name" fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Phone" fullWidth size="small" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
