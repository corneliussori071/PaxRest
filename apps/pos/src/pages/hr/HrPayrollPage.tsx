import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Box, Tabs, Tab, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Chip, IconButton, MenuItem, Grid, Typography, Avatar,
  FormControl, InputLabel, Select, FormControlLabel, Switch,
  Card, CardContent, Stack, Tooltip,
  Checkbox, List, ListItem, ListItemText, ListItemIcon, RadioGroup, Radio,
  Divider, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Drawer, Menu,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import WarningIcon from '@mui/icons-material/Warning';
import ReportIcon from '@mui/icons-material/Report';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PaymentIcon from '@mui/icons-material/Payment';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import { DataTable, type Column } from '@paxrest/ui';
import { usePaginated, useApi } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import BranchGuard from '@/components/BranchGuard';
import BranchSelector from '@/components/BranchSelector';
import toast from 'react-hot-toast';

type Permission = string;
const hasPerm = (perms: Permission[], p: Permission) => perms.includes(p);
const hasAnyPerm = (perms: Permission[], ...ps: Permission[]) => ps.some((p) => perms.includes(p));

export default function HrPayrollPage() {
  return <HrPayrollContent />;
}

function HrPayrollContent() {
  const [tab, setTab] = useState(0);
  const { isGlobalStaff, profile } = useAuth();
  const perms = profile?.permissions ?? [];
  const isOwner = profile?.role === 'owner';

  // Build list of visible tabs based on permissions
  const tabs = useMemo(() => {
    const t: { label: string; key: string; full: boolean }[] = [];
    if (isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_staff', 'hr_staff_view'))
      t.push({ label: 'Staff', key: 'staff', full: isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_staff') });
    if (isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_attendance', 'hr_attendance_view'))
      t.push({ label: 'Attendance', key: 'attendance', full: isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_attendance') });
    if (isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_shifts', 'hr_shifts_view'))
      t.push({ label: 'Shift Management', key: 'shifts', full: isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_shifts') });
    if (isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_payroll', 'hr_payroll_view'))
      t.push({ label: 'Payroll', key: 'payroll', full: isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_payroll') });
    if (isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_leave', 'hr_leave_view'))
      t.push({ label: 'Leave Management', key: 'leave', full: isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_leave') });
    if (isOwner || hasAnyPerm(perms, 'manage_hr', 'hr_performance'))
      t.push({ label: 'Performance', key: 'performance', full: false });
    return t;
  }, [perms, isOwner]);

  const current = tabs[tab] ?? tabs[0];

  return (
    <Box>
      {isGlobalStaff && (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">Branch:</Typography>
          <BranchSelector showAll compact />
        </Stack>
      )}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        {tabs.map((t) => <Tab key={t.key} label={t.label} />)}
      </Tabs>
      {current?.key === 'staff' && <StaffTab fullAccess={current.full} />}
      {current?.key === 'attendance' && <AttendanceTab fullAccess={current.full} />}
      {current?.key === 'shifts' && <ShiftManagementTab fullAccess={current.full} />}
      {current?.key === 'payroll' && <PayrollTab fullAccess={current.full} />}
      {current?.key === 'leave' && <LeaveManagementTab fullAccess={current.full} />}
      {current?.key === 'performance' && <PerformanceTab fullAccess={current.full} />}
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 1: Staff
// ═══════════════════════════════════════════════════════════════════════════

function StaffTab({ fullAccess }: { fullAccess: boolean }) {
  const { activeBranchId, profile } = useAuth();
  const [branchFilter, setBranchFilter] = useState('');
  const extraParams = useMemo<Record<string, string> | undefined>(() => {
    const p: Record<string, string> = {};
    if (branchFilter) p.branch_filter = branchFilter;
    if (!fullAccess) p.my_only = 'true';
    return Object.keys(p).length ? p : undefined;
  }, [branchFilter, fullAccess]);
  const { items, total, loading, page, pageSize, sortBy, sortDir, setPage, setPageSize, onSortChange, setSearch, refetch } = usePaginated<any>('hr', 'list-staff', extraParams);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);

  // Fetch all company staff for the "Add HR Profile" picker
  const { data: allStaff } = useApi<{ items: any[]; total: number }>('staff', 'list', { page: '1', page_size: '200' });

  const columns: Column[] = [
    { id: 'name', label: 'Name', sortable: false, render: (r) => (
      <Stack direction="row" spacing={1} alignItems="center">
        <Avatar src={r.profile?.avatar_url} sx={{ width: 32, height: 32 }}>{r.profile?.name?.[0]}</Avatar>
        <Box>
          <Typography variant="body2" fontWeight={600}>{r.profile?.name}</Typography>
          <Typography variant="caption" color="text.secondary">{r.profile?.email}</Typography>
        </Box>
      </Stack>
    )},
    { id: 'staff_code', label: 'Staff Code', render: (r) => r.staff_code || '—' },
    { id: 'employment_type', label: 'Employment', render: (r) => <Chip size="small" label={r.employment_type?.replace('_', ' ')} /> },
    { id: 'salary_type', label: 'Salary Type', render: (r) => r.salary_type },
    { id: 'base_pay', label: 'Base Pay', sortable: true, render: (r) => `$${Number(r.base_pay).toFixed(2)}` },
    { id: 'hire_date', label: 'Hire Date', render: (r) => r.hire_date || '—' },
    ...(fullAccess ? [{ id: 'actions', label: '', render: (r: any) => (
      <IconButton size="small" onClick={() => { setEditData(r); setEditOpen(true); }}><EditIcon fontSize="small" /></IconButton>
    )} as Column] : []),
  ];

  return (
    <>
      {fullAccess && (
        <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Branch Filter</InputLabel>
          <Select value={branchFilter} label="Branch Filter" onChange={(e) => setBranchFilter(e.target.value)}>
            <MenuItem value="">All Staff</MenuItem>
            <MenuItem value="__none__">Global (No Branch)</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => { setEditData(null); setEditOpen(true); }}>Add HR Profile</Button>
      </Stack>
      )}
      <DataTable
        columns={columns} rows={items} totalRows={total}
        page={page} pageSize={pageSize} loading={loading}
        sortBy={sortBy} sortDir={sortDir}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={onSortChange} searchable onSearchChange={setSearch}
        rowKey={(r) => r.id}
      />
      <StaffHrDialog open={editOpen} onClose={() => setEditOpen(false)} data={editData} allStaff={allStaff?.items ?? []} existingProfileIds={items.map((i: any) => i.profile_id)} onSaved={refetch} />
    </>
  );
}

function StaffHrDialog({ open, onClose, data, allStaff, existingProfileIds, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);

  React.useEffect(() => {
    if (data) {
      setForm({ ...data });
    } else {
      setForm({ employment_type: 'full_time', salary_type: 'monthly', base_pay: 0, allowances: 0, tax_percentage: 0, overtime_rate: 0, hourly_rate: 0, payout_method: 'cash' });
    }
  }, [data, open]);

  const handleSave = async () => {
    if (!form.profile_id && !data) { toast.error('Select a staff member'); return; }
    if (form.employment_type === 'contract' && !form.employment_end_date) { toast.error('Employment end date is required for contracts'); return; }
    if (form.salary_type === 'hourly' && (!form.hourly_rate || form.hourly_rate <= 0)) { toast.error('Hourly rate is required for hourly salary type'); return; }
    if (form.payout_method === 'bank' && (!form.bank_name || !form.account_type || !form.bank_account)) { toast.error('Bank name, account type and account number are required'); return; }
    setSaving(true);
    try {
      await api('hr', 'upsert-staff', { body: { ...form, profile_id: form.profile_id ?? data?.profile_id } });
      toast.success('Saved');
      onSaved();
      onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleAutoCode = async () => {
    setGeneratingCode(true);
    try {
      const result = await api<{ code: string }>('hr', 'generate-staff-code');
      setForm((prev: any) => ({ ...prev, staff_code: result.code }));
    } catch (err: any) { toast.error(err.message); }
    finally { setGeneratingCode(false); }
  };

  // Calculate age from DOB
  const staffAge = useMemo(() => {
    if (!form.date_of_birth) return null;
    const dob = new Date(form.date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }, [form.date_of_birth]);

  const availableStaff = allStaff.filter((s: any) => !existingProfileIds.includes(s.id));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{data ? 'Edit HR Profile' : 'Add HR Profile'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {!data && (
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Staff Member</InputLabel>
                <Select value={form.profile_id ?? ''} label="Staff Member"
                  onChange={(e) => setForm({ ...form, profile_id: e.target.value })}>
                  {availableStaff.map((s: any) => <MenuItem key={s.id} value={s.id}>{s.name} ({s.email})</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          )}
          <Grid size={{ xs: 6 }}>
            <Stack direction="row" spacing={1}>
              <TextField fullWidth size="small" label="Staff Code" value={form.staff_code ?? ''} onChange={(e) => setForm({ ...form, staff_code: e.target.value })} placeholder="e.g. STAFF-0001" />
              <Tooltip title="Auto-generate"><span>
                <IconButton onClick={handleAutoCode} disabled={generatingCode} size="small" sx={{ mt: 0.25 }}>
                  <AutorenewIcon fontSize="small" sx={generatingCode ? { animation: 'spin 1s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } } : {}} />
                </IconButton>
              </span></Tooltip>
            </Stack>
          </Grid>
          <Grid size={{ xs: 3 }}>
            <TextField fullWidth size="small" label="Date of Birth" type="date" InputLabelProps={{ shrink: true }} value={form.date_of_birth ?? ''} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 3 }}>
            <TextField fullWidth size="small" label="Age" value={staffAge !== null ? `${staffAge} years` : '—'} InputProps={{ readOnly: true }} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Gender</InputLabel>
              <Select value={form.gender ?? ''} label="Gender" onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <MenuItem value="male">Male</MenuItem>
                <MenuItem value="female">Female</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 3 }}>
            <TextField fullWidth size="small" label="Hire Date" type="date" InputLabelProps={{ shrink: true }} value={form.hire_date ?? ''} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 3 }}>
            <TextField fullWidth size="small" label="Retirement Date" type="date" InputLabelProps={{ shrink: true }} value={form.retirement_date ?? ''} onChange={(e) => setForm({ ...form, retirement_date: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12 }}><TextField fullWidth size="small" label="Address" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Emergency Contact Name" value={form.emergency_contact_name ?? ''} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Emergency Contact Phone" value={form.emergency_contact_phone ?? ''} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></Grid>

          {/* Employment Type */}
          <Grid size={{ xs: form.employment_type === 'contract' ? 6 : 12 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Employment Type</InputLabel>
              <Select value={form.employment_type ?? 'full_time'} label="Employment Type" onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>
                <MenuItem value="full_time">Full Time</MenuItem>
                <MenuItem value="part_time">Part Time</MenuItem>
                <MenuItem value="contract">Contract</MenuItem>
                <MenuItem value="intern">Intern</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {form.employment_type === 'contract' && (
            <Grid size={{ xs: 6 }}>
              <TextField fullWidth size="small" label="Employment End Date *" type="date" InputLabelProps={{ shrink: true }} value={form.employment_end_date ?? ''} onChange={(e) => setForm({ ...form, employment_end_date: e.target.value })} />
            </Grid>
          )}

          {/* Salary Type */}
          <Grid size={{ xs: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Salary Type</InputLabel>
              <Select value={form.salary_type ?? 'monthly'} label="Salary Type" onChange={(e) => setForm({ ...form, salary_type: e.target.value })}>
                <MenuItem value="monthly">Monthly</MenuItem>
                <MenuItem value="hourly">Hourly</MenuItem>
                <MenuItem value="daily">Daily</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {form.salary_type === 'hourly' ? (
            <>
              <Grid size={{ xs: 3 }}>
                <TextField fullWidth size="small" label="Hourly Rate *" type="number" value={form.hourly_rate ?? 0} onChange={(e) => setForm({ ...form, hourly_rate: Number(e.target.value) })} />
              </Grid>
              <Grid size={{ xs: 3 }}>
                <TextField fullWidth size="small" label="OT Rate/Hour" type="number" value={form.overtime_rate ?? 0} onChange={(e) => setForm({ ...form, overtime_rate: Number(e.target.value) })} />
              </Grid>
            </>
          ) : (
            <Grid size={{ xs: 6 }}>
              <TextField fullWidth size="small" label="Base Pay" type="number" value={form.base_pay ?? 0} onChange={(e) => setForm({ ...form, base_pay: Number(e.target.value) })} />
            </Grid>
          )}

          <Grid size={{ xs: 4 }}><TextField fullWidth size="small" label="Allowances" type="number" value={form.allowances ?? 0} onChange={(e) => setForm({ ...form, allowances: Number(e.target.value) })} /></Grid>
          <Grid size={{ xs: 4 }}><TextField fullWidth size="small" label="Tax %" type="number" value={form.tax_percentage ?? 0} onChange={(e) => setForm({ ...form, tax_percentage: Number(e.target.value) })} /></Grid>

          {/* Payout Method */}
          <Grid size={{ xs: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Payout Method</InputLabel>
              <Select value={form.payout_method ?? 'cash'} label="Payout Method" onChange={(e) => setForm({ ...form, payout_method: e.target.value })}>
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="bank">Bank</MenuItem>
                <MenuItem value="mobile_money">Mobile Money</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {form.payout_method === 'bank' && (
            <>
              <Grid size={{ xs: 4 }}>
                <TextField fullWidth size="small" label="Bank Name *" value={form.bank_name ?? ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Account Type *</InputLabel>
                  <Select value={form.account_type ?? ''} label="Account Type *" onChange={(e) => setForm({ ...form, account_type: e.target.value })}>
                    <MenuItem value="savings">Savings</MenuItem>
                    <MenuItem value="current">Current</MenuItem>
                    <MenuItem value="checking">Checking</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField fullWidth size="small" label="Account Number *" value={form.bank_account ?? ''} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
              </Grid>
            </>
          )}
          {form.payout_method === 'mobile_money' && (
            <Grid size={{ xs: 8 }}>
              <TextField fullWidth size="small" label="Mobile Money Number" value={form.bank_account ?? ''} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 2: Attendance
// ═══════════════════════════════════════════════════════════════════════════

function AttendanceTab({ fullAccess }: { fullAccess: boolean }) {
  const { profile } = useAuth();

  // ── Restricted: Clock In / Out view ──
  if (!fullAccess) return <AttendanceClockView />;

  // ── Full access: admin view ──
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const extraParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (statusFilter) p.status = statusFilter;
    return p;
  }, [dateFrom, dateTo, statusFilter]);

  const { items, total, loading, page, pageSize, sortBy, sortDir, setPage, setPageSize, onSortChange, setSearch, refetch } = usePaginated<any>('hr', 'list-attendance', extraParams);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);

  const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
    present: 'success', absent: 'error', late: 'warning', half_day: 'info', on_leave: 'default',
  };

  const columns: Column[] = [
    { id: 'staff', label: 'Staff', render: (r) => r.staff?.name ?? '—' },
    { id: 'date', label: 'Date', sortable: true, render: (r) => r.date },
    { id: 'clock_in', label: 'Clock In', render: (r) => r.clock_in ? new Date(r.clock_in).toLocaleTimeString() : '—' },
    { id: 'clock_out', label: 'Clock Out', render: (r) => r.clock_out ? new Date(r.clock_out).toLocaleTimeString() : '—' },
    { id: 'total_hours', label: 'Hours', sortable: true, render: (r) => r.total_hours ?? '—' },
    { id: 'overtime_hours', label: 'OT Hours', render: (r) => r.overtime_hours > 0 ? r.overtime_hours : '—' },
    { id: 'status', label: 'Status', render: (r) => <Chip size="small" label={r.status?.replace('_', ' ')} color={statusColor[r.status] ?? 'default'} /> },
    { id: 'actions', label: '', render: (r) => (
      <IconButton size="small" onClick={() => { setEditData(r); setEditOpen(true); }}><EditIcon fontSize="small" /></IconButton>
    )},
  ];

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="present">Present</MenuItem>
            <MenuItem value="absent">Absent</MenuItem>
            <MenuItem value="late">Late</MenuItem>
            <MenuItem value="half_day">Half Day</MenuItem>
            <MenuItem value="on_leave">On Leave</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      <DataTable
        columns={columns} rows={items} totalRows={total}
        page={page} pageSize={pageSize} loading={loading}
        sortBy={sortBy} sortDir={sortDir}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={onSortChange} searchable onSearchChange={setSearch}
        rowKey={(r) => r.id}
        toolbar={<Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => { setEditData(null); setEditOpen(true); }}>Record Attendance</Button>}
      />
      <AttendanceDialog open={editOpen} onClose={() => setEditOpen(false)} data={editData} onSaved={refetch} />
    </>
  );
}

function AttendanceDialog({ open, onClose, data, onSaved }: any) {
  const { data: staffList } = useApi<{ items: any[]; total: number }>('staff', 'list', { page: '1', page_size: '200' });
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (data) setForm({ ...data, staff_id: data.staff_id ?? data.staff?.id });
    else setForm({ status: 'present', date: new Date().toISOString().slice(0, 10), break_minutes: 0, overtime_hours: 0 });
  }, [data, open]);

  const handleSave = async () => {
    if (!form.staff_id || !form.date) { toast.error('Select staff and date'); return; }
    setSaving(true);
    try {
      await api('hr', 'upsert-attendance', { body: form });
      toast.success('Saved'); onSaved(); onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{data ? 'Edit Attendance' : 'Record Attendance'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Staff Member</InputLabel>
              <Select value={form.staff_id ?? ''} label="Staff Member" onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
                {(staffList?.items ?? []).map((s: any) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Date" type="date" InputLabelProps={{ shrink: true }} value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Grid>
          <Grid size={{ xs: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={form.status ?? 'present'} label="Status" onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <MenuItem value="present">Present</MenuItem>
                <MenuItem value="absent">Absent</MenuItem>
                <MenuItem value="late">Late</MenuItem>
                <MenuItem value="half_day">Half Day</MenuItem>
                <MenuItem value="on_leave">On Leave</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Clock In" type="datetime-local" InputLabelProps={{ shrink: true }} value={form.clock_in?.slice(0, 16) ?? ''} onChange={(e) => setForm({ ...form, clock_in: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Clock Out" type="datetime-local" InputLabelProps={{ shrink: true }} value={form.clock_out?.slice(0, 16) ?? ''} onChange={(e) => setForm({ ...form, clock_out: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Grid>
          <Grid size={{ xs: 4 }}><TextField fullWidth size="small" label="Break (min)" type="number" value={form.break_minutes ?? 0} onChange={(e) => setForm({ ...form, break_minutes: Number(e.target.value) })} /></Grid>
          <Grid size={{ xs: 4 }}><TextField fullWidth size="small" label="Total Hours" type="number" value={form.total_hours ?? ''} onChange={(e) => setForm({ ...form, total_hours: Number(e.target.value) })} /></Grid>
          <Grid size={{ xs: 4 }}><TextField fullWidth size="small" label="OT Hours" type="number" value={form.overtime_hours ?? 0} onChange={(e) => setForm({ ...form, overtime_hours: Number(e.target.value) })} /></Grid>
          <Grid size={{ xs: 12 }}><TextField fullWidth size="small" label="Notes" multiline rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Restricted Attendance: Clock In / Clock Out ─────────────────────────────
function AttendanceClockView() {
  const { profile } = useAuth();
  const [clockStatus, setClockStatus] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [acting, setActing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await api<any>('hr', 'my-clock-status');
      setClockStatus(res);
    } catch {}
    finally { setLoadingStatus(false); }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await api<any>('hr', 'my-attendance');
      setHistory(res.items ?? []);
    } catch {}
  }, []);

  useEffect(() => { fetchStatus(); fetchHistory(); }, [fetchStatus, fetchHistory]);

  const handleClockIn = async () => {
    setActing(true);
    try {
      await api('hr', 'clock-in', { body: {} });
      toast.success('Clocked in!');
      fetchStatus(); fetchHistory();
    } catch (err: any) { toast.error(err.message); }
    finally { setActing(false); }
  };

  const handleClockOut = async () => {
    setActing(true);
    try {
      await api('hr', 'clock-out', { body: {} });
      toast.success('Clocked out!');
      fetchStatus(); fetchHistory();
    } catch (err: any) { toast.error(err.message); }
    finally { setActing(false); }
  };

  if (loadingStatus) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;

  return (
    <Box>
      {/* Clock Action Card */}
      <Card variant="outlined" sx={{ mb: 3, maxWidth: 480, mx: 'auto' }}>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" gutterBottom>{profile?.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Typography>

          {clockStatus?.clocked_in ? (
            <>
              <Chip label="Currently Clocked In" color="success" sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Since {clockStatus.clock_in_time ? new Date(clockStatus.clock_in_time).toLocaleTimeString() : '—'}
                {clockStatus.shift_name && ` · Shift: ${clockStatus.shift_name}`}
              </Typography>
              <Button variant="contained" color="error" size="large" startIcon={<LogoutIcon />} onClick={handleClockOut} disabled={acting}>
                {acting ? 'Clocking Out…' : 'Clock Out'}
              </Button>
            </>
          ) : (
            <>
              <Chip label="Not Clocked In" color="default" sx={{ mb: 2 }} />
              {clockStatus?.active_shift ? (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Active shift: {clockStatus.active_shift.shift_name} ({clockStatus.active_shift.start_time} – {clockStatus.active_shift.end_time})
                </Typography>
              ) : (
                <Typography variant="body2" color="warning.main" sx={{ mb: 2 }}>
                  {clockStatus?.message || 'No active shift found'}
                </Typography>
              )}
              <Button variant="contained" color="primary" size="large" startIcon={<LoginIcon />} onClick={handleClockIn}
                disabled={acting || !clockStatus?.can_clock_in}>
                {acting ? 'Clocking In…' : 'Clock In'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Attendance History */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Recent Attendance</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Clock In</TableCell>
              <TableCell>Clock Out</TableCell>
              <TableCell>Hours</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {history.length === 0 ? (
              <TableRow><TableCell colSpan={5} align="center"><Typography variant="body2" color="text.secondary">No attendance records</Typography></TableCell></TableRow>
            ) : history.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.clock_in ? new Date(r.clock_in).toLocaleTimeString() : '—'}</TableCell>
                <TableCell>{r.clock_out ? new Date(r.clock_out).toLocaleTimeString() : '—'}</TableCell>
                <TableCell>{r.total_hours ?? '—'}</TableCell>
                <TableCell><Chip size="small" label={r.status?.replace('_', ' ')} color={r.status === 'present' ? 'success' : r.status === 'late' ? 'warning' : 'default'} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 3: Shift Management
// ═══════════════════════════════════════════════════════════════════════════

function ShiftManagementTab({ fullAccess }: { fullAccess: boolean }) {
  // Restricted: only show their own schedule
  if (!fullAccess) return <MyScheduleView />;

  const [subTab, setSubTab] = useState(0);
  return (
    <Box>
      <Tabs value={subTab} onChange={(_, v) => setSubTab(v)} sx={{ mb: 2 }}>
        <Tab label="Shifts" />
        <Tab label="Stations" />
        <Tab label="Schedules" />
      </Tabs>
      {subTab === 0 && <ShiftsSubTab />}
      {subTab === 1 && <StationsSubTab />}
      {subTab === 2 && <SchedulesSubTab />}
    </Box>
  );
}

function ShiftsSubTab() {
  const { items, total, loading, page, pageSize, sortBy, sortDir, setPage, setPageSize, onSortChange, setSearch, refetch } = usePaginated<any>('hr', 'list-shifts');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);

  const columns: Column[] = [
    { id: 'shift_name', label: 'Shift Name', sortable: true },
    { id: 'start_time', label: 'Start', sortable: true },
    { id: 'end_time', label: 'End' },
    { id: 'max_staff', label: 'Max Staff' },
    { id: 'break_duration', label: 'Break (min)' },
    { id: 'is_active', label: 'Active', render: (r) => r.is_active ? <Chip size="small" label="Active" color="success" /> : <Chip size="small" label="Inactive" /> },
    { id: 'actions', label: '', render: (r) => (
      <Stack direction="row" spacing={0.5}>
        <IconButton size="small" onClick={() => { setEditData(r); setDialogOpen(true); }}><EditIcon fontSize="small" /></IconButton>
        <IconButton size="small" color="error" onClick={() => handleDelete(r.id)}><DeleteIcon fontSize="small" /></IconButton>
      </Stack>
    )},
  ];

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this shift?')) return;
    try { await api('hr', 'delete-shift', { body: { id } }); toast.success('Deleted'); refetch(); }
    catch (err: any) { toast.error(err.message); }
  };

  return (
    <>
      <DataTable
        columns={columns} rows={items} totalRows={total}
        page={page} pageSize={pageSize} loading={loading}
        sortBy={sortBy} sortDir={sortDir}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={onSortChange} searchable onSearchChange={setSearch}
        rowKey={(r) => r.id}
        toolbar={<Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => { setEditData(null); setDialogOpen(true); }}>Add Shift</Button>}
      />
      <ShiftDialog open={dialogOpen} onClose={() => setDialogOpen(false)} data={editData} onSaved={refetch} />
    </>
  );
}

function ShiftDialog({ open, onClose, data, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (data) setForm({ ...data });
    else setForm({ shift_name: '', start_time: '08:00', end_time: '17:00', max_staff: 5, break_duration: 60 });
  }, [data, open]);

  const handleSave = async () => {
    if (!form.shift_name) { toast.error('Shift name is required'); return; }
    setSaving(true);
    try {
      if (data) {
        await api('hr', 'update-shift', { body: form });
      } else {
        await api('hr', 'create-shift', { body: form });
      }
      toast.success('Saved'); onSaved(); onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{data ? 'Edit Shift' : 'Create Shift'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12 }}><TextField fullWidth size="small" label="Shift Name" value={form.shift_name ?? ''} onChange={(e) => setForm({ ...form, shift_name: e.target.value })} /></Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Start Time" type="time" InputLabelProps={{ shrink: true }} value={form.start_time ?? ''} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="End Time" type="time" InputLabelProps={{ shrink: true }} value={form.end_time ?? ''} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Max Staff" type="number" value={form.max_staff ?? 5} onChange={(e) => setForm({ ...form, max_staff: Number(e.target.value) })} /></Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Break Duration (min)" type="number" value={form.break_duration ?? 0} onChange={(e) => setForm({ ...form, break_duration: Number(e.target.value) })} /></Grid>
          {data && (
            <Grid size={{ xs: 12 }}>
              <FormControlLabel control={<Switch checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Active" />
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function StationsSubTab() {
  const { items, total, loading, page, pageSize, sortBy, sortDir, setPage, setPageSize, onSortChange, setSearch, refetch } = usePaginated<any>('hr', 'list-stations');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);

  const columns: Column[] = [
    { id: 'station_name', label: 'Station Name', sortable: true },
    { id: 'total_staff', label: 'Total Staff', render: (r) => r.total_staff ?? 0 },
    { id: 'monthly_cost', label: 'Monthly Cost', render: (r) => `$${Number(r.monthly_cost ?? 0).toFixed(2)}` },
    { id: 'actions', label: '', render: (r) => (
      <Stack direction="row" spacing={0.5}>
        <IconButton size="small" onClick={() => { setEditData(r); setDialogOpen(true); }}><EditIcon fontSize="small" /></IconButton>
        <IconButton size="small" color="error" onClick={() => handleDelete(r.id)}><DeleteIcon fontSize="small" /></IconButton>
      </Stack>
    )},
  ];

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this station?')) return;
    try { await api('hr', 'delete-station', { body: { id } }); toast.success('Deleted'); refetch(); }
    catch (err: any) { toast.error(err.message); }
  };

  return (
    <>
      <DataTable
        columns={columns} rows={items} totalRows={total}
        page={page} pageSize={pageSize} loading={loading}
        sortBy={sortBy} sortDir={sortDir}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={onSortChange} searchable onSearchChange={setSearch}
        rowKey={(r) => r.id}
        toolbar={<Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => { setEditData(null); setDialogOpen(true); }}>Create Station</Button>}
      />
      <StationDialog open={dialogOpen} onClose={() => setDialogOpen(false)} data={editData} onSaved={refetch} />
    </>
  );
}

function StationDialog({ open, onClose, data, onSaved }: any) {
  const { data: staffList } = useApi<{ items: any[]; total: number }>('staff', 'list', { page: '1', page_size: '200' });
  const [form, setForm] = useState<any>({});
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (data) {
      setForm({ id: data.id, station_name: data.station_name ?? '' });
      setSelectedStaff((data.staff ?? []).map((s: any) => s.staff_id));
    } else {
      setForm({ station_name: '' });
      setSelectedStaff([]);
    }
  }, [data, open]);

  const toggleStaff = (id: string) => {
    setSelectedStaff((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!form.station_name) { toast.error('Station name is required'); return; }
    setSaving(true);
    try {
      if (data) {
        await api('hr', 'update-station', { body: { ...form, staff_ids: selectedStaff } });
      } else {
        await api('hr', 'create-station', { body: { ...form, staff_ids: selectedStaff } });
      }
      toast.success('Saved'); onSaved(); onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{data ? 'Edit Station' : 'Create Station'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth size="small" label="Station Name" value={form.station_name ?? ''} onChange={(e) => setForm({ ...form, station_name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Assign Staff</Typography>
            <List dense sx={{ maxHeight: 300, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              {(staffList?.items ?? []).map((s: any) => (
                <ListItem key={s.id} dense component="label" sx={{ cursor: 'pointer' }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox edge="start" size="small" checked={selectedStaff.includes(s.id)} onChange={() => toggleStaff(s.id)} />
                  </ListItemIcon>
                  <ListItemText primary={s.name} secondary={s.email} />
                </ListItem>
              ))}
            </List>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function SchedulesSubTab() {
  const { data: schedules, loading, refetch } = useApi<{ items: any[]; total: number }>('hr', 'list-schedules');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entire schedule and all its assignments?')) return;
    try { await api('hr', 'delete-schedule', { body: { id } }); toast.success('Deleted'); refetch(); }
    catch (err: any) { toast.error(err.message); }
  };

  if (selectedSchedule) {
    return <ScheduleDetailView schedule={selectedSchedule} onBack={() => { setSelectedSchedule(null); refetch(); }} />;
  }

  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDialogOpen(true)}>+ Add Schedule</Button>
      </Stack>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : (schedules?.items ?? []).length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No schedules created yet. Click "+ Add Schedule" to create one.</Typography>
      ) : (
        <Grid container spacing={2}>
          {(schedules?.items ?? []).map((s: any) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={s.id}>
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>{s.station?.station_name ?? 'Unknown Station'}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {s.date_from} → {s.date_to}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.assignment_count} assignment{s.assignment_count !== 1 ? 's' : ''} · Created by {s.creator?.name ?? '—'}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="View schedule">
                        <IconButton size="small" onClick={() => setSelectedSchedule(s)}><VisibilityIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(s.id)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
      <ScheduleDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={refetch} />
    </>
  );
}

// ─── Schedule Detail Grid View ────────────────────────────────────────────

function ScheduleDetailView({ schedule, onBack }: { schedule: any; onBack: () => void }) {
  const [detail, setDetail] = useState<{ schedule: any; assignments: any[]; shifts: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<string | null>(null); // "staffId|date"

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>('hr', 'get-schedule-detail', { params: { schedule_id: schedule.id } });
      setDetail(res);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [schedule.id]);

  React.useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Build date range array
  const dates = useMemo(() => {
    if (!detail) return [];
    const d: string[] = [];
    const start = new Date(detail.schedule.date_from);
    const end = new Date(detail.schedule.date_to);
    for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      d.push(cur.toISOString().slice(0, 10));
    }
    return d;
  }, [detail]);

  // Build staff list (unique staff from assignments)
  const staffList = useMemo(() => {
    if (!detail) return [];
    const map = new Map<string, { id: string; name: string; email: string; avatar_url?: string }>();
    for (const a of detail.assignments) {
      if (a.staff && !map.has(a.staff.id)) {
        map.set(a.staff.id, a.staff);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [detail]);

  // Build lookup: "staffId|date" => assignment
  const assignmentMap = useMemo(() => {
    if (!detail) return new Map<string, any>();
    const map = new Map<string, any>();
    for (const a of detail.assignments) {
      const key = `${a.staff?.id}|${a.assignment_date}`;
      map.set(key, a);
    }
    return map;
  }, [detail]);

  const handleShiftChange = async (assignmentId: string, newShiftId: string) => {
    try {
      await api('hr', 'update-assignment', { body: { id: assignmentId, shift_id: newShiftId } });
      toast.success('Updated');
      fetchDetail();
    } catch (err: any) { toast.error(err.message); }
    setEditingCell(null);
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      await api('hr', 'delete-assignment', { body: { id: assignmentId } });
      toast.success('Removed');
      fetchDetail();
    } catch (err: any) { toast.error(err.message); }
    setEditingCell(null);
  };

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { day: days[d.getDay()], date: d.getDate(), month: d.toLocaleString('default', { month: 'short' }) };
  };

  const handlePrint = () => {
    const printArea = document.getElementById('schedule-print-area');
    if (!printArea) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>Schedule - ${detail?.schedule?.station?.station_name ?? ''}</title>
<style>body{font-family:Arial,sans-serif;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;text-align:center;font-size:12px}th{background:#f5f5f5;font-weight:600}.staff-name{text-align:left;font-weight:500}h2{margin-bottom:4px}p{color:#666;margin-top:0}</style>
</head><body>${printArea.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleExport = () => {
    if (!detail || staffList.length === 0) return;
    const header = ['Staff', ...dates].join(',');
    const rows = staffList.map((staff) => {
      const cells = dates.map((date) => {
        const a = assignmentMap.get(`${staff.id}|${date}`);
        return a?.shift?.shift_name ?? 'OFF';
      });
      return [`"${staff.name}"`, ...cells].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_${detail.schedule.station?.station_name ?? 'export'}_${detail.schedule.date_from}_${detail.schedule.date_to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (!detail) return <Typography color="error">Failed to load schedule</Typography>;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>
          <Box>
            <Typography variant="h6">{detail.schedule.station?.station_name}</Typography>
            <Typography variant="body2" color="text.secondary">{detail.schedule.date_from} → {detail.schedule.date_to}</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<PrintIcon />} onClick={handlePrint}>Print</Button>
          <Button size="small" startIcon={<DownloadIcon />} onClick={handleExport}>Export CSV</Button>
        </Stack>
      </Stack>

      <div id="schedule-print-area">
        <Box sx={{ display: 'none', '@media print': { display: 'block' } }}>
          <h2>{detail.schedule.station?.station_name} Schedule</h2>
          <p>{detail.schedule.date_from} to {detail.schedule.date_to}</p>
        </Box>
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: dates.length * 90 + 180 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 2, minWidth: 160 }}>Staff</TableCell>
                {dates.map((date) => {
                  const { day, date: d, month } = formatDay(date);
                  const isWeekend = day === 'Sat' || day === 'Sun';
                  return (
                    <TableCell key={date} align="center" sx={{ fontWeight: 600, minWidth: 80, bgcolor: isWeekend ? 'action.hover' : undefined }}>
                      <Typography variant="caption" display="block">{day}</Typography>
                      <Typography variant="body2">{d} {month}</Typography>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {staffList.map((staff) => (
                <TableRow key={staff.id} hover>
                  <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1, fontWeight: 500 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Avatar src={staff.avatar_url} sx={{ width: 24, height: 24, fontSize: 12 }}>{staff.name?.[0]}</Avatar>
                      <Typography variant="body2">{staff.name}</Typography>
                    </Stack>
                  </TableCell>
                  {dates.map((date) => {
                    const cellKey = `${staff.id}|${date}`;
                    const assignment = assignmentMap.get(cellKey);
                    const isEditing = editingCell === cellKey;
                    const isWeekend = (() => { const d = new Date(date + 'T00:00:00'); return d.getDay() === 0 || d.getDay() === 6; })();

                    if (isEditing && assignment) {
                      return (
                        <TableCell key={date} align="center" sx={{ p: 0.5, bgcolor: isWeekend ? 'action.hover' : undefined }}>
                          <Select
                            size="small"
                            value={assignment.shift?.id ?? ''}
                            onChange={(e) => handleShiftChange(assignment.id, e.target.value)}
                            onClose={() => setEditingCell(null)}
                            autoFocus
                            open
                            sx={{ minWidth: 80, fontSize: '0.75rem' }}
                          >
                            {(detail.shifts ?? []).map((sh: any) => (
                              <MenuItem key={sh.id} value={sh.id} sx={{ fontSize: '0.75rem' }}>{sh.shift_name}</MenuItem>
                            ))}
                            <Divider />
                            <MenuItem value="__delete__" sx={{ fontSize: '0.75rem', color: 'error.main' }} onClick={(e) => { e.stopPropagation(); handleDeleteAssignment(assignment.id); }}>
                              Remove
                            </MenuItem>
                          </Select>
                        </TableCell>
                      );
                    }

                    return (
                      <TableCell
                        key={date}
                        align="center"
                        onClick={() => assignment && setEditingCell(cellKey)}
                        sx={{
                          cursor: assignment ? 'pointer' : 'default',
                          bgcolor: isWeekend ? 'action.hover' : undefined,
                          '&:hover': assignment ? { bgcolor: 'action.selected' } : {},
                          p: 0.5,
                        }}
                      >
                        {assignment ? (
                          <Tooltip title={`${assignment.shift?.start_time} – ${assignment.shift?.end_time}. Click to edit.`}>
                            <Chip
                              label={assignment.shift?.shift_name ?? '?'}
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{ fontSize: '0.7rem', height: 24 }}
                            />
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.disabled">OFF</Typography>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </Box>
  );
}

function ScheduleDialog({ open, onClose, onSaved }: any) {
  const { data: stationList } = useApi<{ items: any[]; total: number }>('hr', 'list-stations', { page: '1', page_size: '100' });
  const { data: shiftList } = useApi<{ items: any[]; total: number }>('hr', 'list-shifts', { page: '1', page_size: '50' });
  const [stationId, setStationId] = useState('');
  const [stationStaff, setStationStaff] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [selectedShifts, setSelectedShifts] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [maxHoursPerWeek, setMaxHoursPerWeek] = useState(48);
  const [offDaysAfterMax, setOffDaysAfterMax] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingStation, setLoadingStation] = useState(false);

  React.useEffect(() => {
    setStationId('');
    setStationStaff([]);
    setSelectedStaff([]);
    setSelectedShifts([]);
    setDateFrom(new Date().toISOString().slice(0, 10));
    setDateTo(new Date().toISOString().slice(0, 10));
    setMaxHoursPerWeek(48);
    setOffDaysAfterMax(1);
  }, [open]);

  const handleStationChange = async (sid: string) => {
    setStationId(sid);
    if (!sid) { setStationStaff([]); setSelectedStaff([]); return; }
    setLoadingStation(true);
    try {
      const res = await api('hr', 'get-station', { params: { station_id: sid } });
      const staff = (res as any).station?.staff ?? [];
      setStationStaff(staff);
      setSelectedStaff(staff.map((s: any) => s.staff_id));
    } catch { setStationStaff([]); setSelectedStaff([]); }
    finally { setLoadingStation(false); }
  };

  const toggleStaff = (id: string) => {
    setSelectedStaff((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const toggleShift = (id: string) => {
    setSelectedShifts((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const handleGenerate = async () => {
    if (!stationId) { toast.error('Select a station'); return; }
    if (selectedShifts.length === 0) { toast.error('Select at least one shift'); return; }
    if (selectedStaff.length === 0) { toast.error('Select at least one staff member'); return; }
    setSaving(true);
    try {
      const res: any = await api('hr', 'generate-schedule', {
        body: {
          station_id: stationId,
          shift_ids: selectedShifts,
          staff_ids: selectedStaff,
          date_from: dateFrom,
          date_to: dateTo,
          max_hours_per_week: maxHoursPerWeek,
          off_days_after_max: offDaysAfterMax,
        },
      });
      toast.success(`Schedule created: ${res.count} assignments`);
      if (res.warnings && res.warnings.length > 0) {
        toast(`${res.warnings.length} shift(s) are understaffed`, { icon: '⚠️' });
      }
      onSaved(); onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Generate Schedule</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {/* Period */}
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth size="small" label="From" type="date" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth size="small" label="To" type="date" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Grid>

          {/* Station */}
          <Grid size={{ xs: 12 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Station</InputLabel>
              <Select value={stationId} label="Station" onChange={(e) => handleStationChange(e.target.value)}>
                {(stationList?.items ?? []).map((s: any) => <MenuItem key={s.id} value={s.id}>{s.station_name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>

          {/* Staff from station */}
          <Grid size={{ xs: 12 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Staff {loadingStation && <CircularProgress size={14} sx={{ ml: 1 }} />}
            </Typography>
            <Typography variant="caption" color="text.secondary">Staff from the selected station are pre-selected. Uncheck to exclude.</Typography>
            <List dense sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, mt: 0.5 }}>
              {stationStaff.length === 0 && (
                <ListItem dense><ListItemText primary="Select a station to load staff" /></ListItem>
              )}
              {stationStaff.map((s: any) => (
                <ListItem key={s.staff_id} dense component="label" sx={{ cursor: 'pointer' }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox edge="start" size="small" checked={selectedStaff.includes(s.staff_id)} onChange={() => toggleStaff(s.staff_id)} />
                  </ListItemIcon>
                  <ListItemText primary={s.profile?.name ?? s.staff_id} secondary={s.profile?.email} />
                </ListItem>
              ))}
            </List>
          </Grid>

          <Grid size={{ xs: 12 }}><Divider /></Grid>

          {/* Shifts */}
          <Grid size={{ xs: 12 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Shifts</Typography>
            <List dense sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              {(shiftList?.items ?? []).filter((s: any) => s.is_active).map((s: any) => (
                <ListItem key={s.id} dense component="label" sx={{ cursor: 'pointer' }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox edge="start" size="small" checked={selectedShifts.includes(s.id)} onChange={() => toggleShift(s.id)} />
                  </ListItemIcon>
                  <ListItemText primary={s.shift_name} secondary={`${s.start_time} – ${s.end_time} (max ${s.max_staff})`} />
                </ListItem>
              ))}
            </List>
          </Grid>

          <Grid size={{ xs: 12 }}><Divider /></Grid>

          {/* Rules */}
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth size="small" label="Max Hours Per Week" type="number" value={maxHoursPerWeek} onChange={(e) => setMaxHoursPerWeek(Number(e.target.value))} helperText="Staff get off days after reaching this limit" />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth size="small" label="Off Days After Max" type="number" value={offDaysAfterMax} onChange={(e) => setOffDaysAfterMax(Number(e.target.value))} helperText="Mandatory rest days after max hours reached" />
          </Grid>

        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleGenerate} disabled={saving} startIcon={saving ? <CircularProgress size={16} /> : <AutorenewIcon />}>
          {saving ? 'Generating…' : 'Generate Schedule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Restricted: My Schedule View ────────────────────────────────────────────
function MyScheduleView() {
  const { profile } = useAuth();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMySchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>('hr', 'my-schedule');
      setSchedules(res.items ?? []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMySchedules(); }, [fetchMySchedules]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;

  if (schedules.length === 0) {
    return <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No schedules assigned to you.</Typography>;
  }

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>My Schedule</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Station</TableCell>
              <TableCell>Shift</TableCell>
              <TableCell>Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {schedules.map((a: any, i: number) => (
              <TableRow key={i}>
                <TableCell>{a.assignment_date}</TableCell>
                <TableCell>{a.station_name ?? '—'}</TableCell>
                <TableCell>{a.shift_name ?? '—'}</TableCell>
                <TableCell>{a.start_time ?? '—'} – {a.end_time ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// Tab 4: Payroll
// ═══════════════════════════════════════════════════════════════════════════

function PayrollTab({ fullAccess }: { fullAccess: boolean }) {
  // Restricted: show own payslip only
  if (!fullAccess) return <MyPayrollView />;

  const [statusFilter, setStatusFilter] = useState('');
  const now = new Date();
  const defStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defEnd = now.toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(defStart);
  const [periodEnd, setPeriodEnd] = useState(defEnd);
  const [detailStaff, setDetailStaff] = useState<any>(null);
  const [payslipStaff, setPayslipStaff] = useState<any>(null);
  const [adjustDialog, setAdjustDialog] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ anchor: HTMLElement; row: any } | null>(null);
  const [branchFilter, setBranchFilter] = useState('');

  const extraParams = useMemo<Record<string, string> | undefined>(() => {
    const p: Record<string, string> = {};
    if (statusFilter) p.status = statusFilter;
    if (periodStart) p.period_start = periodStart;
    if (periodEnd) p.period_end = periodEnd;
    if (branchFilter) p.branch_filter = branchFilter;
    return Object.keys(p).length ? p : undefined;
  }, [statusFilter, periodStart, periodEnd, branchFilter]);

  const { items, total, loading, page, pageSize, sortBy, sortDir, setPage, setPageSize, onSortChange, setSearch, refetch } = usePaginated<any>('hr', 'list-payroll-staff', extraParams);

  const fetchDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const params: Record<string, string> = {};
      if (periodStart) params.period_start = periodStart;
      if (periodEnd) params.period_end = periodEnd;
      if (branchFilter) params.branch_filter = branchFilter;
      const res = await api<any>('hr', 'payroll-dashboard', { params });
      setDashboard(res);
    } catch {}
    finally { setDashLoading(false); }
  }, [periodStart, periodEnd, branchFilter]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const statusColor: Record<string, 'default' | 'warning' | 'info' | 'success'> = { draft: 'default', validated: 'info', pending_payout: 'warning', paid: 'success' };
  const fmt = (v: any) => `$${Number(v || 0).toFixed(2)}`;

  const handleValidate = async (staffRow: any) => {
    try {
      await api('hr', 'validate-payroll', {
        body: staffRow.latest_record_id
          ? { ids: [staffRow.latest_record_id] }
          : { staff_id: staffRow.staff_id, period_start: periodStart, period_end: periodEnd },
      });
      toast.success('Payroll validated');
      refetch(); fetchDashboard();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleIssuePayment = async (staffRow: any) => {
    if (!staffRow.latest_record_id) { toast.error('No payroll record'); return; }
    try {
      await api('hr', 'issue-payment', { body: { ids: [staffRow.latest_record_id] } });
      toast.success('Payment issued');
      refetch(); fetchDashboard();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSuspend = async (staffRow: any) => {
    try {
      await api('hr', 'suspend-payroll', { body: { staff_id: staffRow.staff_id } });
      toast.success('Staff suspended from payroll');
      refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRemove = async (staffRow: any) => {
    try {
      await api('hr', 'remove-from-payroll', { body: { staff_id: staffRow.staff_id } });
      toast.success('Staff removed from payroll');
      refetch(); fetchDashboard();
    } catch (err: any) { toast.error(err.message); }
  };

  const handlePayAll = async () => {
    try {
      const res = await api<{ count: number }>('hr', 'pay-all-validated', { body: {} });
      toast.success(`Paid ${res.count} staff`);
      refetch(); fetchDashboard();
    } catch (err: any) { toast.error(err.message); }
  };

  const columns: Column[] = [
    { id: 'staff', label: 'Full Name', render: (r) => (
      <Stack direction="row" spacing={1} alignItems="center">
        <Avatar src={r.staff?.avatar_url} sx={{ width: 28, height: 28 }}>{r.staff?.name?.[0]}</Avatar>
        <Box>
          <Typography variant="body2" fontWeight={500}>{r.staff?.name}</Typography>
          {r.staff_code && <Typography variant="caption" color="text.secondary">{r.staff_code}</Typography>}
        </Box>
      </Stack>
    )},
    { id: 'staff_code', label: 'Staff ID', render: (r) => r.staff_code || '—' },
    { id: 'station_name', label: 'Station', render: (r) => r.station_name || '—' },
    { id: 'salary_type', label: 'Pay Type', render: (r) => {
      if (r.salary_type === 'hourly') return `Hourly (${fmt(r.hourly_rate)}/hr)`;
      if (r.salary_type === 'daily') return `Daily (${fmt(r.hourly_rate || r.base_rate)}/day)`;
      return `Monthly (${fmt(r.base_rate)})`;
    }},
    { id: 'worked_hours', label: 'Hours / Days', render: (r) => `${r.worked_hours ?? 0}h / ${r.days_worked ?? 0}d` },
    { id: 'pending_validation_balance', label: 'Pending Balance', render: (r) => (
      <Typography fontWeight={600} color="warning.main">{fmt(r.pending_validation_balance)}</Typography>
    )},
    { id: 'total_paid', label: 'Total Paid', render: (r) => <Typography color="success.main">{fmt(r.total_paid)}</Typography> },
    { id: 'latest_status', label: 'Status', render: (r) => (
      <Stack direction="row" spacing={0.5} alignItems="center">
        {r.latest_status ? <Chip size="small" label={r.latest_status.replace('_', ' ')} color={statusColor[r.latest_status] ?? 'default'} /> : <Chip size="small" label="No record" variant="outlined" />}
        {r.payroll_suspended && <Chip size="small" label="Suspended" color="error" variant="outlined" />}
      </Stack>
    )},
    { id: 'actions', label: 'Actions', render: (r) => (
      <Tooltip title="Actions">
        <IconButton size="small" onClick={(e) => setActionMenu({ anchor: e.currentTarget, row: r })}>
          <AutorenewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    )},
  ];

  return (
    <>
      {/* Mini Dashboard */}
      {dashboard && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Total Staff</Typography>
              <Typography variant="h5" fontWeight={700}>{dashboard.total_staff}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Total Paid</Typography>
              <Typography variant="h5" fontWeight={700} color="success.main">{fmt(dashboard.total_paid)}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Pending Validation</Typography>
              <Typography variant="h5" fontWeight={700} color="warning.main">{fmt(dashboard.total_pending_validation)}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Tax Deductions</Typography>
              <Typography variant="h5" fontWeight={700} color="error.main">{fmt(dashboard.total_tax_deductions)}</Typography>
            </CardContent></Card>
          </Grid>
        </Grid>
      )}

      {/* Filters & Actions */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" alignItems="center">
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="draft">Pending Validation</MenuItem>
            <MenuItem value="validated">Validated</MenuItem>
            <MenuItem value="pending_payout">Pending Payout</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Branch Filter</InputLabel>
          <Select value={branchFilter} label="Branch Filter" onChange={(e) => setBranchFilter(e.target.value)}>
            <MenuItem value="">All Staff</MenuItem>
            <MenuItem value="__none__">Global (No Branch)</MenuItem>
          </Select>
        </FormControl>
        <TextField size="small" label="From" type="date" InputLabelProps={{ shrink: true }} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} sx={{ width: 160 }} />
        <TextField size="small" label="To" type="date" InputLabelProps={{ shrink: true }} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} sx={{ width: 160 }} />
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" size="small" onClick={() => setSettingsOpen(true)}>Pay Settings</Button>
        <Button variant="contained" color="success" startIcon={<PaymentIcon />} onClick={handlePayAll}>Pay All Validated</Button>
      </Stack>

      {/* Staff DataTable */}
      <DataTable
        columns={columns} rows={items} totalRows={total}
        page={page} pageSize={pageSize} loading={loading}
        sortBy={sortBy} sortDir={sortDir}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={onSortChange} searchable onSearchChange={setSearch}
        rowKey={(r) => r.staff_id}
      />

      {/* Per-staff Action Menu */}
      <Menu
        anchorEl={actionMenu?.anchor}
        open={!!actionMenu}
        onClose={() => setActionMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        {actionMenu?.row.pending_validation_balance > 0 && actionMenu?.row.latest_status !== 'validated' && actionMenu?.row.latest_status !== 'paid' && (
          <MenuItem onClick={() => { handleValidate(actionMenu!.row); setActionMenu(null); }}>
            <ListItemIcon><CheckCircleIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>Validate Payroll ({fmt(actionMenu!.row.pending_validation_balance)})</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { setPayslipStaff(actionMenu!.row); setActionMenu(null); }}>
          <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
          <ListItemText>View Payslip</ListItemText>
        </MenuItem>
        {actionMenu?.row.latest_status === 'validated' && (
          <MenuItem onClick={() => { handleIssuePayment(actionMenu!.row); setActionMenu(null); }}>
            <ListItemIcon><PaymentIcon fontSize="small" color="success" /></ListItemIcon>
            <ListItemText>Issue Payment</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { setAdjustDialog(actionMenu!.row); setActionMenu(null); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Adjust Pay</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { handleSuspend(actionMenu!.row); setActionMenu(null); }}>
          <ListItemIcon><PauseCircleIcon fontSize="small" color="warning" /></ListItemIcon>
          <ListItemText>Suspend Pay</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { handleRemove(actionMenu!.row); setActionMenu(null); }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Remove from Payroll</ListItemText>
        </MenuItem>
      </Menu>

      {/* Adjust Pay Dialog */}
      {adjustDialog && (
        <AdjustPayDialog staffId={adjustDialog.staff_id} staffName={adjustDialog.staff?.name} onClose={() => setAdjustDialog(null)} onSaved={() => { refetch(); fetchDashboard(); }} />
      )}

      {/* Payroll Settings Dialog */}
      <PayrollSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Payslip Drawer */}
      {payslipStaff && (
        <PayslipDrawer
          staffId={payslipStaff.staff_id}
          staffName={payslipStaff.staff?.name}
          periodStart={periodStart}
          periodEnd={periodEnd}
          onClose={() => setPayslipStaff(null)}
          onRefresh={() => { refetch(); fetchDashboard(); }}
        />
      )}

      {/* Detail Drawer (legacy — keep for deep dive) */}
      {detailStaff && (
        <PayrollDetailDrawer
          staffId={detailStaff.staff_id}
          staffName={detailStaff.staff?.name}
          periodStart={periodStart}
          periodEnd={periodEnd}
          onClose={() => setDetailStaff(null)}
          onRefresh={() => { refetch(); fetchDashboard(); }}
        />
      )}
    </>
  );
}

// --- Adjust Pay Dialog ---

function AdjustPayDialog({ staffId, staffName, onClose, onSaved }: {
  staffId: string; staffName: string; onClose: () => void; onSaved: () => void;
}) {
  const [type, setType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!amount || Number(amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await api('hr', 'adjust-pay', { body: { staff_id: staffId, adjustment_type: type, amount: Number(amount), reason } });
      toast.success('Adjustment saved');
      onSaved(); onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Adjust Pay — {staffName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Type</InputLabel>
            <Select value={type} label="Type" onChange={(e) => setType(e.target.value as 'credit' | 'debit')}>
              <MenuItem value="credit">Credit (Add to pay)</MenuItem>
              <MenuItem value="debit">Debit (Deduct from pay)</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Amount" type="number" fullWidth value={amount} onChange={(e) => setAmount(e.target.value)} />
          <TextField size="small" label="Reason" fullWidth multiline rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// --- Payslip Drawer (View / Print / Download) ---

function PayslipDrawer({ staffId, staffName, periodStart, periodEnd, onClose, onRefresh }: {
  staffId: string; staffName: string; periodStart?: string; periodEnd?: string;
  onClose: () => void; onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { staff_id: staffId };
      if (periodStart) params.period_start = periodStart;
      if (periodEnd) params.period_end = periodEnd;
      const res = await api<any>('hr', 'get-payroll-detail', { params });
      setDetail(res);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [staffId, periodStart, periodEnd]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const fmt = (v: any) => `$${Number(v || 0).toFixed(2)}`;
  const profile = detail?.profile;
  const breakdown = detail?.daily_breakdown ?? [];
  const adjustments = detail?.adjustments ?? [];
  const records = detail?.payroll_records ?? [];

  // Totals from daily breakdown
  const totals = useMemo(() => {
    let pay = 0, ot = 0, tax = 0, net = 0;
    for (const d of breakdown) { pay += d.daily_pay; ot += d.overtime_pay; tax += d.tax; net += d.net; }
    return { pay, ot, tax, net };
  }, [breakdown]);

  // Adjustment totals
  const adjTotal = useMemo(() => {
    let credit = 0, debit = 0;
    for (const a of adjustments) {
      if (a.adjustment_type === 'credit') credit += Number(a.amount);
      else debit += Number(a.amount);
    }
    return { credit, debit, net: credit - debit };
  }, [adjustments]);

  const handlePrint = () => {
    const el = document.getElementById('payslip-content');
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>Payslip - ${staffName}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:13px}th{background:#f5f5f5}h3{margin:16px 0 8px}.total{font-weight:bold;background:#f0f0f0}</style></head><body>`);
    win.document.write(el.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
  };

  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 700 }, p: 3 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={onClose}><ArrowBackIcon /></IconButton>
          <Typography variant="h6">Payslip — {staffName}</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<PrintIcon />} onClick={handlePrint}>Print</Button>
        </Stack>
      </Stack>

      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box> : detail && (
        <Box id="payslip-content">
          {/* Staff Info Header */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar src={profile?.profile?.avatar_url} sx={{ width: 48, height: 48 }}>{profile?.profile?.name?.[0]}</Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>{profile?.profile?.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{profile?.staff_code} · {profile?.station_name || 'No station'} · {profile?.salary_type}</Typography>
                </Box>
              </Stack>
              <Divider sx={{ my: 1 }} />
              <Grid container spacing={1}>
                <Grid size={{ xs: 3 }}><Typography variant="caption" color="text.secondary">Base Pay</Typography><Typography variant="body2">{fmt(profile?.base_pay)}</Typography></Grid>
                <Grid size={{ xs: 3 }}><Typography variant="caption" color="text.secondary">Hourly Rate</Typography><Typography variant="body2">{fmt(profile?.hourly_rate)}</Typography></Grid>
                <Grid size={{ xs: 3 }}><Typography variant="caption" color="text.secondary">OT Rate</Typography><Typography variant="body2">{fmt(profile?.overtime_rate)}</Typography></Grid>
                <Grid size={{ xs: 3 }}><Typography variant="caption" color="text.secondary">Tax %</Typography><Typography variant="body2">{profile?.tax_percentage ?? 0}%</Typography></Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Daily Breakdown Table */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Daily Breakdown ({periodStart} → {periodEnd})</Typography>
          {breakdown.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No attendance records for this period.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Clock In</TableCell>
                    <TableCell>Clock Out</TableCell>
                    <TableCell align="right">Hours</TableCell>
                    <TableCell align="right">OT Hrs</TableCell>
                    <TableCell align="right">Daily Pay</TableCell>
                    <TableCell align="right">OT Pay</TableCell>
                    <TableCell align="right">Tax</TableCell>
                    <TableCell align="right">Net</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {breakdown.map((d: any) => (
                    <TableRow key={d.date}>
                      <TableCell>{d.date}</TableCell>
                      <TableCell>{d.clock_in ? new Date(d.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                      <TableCell>{d.clock_out ? new Date(d.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                      <TableCell align="right">{d.hours.toFixed(1)}</TableCell>
                      <TableCell align="right">{d.overtime_hours > 0 ? d.overtime_hours.toFixed(1) : '—'}</TableCell>
                      <TableCell align="right">{fmt(d.daily_pay)}</TableCell>
                      <TableCell align="right">{d.overtime_pay > 0 ? fmt(d.overtime_pay) : '—'}</TableCell>
                      <TableCell align="right">{fmt(d.tax)}</TableCell>
                      <TableCell align="right"><Typography variant="body2" fontWeight={500}>{fmt(d.net)}</Typography></TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ '& td': { fontWeight: 700, bgcolor: 'action.hover' } }}>
                    <TableCell colSpan={5}>Totals</TableCell>
                    <TableCell align="right">{fmt(totals.pay)}</TableCell>
                    <TableCell align="right">{fmt(totals.ot)}</TableCell>
                    <TableCell align="right">{fmt(totals.tax)}</TableCell>
                    <TableCell align="right">{fmt(totals.net)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* HR Adjustments */}
          {adjustments.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>HR Adjustments</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Reason</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell>Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {adjustments.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell><Chip size="small" label={a.adjustment_type} color={a.adjustment_type === 'credit' ? 'success' : 'error'} /></TableCell>
                        <TableCell>{a.reason || '—'}</TableCell>
                        <TableCell align="right">{fmt(a.amount)}</TableCell>
                        <TableCell>{new Date(a.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ '& td': { fontWeight: 700, bgcolor: 'action.hover' } }}>
                      <TableCell colSpan={2}>Net Adjustment</TableCell>
                      <TableCell align="right" sx={{ color: adjTotal.net >= 0 ? 'success.main' : 'error.main' }}>{adjTotal.net >= 0 ? '+' : ''}{fmt(adjTotal.net)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {/* Payroll Records Summary */}
          {records.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Payroll Records</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Period</TableCell>
                      <TableCell align="right">Gross</TableCell>
                      <TableCell align="right">Tax</TableCell>
                      <TableCell align="right">Net</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {records.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.period_start} → {r.period_end}</TableCell>
                        <TableCell align="right">{fmt(r.gross_pay)}</TableCell>
                        <TableCell align="right">{fmt(r.tax)}</TableCell>
                        <TableCell align="right"><Typography fontWeight={600} variant="body2">{fmt(r.net_pay)}</Typography></TableCell>
                        <TableCell><Chip size="small" label={r.status?.replace('_', ' ')} color={{'draft':'default','validated':'info','pending_payout':'warning','paid':'success'}[r.status as string] as any ?? 'default'} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {/* Grand Total */}
          <Card variant="outlined" sx={{ bgcolor: 'action.hover' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Payslip Summary</Typography>
              <Grid container spacing={1}>
                <Grid size={{ xs: 3 }}><Typography variant="caption" color="text.secondary">Total Earnings</Typography><Typography variant="body1" fontWeight={700}>{fmt(totals.pay + totals.ot)}</Typography></Grid>
                <Grid size={{ xs: 3 }}><Typography variant="caption" color="text.secondary">Tax Deductions</Typography><Typography variant="body1" fontWeight={700} color="error.main">-{fmt(totals.tax)}</Typography></Grid>
                <Grid size={{ xs: 3 }}><Typography variant="caption" color="text.secondary">Adjustments</Typography><Typography variant="body1" fontWeight={700} color={adjTotal.net >= 0 ? 'success.main' : 'error.main'}>{adjTotal.net >= 0 ? '+' : ''}{fmt(adjTotal.net)}</Typography></Grid>
                <Grid size={{ xs: 3 }}><Typography variant="caption" color="text.secondary">Net Pay</Typography><Typography variant="h6" fontWeight={700} color="primary.main">{fmt(totals.net + adjTotal.net)}</Typography></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Box>
      )}
    </Drawer>
  );
}

// --- Payroll Detail Drawer ---

function PayrollDetailDrawer({ staffId, staffName, periodStart, periodEnd, onClose, onRefresh }: {
  staffId: string; staffName: string; periodStart?: string; periodEnd?: string;
  onClose: () => void; onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterStart, setFilterStart] = useState(periodStart || '');
  const [filterEnd, setFilterEnd] = useState(periodEnd || '');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { staff_id: staffId };
      if (filterStart) params.period_start = filterStart;
      if (filterEnd) params.period_end = filterEnd;
      const res = await api<any>('hr', 'get-payroll-detail', { params });
      setDetail(res);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [staffId, filterStart, filterEnd]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const fmt = (v: any) => `$${Number(v || 0).toFixed(2)}`;
  const profile = detail?.profile;
  const records = detail?.payroll_records ?? [];
  const pendingAmount = detail?.pending_amount ?? 0;

  const handleSuspend = async () => {
    try {
      await api('hr', 'suspend-payroll', { body: { staff_id: staffId } });
      toast.success('Staff suspended from payroll');
      fetchDetail(); onRefresh();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleUnsuspend = async () => {
    try {
      await api('hr', 'unsuspend-payroll', { body: { staff_id: staffId } });
      toast.success('Staff reinstated to payroll');
      fetchDetail(); onRefresh();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleValidateSingle = async (id: string) => {
    try {
      await api('hr', 'validate-payroll', { body: { ids: [id] } });
      toast.success('Validated'); fetchDetail(); onRefresh();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleIssuePaymentSingle = async (id: string) => {
    try {
      await api('hr', 'issue-payment', { body: { ids: [id] } });
      toast.success('Payment issued'); fetchDetail(); onRefresh();
    } catch (err: any) { toast.error(err.message); }
  };

  const statusColor: Record<string, 'default' | 'warning' | 'info' | 'success'> = { draft: 'default', validated: 'info', pending_payout: 'warning', paid: 'success' };

  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 560 }, p: 3 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={onClose}><ArrowBackIcon /></IconButton>
          <Typography variant="h6">Payroll — {staffName}</Typography>
        </Stack>
      </Stack>

      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box> : detail && (
        <Box>
          {/* Staff summary card */}
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar src={profile?.profile?.avatar_url} sx={{ width: 48, height: 48 }}>{profile?.profile?.name?.[0]}</Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>{profile?.profile?.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{profile?.staff_code} · {profile?.station_name || 'No station'}</Typography>
                </Box>
                {profile?.payroll_suspended && <Chip label="Suspended" color="error" size="small" />}
              </Stack>
              <Divider sx={{ my: 1.5 }} />
              <Grid container spacing={1}>
                <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Salary Type</Typography><Typography variant="body2">{profile?.salary_type}</Typography></Grid>
                <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Base Pay</Typography><Typography variant="body2">{fmt(profile?.base_pay)}</Typography></Grid>
                <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Hourly Rate</Typography><Typography variant="body2">{fmt(profile?.hourly_rate)}</Typography></Grid>
                <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Payout Method</Typography><Typography variant="body2">{profile?.payout_method || '—'}</Typography></Grid>
                <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Bank</Typography><Typography variant="body2">{profile?.bank_name || '—'}</Typography></Grid>
                <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Pending</Typography><Typography variant="body2" color="warning.main" fontWeight={600}>{fmt(pendingAmount)}</Typography></Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Period filter */}
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
            <TextField size="small" label="From" type="date" InputLabelProps={{ shrink: true }} value={filterStart} onChange={(e) => setFilterStart(e.target.value)} sx={{ width: 150 }} />
            <TextField size="small" label="To" type="date" InputLabelProps={{ shrink: true }} value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} sx={{ width: 150 }} />
            <Box sx={{ flex: 1 }} />
            {profile?.payroll_suspended ? (
              <Button size="small" variant="outlined" color="success" onClick={handleUnsuspend}>Reinstate</Button>
            ) : (
              <Button size="small" variant="outlined" color="error" startIcon={<PauseCircleIcon />} onClick={handleSuspend}>Suspend</Button>
            )}
          </Stack>

          {/* Payroll records list */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Payroll Records ({records.length})</Typography>
          {records.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No payroll records for this period.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Period</TableCell>
                    <TableCell align="right">Worked</TableCell>
                    <TableCell align="right">Base</TableCell>
                    <TableCell align="right">OT</TableCell>
                    <TableCell align="right">Gross</TableCell>
                    <TableCell align="right">Tax</TableCell>
                    <TableCell align="right">Net</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.period_start}<br />{r.period_end}</TableCell>
                      <TableCell align="right">{r.days_worked ?? '—'}d / {Number(r.total_worked_hours || 0).toFixed(1)}h</TableCell>
                      <TableCell align="right">{fmt(r.base_pay)}</TableCell>
                      <TableCell align="right">{fmt(r.overtime_pay)}</TableCell>
                      <TableCell align="right">{fmt(r.gross_pay)}</TableCell>
                      <TableCell align="right">{fmt(r.tax)}</TableCell>
                      <TableCell align="right"><Typography fontWeight={600} variant="body2">{fmt(r.net_pay)}</Typography></TableCell>
                      <TableCell><Chip size="small" label={r.status?.replace('_', ' ')} color={statusColor[r.status] ?? 'default'} /></TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          {r.status === 'draft' && (
                            <Tooltip title="Validate"><IconButton size="small" color="primary" onClick={() => handleValidateSingle(r.id)}><CheckCircleIcon fontSize="small" /></IconButton></Tooltip>
                          )}
                          {r.status === 'validated' && (
                            <Tooltip title="Issue Payment"><IconButton size="small" color="success" onClick={() => handleIssuePaymentSingle(r.id)}><PaymentIcon fontSize="small" /></IconButton></Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Breakdown summary from the most recent record */}
          {records.length > 0 && (
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Latest Period Breakdown</Typography>
                <Grid container spacing={1}>
                  <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Days Worked</Typography><Typography variant="body2">{records[0].days_worked ?? '—'}</Typography></Grid>
                  <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Days Off</Typography><Typography variant="body2">{records[0].days_off ?? '—'}</Typography></Grid>
                  <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Days Leave</Typography><Typography variant="body2">{records[0].days_leave ?? '—'}</Typography></Grid>
                  <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Hours Worked</Typography><Typography variant="body2">{Number(records[0].total_worked_hours || 0).toFixed(1)}</Typography></Grid>
                  <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Break Hours</Typography><Typography variant="body2">{Number(records[0].total_break_hours || 0).toFixed(1)}</Typography></Grid>
                  <Grid size={{ xs: 4 }}><Typography variant="caption" color="text.secondary">Allowances</Typography><Typography variant="body2">{fmt(records[0].allowances)}</Typography></Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Attendance summary */}
          {(detail.attendance?.length > 0) && (
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Attendance ({detail.attendance.length} records)</Typography>
                <TableContainer sx={{ maxHeight: 200 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Clock In</TableCell>
                        <TableCell>Clock Out</TableCell>
                        <TableCell align="right">Hours</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.attendance.map((a: any) => (
                        <TableRow key={a.id}>
                          <TableCell>{a.date}</TableCell>
                          <TableCell>{a.clock_in ? new Date(a.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                          <TableCell>{a.clock_out ? new Date(a.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                          <TableCell align="right">{Number(a.total_hours || 0).toFixed(1)}</TableCell>
                          <TableCell><Chip size="small" label={a.status} color={a.status === 'present' ? 'success' : a.status === 'absent' ? 'error' : 'warning'} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* Approved leaves */}
          {(detail.leaves?.length > 0) && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Approved Leaves</Typography>
                {detail.leaves.map((lv: any) => (
                  <Stack key={lv.id} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
                    <Typography variant="body2">{lv.leave_type?.name ?? 'Leave'} — {lv.start_date} → {lv.end_date}</Typography>
                    <Chip size="small" label={lv.leave_type?.is_paid ? 'Paid' : 'Unpaid'} color={lv.leave_type?.is_paid ? 'success' : 'default'} />
                  </Stack>
                ))}
              </CardContent>
            </Card>
          )}
        </Box>
      )}
    </Drawer>
  );
}

// --- Payroll Settings Dialog ---

function PayrollSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [payDay, setPayDay] = useState(25);
  const [autoPay, setAutoPay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>('hr', 'get-payroll-settings');
      if (res?.settings) {
        setPayDay(res.settings.pay_day ?? 25);
        setAutoPay(res.settings.auto_pay ?? false);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) fetchSettings(); }, [open, fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('hr', 'save-payroll-settings', { body: { pay_day: payDay, auto_pay: autoPay } });
      toast.success('Settings saved');
      onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Payroll Settings</DialogTitle>
      <DialogContent>
        {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box> : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Pay Day (1–28)" type="number" fullWidth value={payDay} onChange={(e) => setPayDay(Math.min(28, Math.max(1, Number(e.target.value))))}
              slotProps={{ htmlInput: { min: 1, max: 28 } }} />
            <FormControlLabel control={<Switch checked={autoPay} onChange={(e) => setAutoPay(e.target.checked)} />} label="Auto-pay on pay day" />
            <Typography variant="caption" color="text.secondary">
              When auto-pay is enabled, all validated staff will automatically be paid on the configured pay day each month.
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Restricted Payroll: My Payslip View ─────────────────────────────────────
function MyPayrollView() {
  const { profile } = useAuth();
  const now = new Date();
  const defStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defEnd = now.toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(defStart);
  const [periodEnd, setPeriodEnd] = useState(defEnd);
  const [payslipOpen, setPayslipOpen] = useState(false);
  const [payroll, setPayroll] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchMyPayroll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>('hr', 'my-payroll', { params: { period_start: periodStart, period_end: periodEnd } });
      setPayroll(res);
    } catch {}
    finally { setLoading(false); }
  }, [periodStart, periodEnd]);

  useEffect(() => { fetchMyPayroll(); }, [fetchMyPayroll]);

  const fmt = (v: any) => `$${Number(v || 0).toFixed(2)}`;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} alignItems="center">
        <TextField size="small" label="From" type="date" InputLabelProps={{ shrink: true }} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} sx={{ width: 160 }} />
        <TextField size="small" label="To" type="date" InputLabelProps={{ shrink: true }} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} sx={{ width: 160 }} />
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : !payroll ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No payroll information found.</Typography>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary">Hours Worked</Typography>
                <Typography variant="h5" fontWeight={700}>{payroll.worked_hours ?? 0}h</Typography>
              </CardContent></Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary">Pending Balance</Typography>
                <Typography variant="h5" fontWeight={700} color="warning.main">{fmt(payroll.pending_validation_balance)}</Typography>
              </CardContent></Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary">Total Paid</Typography>
                <Typography variant="h5" fontWeight={700} color="success.main">{fmt(payroll.total_paid)}</Typography>
              </CardContent></Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary">Status</Typography>
                <Typography variant="h6" fontWeight={700}>
                  <Chip size="small" label={payroll.latest_status?.replace('_', ' ') ?? 'No records'} color={payroll.latest_status === 'paid' ? 'success' : payroll.latest_status === 'validated' ? 'info' : 'default'} />
                </Typography>
              </CardContent></Card>
            </Grid>
          </Grid>

          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<VisibilityIcon />} onClick={() => setPayslipOpen(true)}>View Payslip</Button>
          </Stack>

          {payslipOpen && (
            <PayslipDrawer
              staffId={profile!.id}
              staffName={profile!.name}
              periodStart={periodStart}
              periodEnd={periodEnd}
              onClose={() => setPayslipOpen(false)}
              onRefresh={fetchMyPayroll}
            />
          )}
        </>
      )}
    </Box>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// Tab 5: Leave Management
// ═══════════════════════════════════════════════════════════════════════════

function LeaveManagementTab({ fullAccess }: { fullAccess: boolean }) {
  // Restricted: show only own leave requests, no types management
  if (!fullAccess) return <MyLeaveView />;

  const [subTab, setSubTab] = useState(0);
  return (
    <Box>
      <Tabs value={subTab} onChange={(_, v) => setSubTab(v)} sx={{ mb: 2 }}>
        <Tab label="Leave Requests" />
        <Tab label="Leave Types" />
      </Tabs>
      {subTab === 0 && <LeaveRequestsSubTab />}
      {subTab === 1 && <LeaveTypesSubTab />}
    </Box>
  );
}

// ── Restricted Leave: My Leave Requests ─────────────────────────────────────
function MyLeaveView() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchMyLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>('hr', 'my-leave-requests');
      setRequests(res.items ?? []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMyLeaves(); }, [fetchMyLeaves]);

  const statusColor: Record<string, 'warning' | 'success' | 'error'> = { pending: 'warning', approved: 'success', rejected: 'error' };

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setCreateOpen(true)}>Request Leave</Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>From</TableCell>
                <TableCell>To</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow><TableCell colSpan={5} align="center"><Typography variant="body2" color="text.secondary">No leave requests</Typography></TableCell></TableRow>
              ) : requests.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.leave_type?.name ?? '—'}</TableCell>
                  <TableCell>{r.start_date}</TableCell>
                  <TableCell>{r.end_date}</TableCell>
                  <TableCell>{r.reason || '—'}</TableCell>
                  <TableCell><Chip size="small" label={r.status} color={statusColor[r.status] ?? 'default'} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <MyLeaveRequestDialog open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchMyLeaves} />
    </Box>
  );
}

function MyLeaveRequestDialog({ open, onClose, onSaved }: any) {
  const { data: leaveTypes } = useApi<{ items: any[]; total: number }>('hr', 'list-leave-types');
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => { setForm({}); }, [open]);

  const handleSave = async () => {
    if (!form.leave_type_id || !form.start_date || !form.end_date) { toast.error('Fill all required fields'); return; }
    setSaving(true);
    try {
      await api('hr', 'my-request-leave', { body: form });
      toast.success('Leave request submitted'); onSaved(); onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Request Leave</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12 }}>
            <FormControl fullWidth size="small"><InputLabel>Leave Type</InputLabel>
              <Select value={form.leave_type_id ?? ''} label="Leave Type" onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
                {(leaveTypes?.items ?? []).filter((t: any) => t.is_active).map((t: any) => <MenuItem key={t.id} value={t.id}>{t.name} ({t.is_paid ? 'Paid' : 'Unpaid'}, max {t.max_days}d)</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Start Date" type="date" InputLabelProps={{ shrink: true }} value={form.start_date ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="End Date" type="date" InputLabelProps={{ shrink: true }} value={form.end_date ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Grid>
          <Grid size={{ xs: 12 }}><TextField fullWidth size="small" label="Reason" multiline rows={2} value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Submit'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function LeaveRequestsSubTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const extraParams = useMemo<Record<string, string> | undefined>(() => statusFilter ? { status: statusFilter } : undefined, [statusFilter]);
  const { items, total, loading, page, pageSize, sortBy, sortDir, setPage, setPageSize, onSortChange, setSearch, refetch } = usePaginated<any>('hr', 'list-leave-requests', extraParams);
  const [createOpen, setCreateOpen] = useState(false);

  const statusColor: Record<string, 'warning' | 'success' | 'error'> = { pending: 'warning', approved: 'success', rejected: 'error' };

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    try { await api('hr', 'review-leave', { body: { id, status } }); toast.success(`Leave ${status}`); refetch(); }
    catch (err: any) { toast.error(err.message); }
  };

  const columns: Column[] = [
    { id: 'staff', label: 'Staff', render: (r) => r.staff?.name ?? '—' },
    { id: 'leave_type', label: 'Type', render: (r) => r.leave_type?.name ?? '—' },
    { id: 'start_date', label: 'From', sortable: true },
    { id: 'end_date', label: 'To' },
    { id: 'days', label: 'Days', render: (r) => {
      const start = new Date(r.start_date);
      const end = new Date(r.end_date);
      return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }},
    { id: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
    { id: 'status', label: 'Status', render: (r) => <Chip size="small" label={r.status} color={statusColor[r.status] ?? 'default'} /> },
    { id: 'actions', label: '', render: (r) => r.status === 'pending' ? (
      <Stack direction="row" spacing={0.5}>
        <Tooltip title="Approve"><IconButton size="small" color="success" onClick={() => handleReview(r.id, 'approved')}><CheckCircleIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Reject"><IconButton size="small" color="error" onClick={() => handleReview(r.id, 'rejected')}><CancelIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>
    ) : r.reviewer?.name ? <Typography variant="caption" color="text.secondary">by {r.reviewer.name}</Typography> : null },
  ];

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      <DataTable
        columns={columns} rows={items} totalRows={total}
        page={page} pageSize={pageSize} loading={loading}
        sortBy={sortBy} sortDir={sortDir}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={onSortChange} searchable onSearchChange={setSearch}
        rowKey={(r) => r.id}
        toolbar={<Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setCreateOpen(true)}>Request Leave</Button>}
      />
      <LeaveRequestDialog open={createOpen} onClose={() => setCreateOpen(false)} onSaved={refetch} />
    </>
  );
}

function LeaveRequestDialog({ open, onClose, onSaved }: any) {
  const { data: staffList } = useApi<{ items: any[]; total: number }>('staff', 'list', { page: '1', page_size: '200' });
  const { data: leaveTypes } = useApi<{ items: any[]; total: number }>('hr', 'list-leave-types');
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => { setForm({}); }, [open]);

  const handleSave = async () => {
    if (!form.staff_id || !form.leave_type_id || !form.start_date || !form.end_date) { toast.error('Fill all required fields'); return; }
    setSaving(true);
    try {
      await api('hr', 'create-leave-request', { body: form });
      toast.success('Leave request created'); onSaved(); onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Request Leave</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12 }}>
            <FormControl fullWidth size="small"><InputLabel>Staff</InputLabel>
              <Select value={form.staff_id ?? ''} label="Staff" onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
                {(staffList?.items ?? []).map((s: any) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <FormControl fullWidth size="small"><InputLabel>Leave Type</InputLabel>
              <Select value={form.leave_type_id ?? ''} label="Leave Type" onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
                {(leaveTypes?.items ?? []).filter((t: any) => t.is_active).map((t: any) => <MenuItem key={t.id} value={t.id}>{t.name} ({t.is_paid ? 'Paid' : 'Unpaid'}, max {t.max_days}d)</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Start Date" type="date" InputLabelProps={{ shrink: true }} value={form.start_date ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="End Date" type="date" InputLabelProps={{ shrink: true }} value={form.end_date ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Grid>
          <Grid size={{ xs: 12 }}><TextField fullWidth size="small" label="Reason" multiline rows={2} value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Submitting…' : 'Submit'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function LeaveTypesSubTab() {
  const { data: leaveTypes, refetch } = useApi<{ items: any[] }>('hr', 'list-leave-types');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);

  const columns: Column[] = [
    { id: 'name', label: 'Name' },
    { id: 'max_days', label: 'Max Days' },
    { id: 'is_paid', label: 'Paid', render: (r) => r.is_paid ? <Chip size="small" label="Paid" color="success" /> : <Chip size="small" label="Unpaid" /> },
    { id: 'is_active', label: 'Active', render: (r) => r.is_active ? <Chip size="small" label="Active" color="success" /> : <Chip size="small" label="Inactive" /> },
    { id: 'actions', label: '', render: (r) => (
      <IconButton size="small" onClick={() => { setEditData(r); setDialogOpen(true); }}><EditIcon fontSize="small" /></IconButton>
    )},
  ];

  return (
    <>
      <DataTable
        columns={columns} rows={leaveTypes?.items ?? []} totalRows={leaveTypes?.items?.length ?? 0}
        page={0} pageSize={50} loading={!leaveTypes}
        rowKey={(r) => r.id}
        toolbar={<Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => { setEditData(null); setDialogOpen(true); }}>Add Leave Type</Button>}
      />
      <LeaveTypeDialog open={dialogOpen} onClose={() => setDialogOpen(false)} data={editData} onSaved={refetch} />
    </>
  );
}

function LeaveTypeDialog({ open, onClose, data, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (data) setForm({ ...data });
    else setForm({ name: '', max_days: 0, is_paid: true, is_active: true });
  }, [data, open]);

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api('hr', 'upsert-leave-type', { body: form });
      toast.success('Saved'); onSaved(); onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{data ? 'Edit Leave Type' : 'Add Leave Type'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12 }}><TextField fullWidth size="small" label="Name" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
          <Grid size={{ xs: 12 }}><TextField fullWidth size="small" label="Max Days" type="number" value={form.max_days ?? 0} onChange={(e) => setForm({ ...form, max_days: Number(e.target.value) })} /></Grid>
          <Grid size={{ xs: 6 }}>
            <FormControlLabel control={<Switch checked={form.is_paid ?? true} onChange={(e) => setForm({ ...form, is_paid: e.target.checked })} />} label="Paid Leave" />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <FormControlLabel control={<Switch checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Active" />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab 6: Performance & Disciplinary Records
// ═══════════════════════════════════════════════════════════════════════════

function PerformanceTab({ fullAccess }: { fullAccess: boolean }) {
  const [typeFilter, setTypeFilter] = useState('');
  const extraParams = useMemo<Record<string, string> | undefined>(() => typeFilter ? { record_type: typeFilter } : undefined, [typeFilter]);
  const { items, total, loading, page, pageSize, sortBy, sortDir, setPage, setPageSize, onSortChange, setSearch, refetch } = usePaginated<any>('hr', 'list-performance', extraParams);
  const [createOpen, setCreateOpen] = useState(false);

  const typeIcons: Record<string, React.ReactNode> = {
    commendation: <EmojiEventsIcon fontSize="small" color="success" />,
    warning: <WarningIcon fontSize="small" color="warning" />,
    complaint: <ReportIcon fontSize="small" color="error" />,
  };
  const typeColors: Record<string, 'success' | 'warning' | 'error'> = { commendation: 'success', warning: 'warning', complaint: 'error' };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this record?')) return;
    try { await api('hr', 'delete-performance', { body: { id } }); toast.success('Deleted'); refetch(); }
    catch (err: any) { toast.error(err.message); }
  };

  const columns: Column[] = [
    { id: 'staff', label: 'Staff', render: (r) => (
      <Stack direction="row" spacing={1} alignItems="center">
        <Avatar src={r.staff?.avatar_url} sx={{ width: 28, height: 28 }}>{r.staff?.name?.[0]}</Avatar>
        <Typography variant="body2">{r.staff?.name}</Typography>
      </Stack>
    )},
    { id: 'record_type', label: 'Type', render: (r) => (
      <Stack direction="row" spacing={0.5} alignItems="center">
        {typeIcons[r.record_type]}
        <Chip size="small" label={r.record_type} color={typeColors[r.record_type] ?? 'default'} />
      </Stack>
    )},
    { id: 'title', label: 'Title' },
    { id: 'record_date', label: 'Date', sortable: true },
    { id: 'recorder', label: 'Recorded By', render: (r) => r.recorder?.name ?? '—' },
    ...(fullAccess ? [{ id: 'actions', label: '', render: (r: any) => (
      <IconButton size="small" color="error" onClick={() => handleDelete(r.id)}><DeleteIcon fontSize="small" /></IconButton>
    )} as Column] : []),
  ];

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Type</InputLabel>
          <Select value={typeFilter} label="Type" onChange={(e) => setTypeFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="commendation">Commendation</MenuItem>
            <MenuItem value="warning">Warning</MenuItem>
            <MenuItem value="complaint">Complaint</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      <DataTable
        columns={columns} rows={items} totalRows={total}
        page={page} pageSize={pageSize} loading={loading}
        sortBy={sortBy} sortDir={sortDir}
        onPageChange={setPage} onPageSizeChange={setPageSize}
        onSortChange={onSortChange} searchable onSearchChange={setSearch}
        rowKey={(r) => r.id}
        toolbar={fullAccess ? <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setCreateOpen(true)}>Add Record</Button> : undefined}
      />
      {fullAccess && <PerformanceDialog open={createOpen} onClose={() => setCreateOpen(false)} onSaved={refetch} />}
    </>
  );
}

function PerformanceDialog({ open, onClose, onSaved }: any) {
  const { data: staffList } = useApi<{ items: any[]; total: number }>('staff', 'list', { page: '1', page_size: '200' });
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => { setForm({ record_type: 'commendation', record_date: new Date().toISOString().slice(0, 10) }); }, [open]);

  const handleSave = async () => {
    if (!form.staff_id || !form.title) { toast.error('Select staff and enter a title'); return; }
    setSaving(true);
    try {
      await api('hr', 'create-performance', { body: form });
      toast.success('Record created'); onSaved(); onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Performance / Disciplinary Record</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12 }}>
            <FormControl fullWidth size="small"><InputLabel>Staff</InputLabel>
              <Select value={form.staff_id ?? ''} label="Staff" onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
                {(staffList?.items ?? []).map((s: any) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <FormControl fullWidth size="small"><InputLabel>Type</InputLabel>
              <Select value={form.record_type ?? 'commendation'} label="Type" onChange={(e) => setForm({ ...form, record_type: e.target.value })}>
                <MenuItem value="commendation">Commendation</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="complaint">Complaint</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6 }}><TextField fullWidth size="small" label="Date" type="date" InputLabelProps={{ shrink: true }} value={form.record_date ?? ''} onChange={(e) => setForm({ ...form, record_date: e.target.value })} /></Grid>
          <Grid size={{ xs: 12 }}><TextField fullWidth size="small" label="Title" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Grid>
          <Grid size={{ xs: 12 }}><TextField fullWidth size="small" label="Description" multiline rows={3} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
