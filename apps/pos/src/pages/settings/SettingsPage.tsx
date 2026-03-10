import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent,
  Grid, Tabs, Tab, Divider, Chip, CircularProgress,
  FormControl, InputLabel, Select, MenuItem,
  FormControlLabel, Checkbox,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PublicIcon from '@mui/icons-material/Public';
import SettingsIcon from '@mui/icons-material/Settings';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ─── Currency list (shared with paxventory) ─────────────────────────────────

const COMMON_CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'GBP', label: 'GBP — British Pound (£)' },
  { code: 'NGN', label: 'NGN — Nigerian Naira (₦)' },
  { code: 'KES', label: 'KES — Kenyan Shilling (KSh)' },
  { code: 'ZAR', label: 'ZAR — South African Rand (R)' },
  { code: 'GHS', label: 'GHS — Ghanaian Cedi (₵)' },
  { code: 'INR', label: 'INR — Indian Rupee (₹)' },
  { code: 'BRL', label: 'BRL — Brazilian Real (R$)' },
  { code: 'CAD', label: 'CAD — Canadian Dollar (C$)' },
  { code: 'AUD', label: 'AUD — Australian Dollar (A$)' },
  { code: 'JPY', label: 'JPY — Japanese Yen (¥)' },
  { code: 'CNY', label: 'CNY — Chinese Yuan (¥)' },
  { code: 'AED', label: 'AED — UAE Dirham (د.إ)' },
  { code: 'SAR', label: 'SAR — Saudi Riyal (﷼)' },
  { code: 'MXN', label: 'MXN — Mexican Peso ($)' },
  { code: 'TZS', label: 'TZS — Tanzanian Shilling (TSh)' },
  { code: 'UGX', label: 'UGX — Ugandan Shilling (USh)' },
  { code: 'RWF', label: 'RWF — Rwandan Franc (FRw)' },
  { code: 'ETB', label: 'ETB — Ethiopian Birr (Br)' },
  { code: 'XAF', label: 'XAF — CFA Franc (FCFA)' },
  { code: 'XOF', label: 'XOF — West African CFA (CFA)' },
  { code: 'PKR', label: 'PKR — Pakistani Rupee (₨)' },
  { code: 'BDT', label: 'BDT — Bangladeshi Taka (৳)' },
  { code: 'PHP', label: 'PHP — Philippine Peso (₱)' },
  { code: 'IDR', label: 'IDR — Indonesian Rupiah (Rp)' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit (RM)' },
  { code: 'THB', label: 'THB — Thai Baht (฿)' },
  { code: 'VND', label: 'VND — Vietnamese Dong (₫)' },
  { code: 'SGD', label: 'SGD — Singapore Dollar (S$)' },
  { code: 'KRW', label: 'KRW — South Korean Won (₩)' },
  { code: 'SEK', label: 'SEK — Swedish Krona (kr)' },
  { code: 'NOK', label: 'NOK — Norwegian Krone (kr)' },
  { code: 'DKK', label: 'DKK — Danish Krone (kr)' },
  { code: 'CHF', label: 'CHF — Swiss Franc (CHF)' },
  { code: 'PLN', label: 'PLN — Polish Zloty (zł)' },
  { code: 'TRY', label: 'TRY — Turkish Lira (₺)' },
  { code: 'EGP', label: 'EGP — Egyptian Pound (E£)' },
  { code: 'COP', label: 'COP — Colombian Peso ($)' },
  { code: 'ARS', label: 'ARS — Argentine Peso ($)' },
  { code: 'CLP', label: 'CLP — Chilean Peso ($)' },
  { code: 'ZMW', label: 'ZMW — Zambian Kwacha (ZK)' },
  { code: 'MZN', label: 'MZN — Mozambican Metical (MT)' },
  { code: 'ZWL', label: 'ZWL — Zimbabwean Dollar ($)' },
];

// ─── Major time zones ───────────────────────────────────────────────────────

