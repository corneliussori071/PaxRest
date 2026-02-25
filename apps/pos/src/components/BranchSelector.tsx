import React from 'react';
import {
  FormControl, InputLabel, Select, MenuItem, Chip, Box, Typography,
} from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { useAuth } from '@/contexts/AuthContext';

interface BranchSelectorProps {
  /** Show "All Branches" option (for pages that support cross-branch queries) */
  showAll?: boolean;
  /** Compact mode for header bar */
  compact?: boolean;
  /** Custom label */
  label?: string;
  /** Override the value (default: activeBranchId from auth) */
  value?: string | null;
  /** Override the onChange (default: switchBranch from auth) */
  onChange?: (branchId: string | null) => void;
}

/**
 * Branch selector dropdown.
 * - Global staff see all company branches and can switch freely.
 * - Branch staff see only their assigned branch (read-only).
 */
export default function BranchSelector({
  showAll = false,
  compact = false,
  label = 'Branch',
  value,
  onChange,
}: BranchSelectorProps) {
  const { branches, activeBranchId, isGlobalStaff, switchBranch, profile } = useAuth();

  const currentValue = value !== undefined ? (value ?? '') : (activeBranchId ?? '');
  const handleChange = onChange ?? switchBranch;

  // Branch staff: show fixed chip
  if (!isGlobalStaff) {
    const branch = branches.find((b) => b.id === (profile?.branch_ids?.[0] ?? activeBranchId));
    return (
      <Chip
        icon={<StorefrontIcon />}
        label={branch?.name ?? 'My Branch'}
        color="primary"
        variant="outlined"
        size={compact ? 'small' : 'medium'}
      />
    );
  }

  // Global staff: dropdown
  if (compact) {
    return (
      <Select
        value={currentValue}
        onChange={(e) => handleChange(e.target.value || null)}
        size="small"
        displayEmpty
        sx={{ minWidth: 180, bgcolor: 'background.paper', borderRadius: 1 }}
        startAdornment={<StorefrontIcon sx={{ mr: 0.5, color: 'text.secondary' }} fontSize="small" />}
      >
        {showAll && <MenuItem value="">All Branches</MenuItem>}
        {!showAll && <MenuItem value="" disabled><em>Select a branch</em></MenuItem>}
        {branches.filter((b) => b.is_active).map((b) => (
          <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
        ))}
      </Select>
    );
  }

  return (
    <FormControl fullWidth size="small">
      <InputLabel>{label}</InputLabel>
      <Select
        value={currentValue}
        onChange={(e) => handleChange(e.target.value || null)}
        label={label}
        startAdornment={<StorefrontIcon sx={{ mr: 0.5, color: 'text.secondary' }} fontSize="small" />}
      >
        {showAll && <MenuItem value="">All Branches</MenuItem>}
        {!showAll && <MenuItem value="" disabled><em>Select a branch</em></MenuItem>}
        {branches.filter((b) => b.is_active).map((b) => (
          <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
