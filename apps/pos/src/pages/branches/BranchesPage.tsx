import React, { useState, useEffect } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Chip, IconButton,
  Menu, MenuItem, ListItemIcon, ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import { DataTable, type Column } from '@paxrest/ui';
import { usePaginated } from '@/hooks';
import { api } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import type { Branch } from '@paxrest/shared-types';

const emptyForm = {
  name: '', location: '', address: '', phone: '', email: '', timezone: 'UTC',
};

export default function BranchesPage() {
  const { refreshProfile } = useAuth();
  const {
    items, total, loading, page, pageSize, sortBy, sortDir,
    setPage, setPageSize, onSortChange, setSearch, refetch,
  } = usePaginated<Branch>('store', 'branches');

  const [dialog, setDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<Branch | null>(null);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const openCreate = () => {
    setForm(emptyForm);
    setEditId(null);
    setDialog(true);
  };

  const openEdit = (branch: Branch) => {
    setForm({
      name: branch.name,
      location: branch.location ?? '',
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      email: branch.email ?? '',
      timezone: branch.timezone ?? 'UTC',
    });
    setEditId(branch.id);
    setDialog(true);
    setMenuAnchor(null);
  };

  const handleSave = async () => {
    if (!form.name || !form.location) {
      toast.error('Name and location are required');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api('store', 'update-branch', {
          method: 'PUT',
          body: { id: editId, ...form },
        });
        toast.success('Branch updated');
      } else {
        await api('store', 'create-branch', {
          body: form,
        });
        toast.success('Branch created');
      }
      setDialog(false);
      refetch();
      refreshProfile();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (branch: Branch) => {
    setMenuAnchor(null);
    try {
      await api('store', 'update-branch', {
        method: 'PUT',
        body: { id: branch.id, is_active: !branch.is_active },
      });
      toast.success(branch.is_active ? 'Branch deactivated' : 'Branch activated');
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column[] = [
    { id: 'name', label: 'Name', sortable: true },
    { id: 'location', label: 'Location', sortable: true },
    { id: 'phone', label: 'Phone', width: 140 },
    { id: 'email', label: 'Email', width: 200 },
    {
      id: 'is_active', label: 'Status', width: 100,
      render: (r) => (
        <Chip
          size="small"
          label={r.is_active ? 'Active' : 'Inactive'}
          color={r.is_active ? 'success' : 'default'}
        />
      ),
    },
    {
      id: 'actions', label: '', width: 50,
      render: (r) => (
        <IconButton size="small" onClick={(e) => { setMenuRow(r); setMenuAnchor(e.currentTarget); }}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
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
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add Branch
          </Button>
        }
      />

      {/* Row actions menu */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => menuRow && openEdit(menuRow)}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => menuRow && handleToggleActive(menuRow)}>
          <ListItemIcon>
            {menuRow?.is_active ? <ToggleOffIcon fontSize="small" /> : <ToggleOnIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{menuRow?.is_active ? 'Deactivate' : 'Activate'}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Create / Edit dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit Branch' : 'Add Branch'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Branch Name" required value={form.name} onChange={set('name')} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Location" required value={form.location} onChange={set('location')} helperText="City, area or landmark" />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Address" value={form.address} onChange={set('address')} multiline rows={2} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Phone" value={form.phone} onChange={set('phone')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Email" type="email" value={form.email} onChange={set('email')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Timezone" value={form.timezone} onChange={set('timezone')} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
