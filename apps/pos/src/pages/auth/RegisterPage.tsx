import React, { useState } from 'react';
import {
  Box, Card, CardContent, TextField, Button, Typography,
  Link, Alert, Stepper, Step, StepLabel,
} from '@mui/material';
import { useAuth } from '@/contexts/AuthContext';

const steps = ['Account', 'Business'];

export default function RegisterPage() {
  const { signUp } = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    fullName: '', companyName: '', phone: '',
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleNext = () => {
    if (step === 0) {
      if (!form.email || !form.password) return setError('Please fill all fields');
      if (form.password.length < 8) return setError('Password must be at least 8 characters');
      if (form.password !== form.confirmPassword) return setError('Passwords do not match');
      setError('');
      setStep(1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.companyName) {
      return setError('Please fill all fields');
    }
    setError('');
    setLoading(true);
    try {
      await signUp({
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        companyName: form.companyName,
        phone: form.phone || undefined,
      });
    } catch (err: any) {
      setError(err.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      bgcolor: 'background.default', p: 2,
    }}>
      <Card sx={{ maxWidth: 480, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant="h4" fontWeight={700} color="primary">Create Account</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              Set up your restaurant in minutes
            </Typography>
          </Box>

          <Stepper activeStep={step} sx={{ mb: 3 }}>
            {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
          </Stepper>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={step === 1 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
            {step === 0 && (
              <>
                <TextField fullWidth label="Email" type="email" required value={form.email} onChange={set('email')} sx={{ mb: 2 }} />
                <TextField fullWidth label="Password" type="password" required value={form.password} onChange={set('password')} sx={{ mb: 2 }} />
                <TextField fullWidth label="Confirm Password" type="password" required value={form.confirmPassword} onChange={set('confirmPassword')} sx={{ mb: 3 }} />
                <Button type="submit" fullWidth variant="contained" size="large">Next</Button>
              </>
            )}
            {step === 1 && (
              <>
                <TextField fullWidth label="Full Name" required value={form.fullName} onChange={set('fullName')} sx={{ mb: 2 }} />
                <TextField fullWidth label="Company / Restaurant Name" required value={form.companyName} onChange={set('companyName')} sx={{ mb: 2 }} />
                <TextField fullWidth label="Phone (optional)" value={form.phone} onChange={set('phone')} sx={{ mb: 2 }} />
                <Alert severity="info" sx={{ mb: 3 }}>You can add branches after registration from the Branches page.</Alert>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button variant="outlined" onClick={() => setStep(0)} sx={{ flex: 1 }}>Back</Button>
                  <Button type="submit" variant="contained" disabled={loading} sx={{ flex: 2 }}>
                    {loading ? 'Creating…' : 'Create Account'}
                  </Button>
                </Box>
              </>
            )}
          </form>

          <Typography variant="body2" color="text.secondary" textAlign="center" mt={3}>
            Already have an account?{' '}
            <Link href="/login" underline="hover" fontWeight={600}>Sign In</Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
