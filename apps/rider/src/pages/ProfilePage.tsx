import React, { useState } from 'react';
import {
  Container, Typography, Card, CardContent, Stack, TextField,
  Button, Avatar, Divider, CircularProgress,
} from '@mui/material';
import DeliveryDiningIcon from '@mui/icons-material/DeliveryDining';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { rider, user, signOut, refreshRider } = useAuth();
  const [phone, setPhone] = useState(rider?.phone ?? '');
  const [vehiclePlate, setVehiclePlate] = useState(rider?.vehicle_plate ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!rider) return;
    setSaving(true);
    try {
      const res = await api('/delivery/riders/' + rider.id, {
        method: 'PUT',
        body: JSON.stringify({ phone, vehicle_plate: vehiclePlate }),
      });
      if (res.error) throw new Error(res.error.message);
      await refreshRider();
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 2, pb: 10 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>Profile</Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack alignItems="center" spacing={1} mb={2}>
            <Avatar sx={{ width: 72, height: 72, bgcolor: 'primary.main' }}>
              <DeliveryDiningIcon sx={{ fontSize: 36 }} />
            </Avatar>
            <Typography variant="h6" fontWeight={600}>{rider?.full_name}</Typography>
            <Typography variant="body2" color="text.secondary">{user?.email}</Typography>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={2}>
            <TextField fullWidth label="Full Name" value={rider?.full_name ?? ''} disabled />
            <TextField fullWidth label="Vehicle Type" value={rider?.vehicle_type ?? ''} disabled />
            <TextField
              fullWidth label="Phone"
              value={phone} onChange={(e) => setPhone(e.target.value)}
            />
            <TextField
              fullWidth label="Vehicle Plate"
              value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)}
            />
            <Button
              variant="contained" fullWidth onClick={handleSave} disabled={saving}
              startIcon={saving ? <CircularProgress size={20} color="inherit" /> : undefined}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Button
        variant="outlined" color="error" fullWidth
        startIcon={<LogoutIcon />}
        onClick={signOut}
      >
        Sign Out
      </Button>
    </Container>
  );
}
