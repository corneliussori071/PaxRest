import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent,
  Grid, Tabs, Tab, Switch, FormControlLabel, Divider,
} from '@mui/material';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Company" />
        <Tab label="Branch" />
        <Tab label="Profile" />
      </Tabs>
      {tab === 0 && <CompanySettings />}
      {tab === 1 && <BranchSettings />}
      {tab === 2 && <ProfileSettings />}
    </Box>
  );
}

function CompanySettings() {
  const { company, activeBranchId, activeBranch, refreshProfile } = useAuth();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name ?? '',
        phone: activeBranch?.phone ?? '',
        email: activeBranch?.email ?? '',
        address: activeBranch?.address ?? '',
        currency: activeBranch?.currency ?? company?.currency ?? 'USD',
        tax_rate: activeBranch?.tax_rate ?? 0,
        timezone: activeBranch?.timezone ?? 'UTC',
      });
    }
  }, [company, activeBranch]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('store', 'company', {
        body: {
          name: form.name,
          phone: form.phone,
          email: form.email,
          address: form.address,
          settings: { currency: form.currency, tax_rate: form.tax_rate, timezone: form.timezone },
        },
        branchId: activeBranchId!,
      });
      toast.success('Company updated');
      refreshProfile();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Card sx={{ maxWidth: 600 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Company Settings</Typography>
        <Grid container spacing={2}>
          <Grid size={12}><TextField fullWidth label="Company Name" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
          <Grid size={6}><TextField fullWidth label="Phone" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Grid>
          <Grid size={6}><TextField fullWidth label="Email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Grid>
          <Grid size={12}><TextField fullWidth label="Address" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Grid>
          <Grid size={4}><TextField fullWidth label="Currency" value={form.currency ?? ''} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></Grid>
          <Grid size={4}><TextField fullWidth label="Tax Rate (%)" type="number" value={form.tax_rate ?? 0} onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })} /></Grid>
          <Grid size={4}><TextField fullWidth label="Timezone" value={form.timezone ?? ''} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></Grid>
          <Grid size={12}><Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button></Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

function BranchSettings() {
  const { branches, activeBranchId, refreshProfile } = useAuth();
  const branch = branches.find((b) => b.id === activeBranchId);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (branch) {
      setForm({
        name: branch.name ?? '',
        phone: branch.phone ?? '',
        address: branch.address ?? '',
      });
    }
  }, [branch]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('store', 'branches', {
        body: { id: activeBranchId, ...form },
        branchId: activeBranchId!,
      });
      toast.success('Branch updated');
      refreshProfile();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Card sx={{ maxWidth: 600 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Branch Settings</Typography>
        <Grid container spacing={2}>
          <Grid size={12}><TextField fullWidth label="Branch Name" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
          <Grid size={6}><TextField fullWidth label="Phone" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Grid>
          <Grid size={12}><TextField fullWidth label="Address" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Grid>
          <Grid size={12}><Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button></Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

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
          <Grid size={12}><TextField fullWidth label="Full Name" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
          <Grid size={12}><TextField fullWidth label="Phone" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Grid>
          <Grid size={12}><TextField fullWidth label="Email" value={profile?.email ?? ''} disabled /></Grid>
          <Grid size={12}><Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button></Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
