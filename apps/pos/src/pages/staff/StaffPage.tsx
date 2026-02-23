import React, { useState } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Chip, Typography,
  Select, MenuItem, InputLabel, FormControl,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DataTable, type Column } from '@paxrest/ui';
import { usePaginated } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { SYSTEM_ROLES } from '@paxrest/shared-utils';

export default function StaffPage() {
  const { activeBranchId } = useAuth();
  const {
    items, total, loading, page, pageSize, sortBy, sortDir,
    setPage, setPageSize, onSortChange, setSearch, refetch,
  } = usePaginated<any>('staff', 'list');

  const [inviteDialog, setInviteDialog] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'cashier', branch_ids: [] as string[] });
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    setInviting(true);
    try {
      await api('staff', 'invite', {
        body: { ...inviteForm, branch_ids: inviteForm.branch_ids.length ? inviteForm.branch_ids : [activeBranchId] },
        branchId: activeBranchId!,
      });
      toast.success('Invitation sent');
      setInviteDialog(false);
    } catch (err: any) { toast.error(err.message); }
    finally { setInviting(false); }
  };

  const columns: Column[] = [
    { id: 'full_name', label: 'Name' },
    { id: 'email', label: 'Email' },
    { id: 'role', label: 'Role', render: (r) => (
      <Chip size="small" label={r.role?.replace('_', ' ')} color={r.role === 'owner' ? 'primary' : 'default'} />
    )},
    { id: 'is_active', label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No', width: 80 },
  ];

  return (
    <Box>
      <DataTable
        columns={columns}
        rows={items}
        totalRows={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        sortBy={sortBy}
        sortDir={sortDir}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSortChange={onSortChange}
        searchable
        onSearchChange={setSearch}
        rowKey={(r) => r.id}
        toolbar={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setInviteDialog(true)}>
            Invite Staff
          </Button>
        }
      />

      <Dialog open={inviteDialog} onClose={() => setInviteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Invite Staff Member</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Email" type="email" required
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth label="Role" select
            value={inviteForm.role}
            onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
            slotProps={{ select: { native: true } }}
          >
            {SYSTEM_ROLES.filter((r) => r !== 'owner').map((r) => (
              <option key={r} value={r}>{r.replace('_', ' ')}</option>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleInvite} disabled={inviting}>Send Invite</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