const MAJOR_TIMEZONES = [
  { value: 'Pacific/Midway',       label: '(UTC-11:00) Midway Island' },
  { value: 'Pacific/Honolulu',     label: '(UTC-10:00) Hawaii' },
  { value: 'America/Anchorage',    label: '(UTC-09:00) Alaska' },
  { value: 'America/Los_Angeles',  label: '(UTC-08:00) Pacific Time (US)' },
  { value: 'America/Denver',       label: '(UTC-07:00) Mountain Time (US)' },
  { value: 'America/Chicago',      label: '(UTC-06:00) Central Time (US)' },
  { value: 'America/New_York',     label: '(UTC-05:00) Eastern Time (US)' },
  { value: 'America/Caracas',      label: '(UTC-04:30) Caracas' },
  { value: 'America/Halifax',      label: '(UTC-04:00) Atlantic Time (Canada)' },
  { value: 'America/Sao_Paulo',    label: '(UTC-03:00) São Paulo' },
  { value: 'America/Argentina/Buenos_Aires', label: '(UTC-03:00) Buenos Aires' },
  { value: 'Atlantic/Cape_Verde',  label: '(UTC-01:00) Cape Verde' },
  { value: 'UTC',                  label: '(UTC+00:00) UTC' },
  { value: 'Europe/London',        label: '(UTC+00:00) London' },
  { value: 'Africa/Casablanca',    label: '(UTC+00:00) Casablanca' },
  { value: 'Africa/Lagos',         label: '(UTC+01:00) Lagos, West Africa' },
  { value: 'Europe/Paris',         label: '(UTC+01:00) Paris, Berlin' },
  { value: 'Africa/Cairo',         label: '(UTC+02:00) Cairo' },
  { value: 'Africa/Johannesburg',  label: '(UTC+02:00) Johannesburg' },
  { value: 'Europe/Istanbul',      label: '(UTC+03:00) Istanbul' },
  { value: 'Africa/Nairobi',       label: '(UTC+03:00) Nairobi, East Africa' },
  { value: 'Asia/Riyadh',          label: '(UTC+03:00) Riyadh' },
  { value: 'Asia/Dubai',           label: '(UTC+04:00) Dubai' },
  { value: 'Asia/Karachi',         label: '(UTC+05:00) Karachi' },
  { value: 'Asia/Kolkata',         label: '(UTC+05:30) Mumbai, Kolkata' },
  { value: 'Asia/Dhaka',           label: '(UTC+06:00) Dhaka' },
  { value: 'Asia/Bangkok',         label: '(UTC+07:00) Bangkok, Jakarta' },
  { value: 'Asia/Shanghai',        label: '(UTC+08:00) Beijing, Shanghai' },
  { value: 'Asia/Singapore',       label: '(UTC+08:00) Singapore' },
  { value: 'Asia/Kuala_Lumpur',    label: '(UTC+08:00) Kuala Lumpur' },
  { value: 'Asia/Manila',          label: '(UTC+08:00) Manila' },
  { value: 'Asia/Tokyo',           label: '(UTC+09:00) Tokyo' },
  { value: 'Asia/Seoul',           label: '(UTC+09:00) Seoul' },
  { value: 'Australia/Sydney',     label: '(UTC+10:00) Sydney' },
  { value: 'Pacific/Auckland',     label: '(UTC+12:00) Auckland' },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const isGlobal = ['owner', 'general_manager'].includes(profile?.role ?? '');

  const [tab, setTab] = useState(0);

  // Determine available tabs based on role
  const tabs = [
    ...(isGlobal ? [{ label: 'Company', value: 0 }] : []),
    { label: 'Branch', value: isGlobal ? 1 : 0 },
    { label: 'Profile', value: isGlobal ? 2 : 1 },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <SettingsIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Settings</Typography>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        {tabs.map((t) => <Tab key={t.label} label={t.label} />)}
      </Tabs>

      {isGlobal ? (
        <>
          {tab === 0 && <CompanySettings />}
          {tab === 1 && <BranchSettings />}
          {tab === 2 && <ProfileSettings />}
        </>
      ) : (
        <>
          {tab === 0 && <BranchSettings />}
          {tab === 1 && <ProfileSettings />}
        </>
      )}
    </Box>
  );
}

// ─── Company Settings (Global Staff only) ───────────────────────────────────

