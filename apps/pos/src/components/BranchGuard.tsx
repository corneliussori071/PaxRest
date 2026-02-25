import React from 'react';
import { Box, Typography, Paper, Alert, AlertTitle } from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { useAuth } from '@/contexts/AuthContext';
import BranchSelector from './BranchSelector';

/**
 * BranchGuard wraps pages that require a specific branch to be selected.
 * - Branch staff: always pass through (they always have a branch).
 * - Global staff: if no branch is selected, show a prompt to pick one.
 *
 * Usage: wrap any branch-scoped page content with <BranchGuard>...</BranchGuard>
 */
export default function BranchGuard({ children }: { children: React.ReactNode }) {
  const { isGlobalStaff, hasBranchSelected, branches } = useAuth();

  // Branch staff always have a branch → pass through
  if (!isGlobalStaff) return <>{children}</>;

  // Global staff with no branches at all → prompt to create
  if (branches.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Paper sx={{ p: 4, maxWidth: 480, textAlign: 'center' }}>
          <StorefrontIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h5" gutterBottom>No Branches Yet</Typography>
          <Alert severity="info" sx={{ textAlign: 'left', mt: 2 }}>
            <AlertTitle>Create Your First Branch</AlertTitle>
            <Typography variant="body2">
              Go to <strong>Branches</strong> in the navigation menu and click
              <strong> "Add Branch"</strong>. You need at least one branch before you
              can manage inventory, menus, orders, and other branch-specific operations.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Each branch represents a physical location of your restaurant. You can
              create multiple branches and switch between them at any time.
            </Typography>
          </Alert>
        </Paper>
      </Box>
    );
  }

  // Global staff with branches but none selected → prompt to pick
  if (!hasBranchSelected) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Paper sx={{ p: 4, maxWidth: 480, textAlign: 'center' }}>
          <StorefrontIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>Select a Branch</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            As a global staff member, you need to select a branch to view
            and manage its operations.
          </Typography>
          <BranchSelector label="Choose Branch" />
        </Paper>
      </Box>
    );
  }

  // Branch selected → render children
  return <>{children}</>;
}
