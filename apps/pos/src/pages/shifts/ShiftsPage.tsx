import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Divider,
  FormControl, InputLabel, Select, MenuItem, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Alert,
} from '@mui/material';
import { StatCard } from '@paxrest/ui';
import { formatCurrency, formatDateTime } from '@paxrest/shared-utils';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function ShiftsPage() {
  const { isGlobalStaff, activeBranchId, branches, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';

  // ── Filter state ──
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [branchFilter, setBranchFilter] = useState<string>(
    isGlobalStaff ? '__all__' : (activeBranchId ?? ''),
  );
  const [shiftId, setShiftId] = useState('');
  const [staffId, setStaffId] = useState('all');
  const [metric, setMetric] = useState<'revenue' | 'loss'>('revenue');

  // ── Data state ──
  const [shifts, setShifts] = useState<any[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [assignedStaff, setAssignedStaff] = useState<{ id: string; name: string }[]>([]);
  const [report, setReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // ── Fetch HR shifts whenever branch changes ──
  const fetchShifts = useCallback(async () => {
    setShiftsLoading(true);
    try {
      const bid = branchFilter === '__all__' ? undefined : branchFilter;
      const data = await api<{ items: any[] }>('hr', 'list-shifts', {
        params: { page: '1', page_size: '100' },
        branchId: bid,
      });
      setShifts(data.items ?? []);
    } catch { setShifts([]); }
    finally { setShiftsLoading(false); }
  }, [branchFilter]);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  // Reset shift & staff when branch changes
  useEffect(() => { setShiftId(''); setStaffId('all'); setReport(null); }, [branchFilter]);
  // Reset staff when shift changes
  useEffect(() => { setStaffId('all'); setReport(null); }, [shiftId]);

  // ── Fetch report when all filters are set ──
  const canFetch = !!date && !!shiftId;

  const fetchReport = useCallback(async () => {
    if (!canFetch) return;
    setReportLoading(true);
    try {
      const data = await api<any>('shifts', 'shift-cash-report', {
        params: {
          date,
          shift_id: shiftId,
          staff_id: staffId,
          metric,
        },
        branchId: branchFilter === '__all__' ? '__all__' : branchFilter,
      });
      setReport(data);
      setAssignedStaff(data.assigned_staff ?? []);
    } catch (err: any) {
      toast.error(err.message);
      setReport(null);
    } finally { setReportLoading(false); }
  }, [date, shiftId, staffId, metric, branchFilter, canFetch]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Selected shift info
  const selectedShift = useMemo(
    () => shifts.find((s) => s.id === shiftId),
    [shifts, shiftId],
  );

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>Shift & Cash</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Track revenue collected or losses recorded per scheduled shift, date, and cashier.
      </Typography>

      {/* ── Filter Bar ── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            {/* Date */}
            <TextField
              size="small" type="date" label="Date"
              InputLabelProps={{ shrink: true }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              sx={{ width: 165 }}
            />

            {/* Branch */}
            {isGlobalStaff ? (
              <FormControl size="small" sx={{ minWidth: 170 }}>
                <InputLabel>Branch</InputLabel>
                <Select value={branchFilter} label="Branch" onChange={(e) => setBranchFilter(e.target.value)}>
                  <MenuItem value="__all__">All Branches</MenuItem>
                  {branches.map((b: any) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
                </Select>
              </FormControl>
            ) : (
              <Chip label={activeBranch?.name ?? 'Branch'} variant="outlined" />
            )}

            {/* Shift */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Shift</InputLabel>
              <Select value={shiftId} label="Shift" onChange={(e) => setShiftId(e.target.value)}
                disabled={shiftsLoading || shifts.length === 0}>
                {shifts.filter((s) => s.is_active).map((s: any) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.shift_name} ({s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Staff */}
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Staff</InputLabel>
              <Select value={staffId} label="Staff" onChange={(e) => setStaffId(e.target.value)}
                disabled={!shiftId || assignedStaff.length === 0}>
                <MenuItem value="all">All Staff on Shift</MenuItem>
                {assignedStaff.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Metric */}
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Metric</InputLabel>
              <Select value={metric} label="Metric" onChange={(e) => setMetric(e.target.value as any)}>
                <MenuItem value="revenue">Revenue Collected</MenuItem>
                <MenuItem value="loss">Losses Recorded</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      {/* ── Loading / Empty ── */}
      {reportLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!reportLoading && !report && canFetch && (
        <Alert severity="info">Select filters above to view the shift report.</Alert>
      )}

      {!reportLoading && !canFetch && (
        <Alert severity="info">Select a date and shift to view the report.</Alert>
      )}

      {/* ── Report Results ── */}
      {!reportLoading && report && (
        <>
          {/* Summary Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Shift" value={report.shift_name} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard title="Date" value={report.date} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title={metric === 'revenue' ? 'Total Revenue' : 'Total Losses'}
                value={formatCurrency(report.summary?.total ?? 0, currency)}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                title={metric === 'revenue' ? 'Orders' : 'Records'}
                value={report.summary?.order_count ?? report.summary?.record_count ?? 0}
              />
            </Grid>
          </Grid>

          {report.staff?.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              No {metric === 'revenue' ? 'completed orders' : 'wastage records'} found for this shift period.
            </Alert>
          )}

          {/* ── Per-Staff Breakdown ── */}
          {(report.staff ?? []).map((s: any) => (
            <Card key={s.staff_id} sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>{s.staff_name}</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="h6" fontWeight={700} color={metric === 'revenue' ? 'success.main' : 'error.main'}>
                      {formatCurrency(s.total, currency)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {metric === 'revenue'
                        ? `${s.order_count} order${s.order_count !== 1 ? 's' : ''}`
                        : `${s.record_count} record${s.record_count !== 1 ? 's' : ''}`}
                    </Typography>
                  </Box>
                </Box>

                <Divider sx={{ my: 1 }} />

                {/* Order / Wastage Details Table */}
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      {metric === 'revenue' ? (
                        <TableRow>
                          <TableCell>Order #</TableCell>
                          <TableCell>Time</TableCell>
                          <TableCell>Source</TableCell>
                          <TableCell>Payment</TableCell>
                          <TableCell align="right">Amount</TableCell>
                        </TableRow>
                      ) : (
                        <TableRow>
                          <TableCell>Source</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Time</TableCell>
                          <TableCell>Notes</TableCell>
                          <TableCell align="right">Value</TableCell>
                        </TableRow>
                      )}
                    </TableHead>
                    <TableBody>
                      {metric === 'revenue'
                        ? (s.orders ?? []).map((o: any) => (
                            <TableRow key={o.id}>
                              <TableCell>#{o.order_number}</TableCell>
                              <TableCell>{formatDateTime(o.created_at)}</TableCell>
                              <TableCell><Chip size="small" label={o.source} /></TableCell>
                              <TableCell>{(o.payment_methods ?? []).join(', ') || '—'}</TableCell>
                              <TableCell align="right">{formatCurrency(o.total, currency)}</TableCell>
                            </TableRow>
                          ))
                        : (s.records ?? []).map((r: any) => (
                            <TableRow key={r.id}>
                              <TableCell><Chip size="small" label={r.source} /></TableCell>
                              <TableCell>{r.wastage_type}</TableCell>
                              <TableCell>{formatDateTime(r.created_at)}</TableCell>
                              <TableCell>{r.notes ?? '—'}</TableCell>
                              <TableCell align="right">{formatCurrency(r.total_value, currency)}</TableCell>
                            </TableRow>
                          ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </Box>
  );
}