function CompanySettings() {
  const { company, profile, refreshProfile } = useAuth();
  const isOwner = profile?.role === 'owner';

  const [form, setForm] = useState({ name: '', country: '' });
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [useCustomBaseCurrency, setUseCustomBaseCurrency] = useState(false);
  const [customBaseCurrency, setCustomBaseCurrency] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setForm({ name: company.name ?? '', country: company.country ?? '' });
      const cur = company.currency ?? 'USD';
      const isCustom = !COMMON_CURRENCIES.some((c) => c.code === cur);
      setUseCustomBaseCurrency(isCustom);
      if (isCustom) { setCustomBaseCurrency(cur); setBaseCurrency(''); }
      else { setBaseCurrency(cur); setCustomBaseCurrency(''); }
    }
  }, [company]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const effectiveCurrency = useCustomBaseCurrency
        ? customBaseCurrency.trim().toUpperCase()
        : baseCurrency;
      if (!effectiveCurrency) { toast.error('Please select a currency'); setSaving(false); return; }

      await api('store', 'company', {
        body: {
          name: form.name,
          country: form.country,
          ...(isOwner ? { currency: effectiveCurrency } : {}),
        },
        method: 'PUT',
      });
      toast.success('Company settings saved');
      refreshProfile();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Box sx={{ maxWidth: 700 }}>
      {/* ── Base Currency (Owner only) ── */}
      {isOwner && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <MonetizationOnIcon color="primary" />
              <Typography variant="h6">Base Currency</Typography>
              <Chip label="Owner Only" size="small" color="primary" variant="outlined" />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The base currency for your organisation. Global reports across all branches will be
              displayed in this currency. Each branch can still use its own local currency.
            </Typography>

            <FormControlLabel
              control={
                <Checkbox
                  checked={useCustomBaseCurrency}
                  onChange={(e) => setUseCustomBaseCurrency(e.target.checked)}
                  size="small"
                />
              }
              label="Use custom currency code"
              sx={{ mb: 2 }}
            />

            {useCustomBaseCurrency ? (
              <TextField
                fullWidth label="Custom Currency Code"
                value={customBaseCurrency}
                onChange={(e) => setCustomBaseCurrency(e.target.value.toUpperCase())}
                placeholder="e.g. BTC, GOLD"
                helperText="Enter a custom currency code"
              />
            ) : (
              <FormControl fullWidth>
                <InputLabel>Base Currency</InputLabel>
                <Select value={baseCurrency} label="Base Currency"
                  onChange={(e) => setBaseCurrency(e.target.value)}>
                  {COMMON_CURRENCIES.map((c) => (
                    <MenuItem key={c.code} value={c.code}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {(baseCurrency || customBaseCurrency) && (
              <Box sx={{ mt: 2 }}>
                <Chip
                  label={`Current: ${useCustomBaseCurrency ? customBaseCurrency : baseCurrency}`}
                  color="primary" size="small" icon={<MonetizationOnIcon />}
                />
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Company Info ── */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Company Information</Typography>
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField fullWidth label="Company Name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth label="Country" value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </Grid>
            <Grid size={12}>
              <Button variant="contained" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Company Settings'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}

// ─── Branch Settings ────────────────────────────────────────────────────────

function BranchSettings() {
  const { branches, activeBranchId, profile, isGlobalStaff, refreshProfile } = useAuth();
  const canManage = profile?.permissions?.includes('manage_branches') ?? false;

  const [selectedBranchId, setSelectedBranchId] = useState(activeBranchId ?? '');
  const branch = branches.find((b) => b.id === selectedBranchId);

  // Branch info
  const [form, setForm] = useState({ name: '', phone: '', address: '', email: '' });

  // Branch currency
  const [branchCurrency, setBranchCurrency] = useState('USD');
  const [useCustomCurrency, setUseCustomCurrency] = useState(false);
  const [customCurrency, setCustomCurrency] = useState('');

  // Branch timezone
  const [timezone, setTimezone] = useState('UTC');

  const [saving, setSaving] = useState(false);

  // Load branch data when branch changes
  const loadBranch = useCallback((b: any) => {
    if (!b) return;
    setForm({
      name: b.name ?? '',
      phone: b.phone ?? '',
      address: b.address ?? '',
      email: b.email ?? '',
    });
    const cur = b.currency ?? 'USD';
    const isCustom = !COMMON_CURRENCIES.some((c) => c.code === cur);
    setUseCustomCurrency(isCustom);
    if (isCustom) { setCustomCurrency(cur); setBranchCurrency(''); }
    else { setBranchCurrency(cur); setCustomCurrency(''); }
    setTimezone(b.timezone ?? 'UTC');
  }, []);

  useEffect(() => { loadBranch(branch); }, [branch?.id]);

  // If no branch selected yet, pick active
  useEffect(() => {
    if (!selectedBranchId && branches.length > 0) {
      setSelectedBranchId(activeBranchId ?? branches[0].id);
    }
  }, [branches, activeBranchId]);

  const handleSave = async () => {
    if (!selectedBranchId) return;
    setSaving(true);
    try {
      const effectiveCurrency = useCustomCurrency
        ? customCurrency.trim().toUpperCase()
        : branchCurrency;

      await api('store', 'branch', {
        body: {
          id: selectedBranchId,
          name: form.name,
          phone: form.phone,
          address: form.address,
          email: form.email,
          currency: effectiveCurrency,
          timezone,
        },
        method: 'PUT',
      });
      toast.success('Branch settings saved');
      refreshProfile();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Box sx={{ maxWidth: 700 }}>
      {/* ── Branch Selector (global staff only, when multiple branches) ── */}
      {isGlobalStaff && branches.length > 1 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <FormControl fullWidth>
              <InputLabel>Select Branch</InputLabel>
              <Select value={selectedBranchId} label="Select Branch"
                onChange={(e) => setSelectedBranchId(e.target.value)}>
                {branches.map((b) => (
                  <MenuItem key={b.id} value={b.id}>{b.name} — {b.location}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={3}>
        {/* ── Branch Currency ── */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <MonetizationOnIcon color="primary" />
                <Typography variant="h6">Branch Currency</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Set the currency used for pricing and local reports in this branch.
              </Typography>

              <FormControlLabel
                control={
                  <Checkbox checked={useCustomCurrency}
                    onChange={(e) => setUseCustomCurrency(e.target.checked)}
                    size="small" />
                }
                label="Use custom currency code" sx={{ mb: 2 }}
              />

              {useCustomCurrency ? (
                <TextField fullWidth label="Custom Currency Code"
                  value={customCurrency}
                  onChange={(e) => setCustomCurrency(e.target.value.toUpperCase())}
                  placeholder="e.g. BTC, GOLD"
                  helperText="Enter a custom currency code" />
              ) : (
                <FormControl fullWidth>
                  <InputLabel>Currency</InputLabel>
                  <Select value={branchCurrency} label="Currency"
                    onChange={(e) => setBranchCurrency(e.target.value)}>
                    {COMMON_CURRENCIES.map((c) => (
                      <MenuItem key={c.code} value={c.code}>{c.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {(branchCurrency || customCurrency) && (
                <Box sx={{ mt: 2 }}>
                  <Chip
                    label={`Current: ${useCustomCurrency ? customCurrency : branchCurrency}`}
                    color="primary" variant="outlined" size="small"
                  />
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ── Time Zone ── */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PublicIcon color="primary" />
                <Typography variant="h6">Time Zone</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                The time zone for this branch. Used for shift scheduling, reports, and order timestamps.
              </Typography>

              <FormControl fullWidth>
                <InputLabel>Time Zone</InputLabel>
                <Select value={timezone} label="Time Zone"
                  onChange={(e) => setTimezone(e.target.value)}
                  MenuProps={{ PaperProps: { sx: { maxHeight: 350 } } }}>
                  {MAJOR_TIMEZONES.map((tz) => (
                    <MenuItem key={tz.value} value={tz.value}>{tz.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ mt: 2 }}>
                <Chip label={`Current: ${timezone}`} variant="outlined" size="small" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Branch Info ── */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Branch Information</Typography>
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField fullWidth label="Branch Name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Phone" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth label="Address" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button variant="contained"
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          onClick={handleSave} disabled={saving || !canManage}>
          {saving ? 'Saving…' : 'Save Branch Settings'}
        </Button>
        {!canManage && (
          <Typography variant="body2" color="text.secondary">
            You don't have permission to modify branch settings.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ─── Profile Settings ───────────────────────────────────────────────────────

function ProfileSettings() {
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({ name: profile.name ?? '', phone: profile.phone ?? '' });
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('auth', 'update-profile', { body: form });
      toast.success('Profile updated');
      refreshProfile();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Card sx={{ maxWidth: 600 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>My Profile</Typography>
        <Grid container spacing={2}>
          <Grid size={12}>
            <TextField fullWidth label="Full Name" value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Grid>
          <Grid size={12}>
            <TextField fullWidth label="Phone" value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Grid>
          <Grid size={12}>
            <TextField fullWidth label="Email" value={profile?.email ?? ''} disabled />
          </Grid>
          <Grid size={12}>
            <Button variant="contained"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
              onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Profile'}
            </Button>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
