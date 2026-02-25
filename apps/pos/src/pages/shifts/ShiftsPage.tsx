import React, { useState, useEffect } from 'react';
import {
  Box, Button, Card, CardContent, Typography, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Divider, Chip,
} from '@mui/material';
import { DataTable, StatCard, type Column } from '@paxrest/ui';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import { usePaginated } from '@/hooks';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

export default function ShiftsPage() {
  return <BranchGuard><ShiftsContent /></BranchGuard>;
}

function ShiftsContent() {
  const { activeBranchId, company, activeBranch, profile } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [cashDialog, setCashDialog] = useState<'in' | 'out' | null>(null);
  const [cashAmount, setCashAmount] = useState(0);
  const [cashReason, setCashReason] = useState('');
  const [openingAmount, setOpeningAmount] = useState(0);
  const [closingNotes, setClosingNotes] = useState('');
  const [closeDialog, setCloseDialog] = useState(false);
  const [countedCash, setCountedCash] = useState(0);

  const fetchCurrentShift = async () => {
    try {
      const data = await api<{ shift: any }>('shifts', 'current', { branchId: activeBranchId! });
      setCurrentShift(data.shift);
    } catch { setCurrentShift(null); }
    finally { setLoadingCurrent(false); }
  };

  useEffect(() => { if (activeBranchId) fetchCurrentShift(); }, [activeBranchId]);

  const handleOpenShift = async () => {
    try {
      await api('shifts', 'open', { body: { opening_amount: openingAmount }, branchId: activeBranchId! });
      toast.success('Shift opened');
      fetchCurrentShift();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleCloseShift = async () => {
    try {
      await api('shifts', 'close', { body: { counted_cash: countedCash, notes: closingNotes }, branchId: activeBranchId! });
      toast.success('Shift closed');
      setCloseDialog(false);
      fetchCurrentShift();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleCashAction = async () => {
    if (!cashDialog) return;
    try {
      await api('shifts', cashDialog === 'in' ? 'cash-in' : 'cash-out', {
        body: { amount: cashAmount, reason: cashReason },
        branchId: activeBranchId!,
      });
      toast.success(`Cash ${cashDialog} recorded`);
      setCashDialog(null);
      fetchCurrentShift();
    } catch (err: any) { toast.error(err.message); }
  };

  // Past shifts
  const { items: pastShifts, total, loading, page, pageSize, setPage, setPageSize } = usePaginated<any>('shifts', 'list');

  const pastColumns: Column[] = [
    { id: 'opened_at', label: 'Opened', render: (r) => formatDateTime(r.opened_at) },
    { id: 'closed_at', label: 'Closed', render: (r) => r.closed_at ? formatDateTime(r.closed_at) : <Chip size="small" color="success" label="Active" /> },
    { id: 'opened_by_name', label: 'Opened By' },
    { id: 'opening_amount', label: 'Opening', render: (r) => formatCurrency(r.opening_amount ?? 0, currency) },
    { id: 'total_sales', label: 'Sales', render: (r) => formatCurrency(r.total_sales ?? 0, currency) },
  ];

  return (
    <Box>
      {/* Current Shift */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Current Shift</Typography>
          {loadingCurrent ? (
            <Typography color="text.secondary">Loading…</Typography>
          ) : currentShift ? (
            <>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard title="Opened At" value={formatDateTime(currentShift.opened_at)} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard title="Opening Amount" value={formatCurrency(currentShift.opening_amount ?? 0, currency)} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard title="Total Sales" value={formatCurrency(currentShift.total_sales ?? 0, currency)} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <StatCard title="Orders" value={currentShift.total_orders ?? 0} />
                </Grid>
              </Grid>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" onClick={() => { setCashAmount(0); setCashReason(''); setCashDialog('in'); }}>Cash In</Button>
                <Button variant="outlined" onClick={() => { setCashAmount(0); setCashReason(''); setCashDialog('out'); }}>Cash Out</Button>
                <Box sx={{ flex: 1 }} />
                <Button variant="contained" color="error" onClick={() => { setCountedCash(0); setClosingNotes(''); setCloseDialog(true); }}>Close Shift</Button>
              </Box>
            </>
          ) : (
            <Box>
              <Typography color="text.secondary" sx={{ mb: 2 }}>No active shift</Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                <TextField label="Opening Amount" type="number" value={openingAmount} onChange={(e) => setOpeningAmount(Number(e.target.value))} size="small" />
                <Button variant="contained" onClick={handleOpenShift}>Open Shift</Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Past Shifts */}
      <Typography variant="h6" gutterBottom>Shift History</Typography>
      <DataTable columns={pastColumns} rows={pastShifts} totalRows={total} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} onPageSizeChange={setPageSize} rowKey={(r) => r.id} />

      {/* Cash In/Out Dialog */}
      <Dialog open={!!cashDialog} onClose={() => setCashDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cash {cashDialog === 'in' ? 'In' : 'Out'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Amount" type="number" value={cashAmount} onChange={(e) => setCashAmount(Number(e.target.value))} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Reason" value={cashReason} onChange={(e) => setCashReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCashDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleCashAction}>Record</Button>
        </DialogActions>
      </Dialog>

      {/* Close Shift Dialog */}
      <Dialog open={closeDialog} onClose={() => setCloseDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Close Shift</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Counted Cash" type="number" value={countedCash} onChange={(e) => setCountedCash(Number(e.target.value))} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Notes" multiline rows={2} value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseDialog(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleCloseShift}>Close Shift</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
