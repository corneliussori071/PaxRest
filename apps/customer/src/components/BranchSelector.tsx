'use client';
import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, Box, Typography, Button,
  Card, CardActionArea, CardContent, Skeleton, Stack, Chip,
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { publicApi } from '@/lib/supabase';
import { useCartStore } from '@/stores/cart';

interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
}

interface Company {
  id: string;
  name: string;
  currency: string;
  logo_url: string | null;
}

const COMPANY_SLUG = process.env.NEXT_PUBLIC_COMPANY_SLUG ?? '';

export default function BranchSelector() {
  const branchId = useCartStore((s) => s.branchId);
  const setBranch = useCartStore((s) => s.setBranch);

  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  // Open dialog when branch not yet chosen
  useEffect(() => {
    if (!branchId) {
      setOpen(true);
      fetchBranches();
    }
  }, [branchId]);

  const fetchBranches = async () => {
    if (!COMPANY_SLUG) {
      console.warn('NEXT_PUBLIC_COMPANY_SLUG is not set');
      return;
    }
    setLoading(true);
    try {
      const res = await publicApi<{ company: Company; branches: Branch[] }>(
        `/customer/branches?company_slug=${encodeURIComponent(COMPANY_SLUG)}`,
      );
      if (res.data) {
        setCompany(res.data.company);
        setBranches(res.data.branches);
        // Auto-select if only one branch
        if (res.data.branches.length === 1) {
          selectBranch(res.data.company.id, res.data.branches[0]);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const selectBranch = (companyId: string, branch: Branch) => {
    setSelecting(branch.id);
    setBranch(companyId, branch.id, branch.name);
    setOpen(false);
    setSelecting(null);
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      // Prevent closing without selecting
      onClose={() => {}}
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pt: 4, pb: 1, textAlign: 'center' }}>
        <StorefrontIcon color="primary" sx={{ fontSize: 48, display: 'block', mx: 'auto', mb: 1 }} />
        <Typography variant="h5" fontWeight={700}>
          {company?.name ?? 'Welcome!'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 3 }}>
          <LocationOnIcon color="action" fontSize="small" />
          <Typography variant="body1" color="text.secondary" textAlign="center">
            Which branch is closest to you?
            <br />
            <Typography component="span" variant="body2" color="text.disabled">
              Your order will be sent to the selected branch.
            </Typography>
          </Typography>
        </Box>

        {loading ? (
          <Stack spacing={1.5}>
            {[1, 2, 3].map((k) => <Skeleton key={k} variant="rounded" height={80} />)}
          </Stack>
        ) : branches.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
            No branches available. Please try again later.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {branches.map((branch) => (
              <Card
                key={branch.id}
                variant="outlined"
                sx={{
                  borderColor: selecting === branch.id ? 'primary.main' : 'divider',
                  borderWidth: selecting === branch.id ? 2 : 1,
                  transition: 'all 0.15s',
                  '&:hover': { borderColor: 'primary.main', boxShadow: 2 },
                }}
              >
                <CardActionArea
                  disabled={selecting !== null}
                  onClick={() => company && selectBranch(company.id, branch)}
                  sx={{ p: 0 }}
                >
                  <CardContent>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700}>
                          {branch.name}
                        </Typography>
                        {branch.address && (
                          <Typography variant="body2" color="text.secondary">
                            {branch.address}
                          </Typography>
                        )}
                        {branch.phone && (
                          <Typography variant="caption" color="text.disabled">
                            {branch.phone}
                          </Typography>
                        )}
                      </Box>
                      <Chip
                        label="Select"
                        color={selecting === branch.id ? 'primary' : 'default'}
                        variant={selecting === branch.id ? 'filled' : 'outlined'}
                        size="small"
                      />
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
