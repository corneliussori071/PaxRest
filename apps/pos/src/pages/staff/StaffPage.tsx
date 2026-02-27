import React, { useState, useEffect } from 'react';
import {
  Box, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Chip, IconButton, Menu, MenuItem, ListItemIcon,
  ListItemText, Tabs, Tab, Typography, FormControlLabel, Checkbox,
  Grid, Divider, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { DataTable, type Column } from '@paxrest/ui';
import { usePaginated } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import toast from 'react-hot-toast';
import type { Permission, CompanyRole } from '@paxrest/shared-types';
import { canManageRole, DEFAULT_ROLE_PERMISSIONS } from '@paxrest/shared-utils';

const GLOBAL_ROLES: CompanyRole[] = ['owner', 'general_manager'];

// ─── Permission labels mapping ──────────────────────────────────────────────

const PERMISSION_LABELS: { key: Permission; label: string; group: string }[] = [
  { key: 'process_pos', label: 'POS Terminal', group: 'Operations' },
  { key: 'manage_orders', label: 'View & Manage Orders', group: 'Operations' },
  { key: 'manage_tables', label: 'Assign Tables', group: 'Operations' },
  // Kitchen Display — own heading with granular sub-permissions
  { key: 'view_kitchen', label: 'Access Kitchen Display', group: 'Kitchen Display' },
  { key: 'kitchen_orders', label: 'Pending Orders', group: 'Kitchen Display' },
  { key: 'kitchen_assignments', label: 'Assignments', group: 'Kitchen Display' },
  { key: 'kitchen_make_dish', label: 'Make a Dish', group: 'Kitchen Display' },
  { key: 'kitchen_available_meals', label: 'Available Meals', group: 'Kitchen Display' },
  { key: 'kitchen_completed', label: 'Completed', group: 'Kitchen Display' },
  { key: 'kitchen_ingredient_requests', label: 'Ingredient Requests', group: 'Kitchen Display' },
  // Bar — own heading with granular sub-permissions
  { key: 'view_bar', label: 'Access Bar', group: 'Bar' },
  { key: 'bar_create_order', label: 'Create Order', group: 'Bar' },
  { key: 'bar_pending_orders', label: 'Pending Orders', group: 'Bar' },
  { key: 'bar_pending_payment', label: 'Pending Payment', group: 'Bar' },
  { key: 'bar_request_items', label: 'Request for Items', group: 'Bar' },
  // Management
  { key: 'manage_menu', label: 'Manage Menu', group: 'Management' },
  { key: 'manage_inventory', label: 'Inventory', group: 'Management' },
  { key: 'manage_suppliers', label: 'Suppliers', group: 'Management' },
  { key: 'manage_branches', label: 'Manage Branches', group: 'Management' },
  { key: 'manage_delivery', label: 'Deliveries', group: 'Management' },
  { key: 'manage_shifts', label: 'Shifts & Cash', group: 'Management' },
  // Admin
  { key: 'manage_staff', label: 'Staff Management', group: 'Admin' },
  { key: 'view_reports', label: 'Access Reports', group: 'Admin' },
  { key: 'manage_settings', label: 'Store Settings', group: 'Admin' },
  { key: 'manage_loyalty', label: 'Loyalty Program', group: 'Admin' },
  { key: 'view_audit', label: 'Audit Log', group: 'Admin' },
];

const ALL_ROLES: { value: CompanyRole; label: string }[] = [
  { value: 'general_manager', label: 'General Manager' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'chef', label: 'Chef' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'shisha_attendant', label: 'Shisha Attendant' },
  { value: 'waiter', label: 'Waiter' },
  { value: 'rider', label: 'Rider' },
  { value: 'inventory_clerk', label: 'Inventory Clerk' },
  { value: 'custom', label: 'Custom' },
];

// ─── Page component ─────────────────────────────────────────────────────────

export default function StaffPage() {
  const { profile, branches } = useAuth();
  const {
    items, total, loading, page, pageSize, sortBy, sortDir,
    setPage, setPageSize, onSortChange, setSearch, refetch,
  } = usePaginated<any>('staff', 'list');

  // ─── Add Dialog state ─────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState(0); // 0 = Invite, 1 = Add Directly

  // Shared form fields
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyRole>('cashier');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>([]);

  // Direct-add extra fields
  const [directName, setDirectName] = useState('');
  const [directPhone, setDirectPhone] = useState('');
  const [directPassword, setDirectPassword] = useState('');

  const [saving, setSaving] = useState(false);

  // ─── Edit Dialog state ────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<any>(null);
  const [editRole, setEditRole] = useState<CompanyRole>('cashier');
  const [editPermissions, setEditPermissions] = useState<Permission[]>([]);
  const [editBranch, setEditBranch] = useState('');
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ─── Row actions menu ─────────────────────────────────────────────────
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<any>(null);

  // Auto-fill permissions when role changes (add dialog)
  useEffect(() => {
    if (role && role !== 'custom') {
      setPermissions(DEFAULT_ROLE_PERMISSIONS[role] ?? []);
    }
  }, [role]);

  // Auto-fill permissions when edit role changes
  useEffect(() => {
    if (editRole && editRole !== 'custom' && editOpen) {
      setEditPermissions(DEFAULT_ROLE_PERMISSIONS[editRole] ?? []);
    }
  }, [editRole]);

  // Filter roles the caller can assign
  const callerRole = profile?.role ?? 'custom';
  const assignableRoles = ALL_ROLES.filter((r) => canManageRole(callerRole as CompanyRole, r.value));

  const resetAddForm = () => {
    setEmail('');
    setRole('cashier');
    setSelectedBranch('');
    setPermissions(DEFAULT_ROLE_PERMISSIONS.cashier ?? []);
    setDirectName('');
    setDirectPhone('');
    setDirectPassword('');
    setAddTab(0);
  };

  const handleOpenAdd = () => {
    resetAddForm();
    setAddOpen(true);
  };

  // ─── Invite handler ───────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!email || !role) return toast.error('Email and role are required');
    setSaving(true);
    try {
      await api('staff', 'invite', {
        body: {
          email,
          role,
          permissions,
          branch_id: selectedBranch || undefined,
        },
      });
      toast.success('Invitation sent');
      setAddOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Direct-add handler ───────────────────────────────────────────────
  const handleDirectAdd = async () => {
    if (!email || !directName || !directPassword || !role) {
      return toast.error('All required fields must be filled');
    }
    if (directPassword.length < 8) return toast.error('Password must be at least 8 characters');
    setSaving(true);
    try {
      await api('staff', 'create-direct', {
        body: {
          email,
          password: directPassword,
          name: directName,
          phone: directPhone || undefined,
          role,
          permissions,
          branch_id: selectedBranch || undefined,
        },
      });
      toast.success('Staff member created');
      setAddOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Edit handler ────────────────────────────────────────────────────
  const openEdit = (staff: any) => {
    setEditStaff(staff);
    setEditRole(staff.role);
    setEditPermissions(staff.permissions ?? []);
    setEditBranch(staff.branch_ids?.[0] ?? '');
    setEditName(staff.name ?? '');
    setEditOpen(true);
    setMenuAnchor(null);
  };

  const handleEditSave = async () => {
    if (!editStaff) return;
    const isNowGlobal = GLOBAL_ROLES.includes(editRole);
    const wasGlobal = GLOBAL_ROLES.includes(editStaff.role);

    // Demotion to branch role requires a branch
    if (!isNowGlobal && !editBranch && wasGlobal) {
      return toast.error('A branch must be assigned when demoting to a branch role');
    }

    setEditSaving(true);
    try {
      await api('staff', 'update', {
        method: 'PUT',
        body: {
          id: editStaff.id,
          name: editName,
          role: editRole,
          permissions: editPermissions,
          // Global: clear branches; Branch: set the selected branch
          branch_ids: isNowGlobal ? [] : (editBranch ? [editBranch] : editStaff.branch_ids),
          active_branch_id: isNowGlobal ? null : (editBranch || editStaff.active_branch_id),
        },
      });
      toast.success('Staff updated');
      setEditOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Toggle active handler ────────────────────────────────────────────
  const handleToggleActive = async (staff: any) => {
    setMenuAnchor(null);
    try {
      await api('staff', 'deactivate', {
        body: { id: staff.id, activate: !staff.is_active },
      });
      toast.success(staff.is_active ? 'Staff deactivated' : 'Staff activated');
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // ─── Permission toggle helper ─────────────────────────────────────────
  const togglePermission = (
    perm: Permission,
    current: Permission[],
    setter: (p: Permission[]) => void,
  ) => {
    setter(
      current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm],
    );
  };

  // ─── Columns ──────────────────────────────────────────────────────────
  const columns: Column[] = [
    { id: 'name', label: 'Name', sortable: true },
    { id: 'email', label: 'Email', sortable: true },
    {
      id: 'role', label: 'Role', sortable: true, width: 160,
      render: (r) => (
        <Chip
          size="small"
          label={r.role?.replace(/_/g, ' ')}
          color={r.role === 'owner' ? 'primary' : r.role === 'general_manager' ? 'secondary' : 'default'}
          sx={{ textTransform: 'capitalize' }}
        />
      ),
    },
    {
      id: 'branch', label: 'Branch', width: 160,
      render: (r) => {
        if (!r.branch_ids?.length) return <Typography variant="body2" color="text.secondary">Global</Typography>;
        const b = branches.find((br: any) => br.id === r.branch_ids[0]);
        return <Typography variant="body2">{b?.name ?? 'Unknown'}</Typography>;
      },
    },
    {
      id: 'is_active', label: 'Status', width: 100,
      render: (r) => (
        <Chip size="small" label={r.is_active ? 'Active' : 'Inactive'} color={r.is_active ? 'success' : 'default'} />
      ),
    },
    {
      id: 'actions', label: '', width: 50,
      render: (r) =>
        r.id !== profile?.id ? (
          <IconButton size="small" onClick={(e) => { setMenuRow(r); setMenuAnchor(e.currentTarget); }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        ) : null,
    },
  ];

  // ─── Permission checkboxes builder ────────────────────────────────────
  const PermissionCheckboxes = ({
    current,
    onChange,
  }: { current: Permission[]; onChange: (cur: Permission[], perm: Permission) => void }) => {
    const groups = PERMISSION_LABELS.reduce((acc, p) => {
      (acc[p.group] ??= []).push(p);
      return acc;
    }, {} as Record<string, typeof PERMISSION_LABELS>);

    return (
      <Box sx={{ mt: 1 }}>
        {Object.entries(groups).map(([group, perms]) => (
          <Box key={group} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
              {group}
            </Typography>
            <Grid container spacing={0}>
              {perms.map((p) => (
                <Grid size={{ xs: 12, sm: 6 }} key={p.key}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={current.includes(p.key)}
                        onChange={() => onChange(current, p.key)}
                      />
                    }
                    label={<Typography variant="body2">{p.label}</Typography>}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
        ))}
      </Box>
    );
  };

  // ─── Role & Branch selector builder ───────────────────────────────────
  const RoleBranchSelectors = ({
    roleValue,
    onRoleChange,
    branchValue,
    onBranchChange,
  }: {
    roleValue: CompanyRole;
    onRoleChange: (v: CompanyRole) => void;
    branchValue: string;
    onBranchChange: (v: string) => void;
  }) => {
    const isGlobal = GLOBAL_ROLES.includes(roleValue);
    return (
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth select label="Role" required value={roleValue}
            onChange={(e) => {
              const newRole = e.target.value as CompanyRole;
              onRoleChange(newRole);
              // Auto-clear branch when switching to a global role
              if (GLOBAL_ROLES.includes(newRole)) onBranchChange('');
            }}
            slotProps={{ select: { native: true } }}
          >
            {assignableRoles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth select label={isGlobal ? 'Branch' : 'Branch'} value={isGlobal ? '' : branchValue}
            onChange={(e) => onBranchChange(e.target.value)}
            slotProps={{ select: { native: true } }}
            disabled={isGlobal}
            helperText={isGlobal ? 'Global staff are not tied to a branch' : 'Assign to a branch'}
          >
            <option value="">{isGlobal ? 'N/A — Global' : 'No branch (assign later)'}</option>
            {!isGlobal && branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </TextField>
        </Grid>
      </Grid>
    );
  };

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
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
            Add Staff
          </Button>
        }
      />

      {/* ─── Row actions menu ──────────────────────────────────────────── */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => menuRow && openEdit(menuRow)}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => menuRow && handleToggleActive(menuRow)}>
          <ListItemIcon>
            {menuRow?.is_active ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{menuRow?.is_active ? 'Deactivate' : 'Activate'}</ListItemText>
        </MenuItem>
      </Menu>

      {/* ─── Add Staff Dialog ──────────────────────────────────────────── */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Staff Member</DialogTitle>
        <DialogContent>
          <Tabs value={addTab} onChange={(_, v) => setAddTab(v)} sx={{ mb: 2 }}>
            <Tab label="Invite by Email" />
            <Tab label="Add Directly" />
          </Tabs>

          {addTab === 0 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                An invitation will be sent. The user can accept it to join your company.
              </Alert>
              <TextField
                fullWidth label="Email" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                sx={{ mb: 2 }}
              />
              <RoleBranchSelectors
                roleValue={role} onRoleChange={setRole}
                branchValue={selectedBranch} onBranchChange={setSelectedBranch}
              />
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={600}>Permissions</Typography>
              <PermissionCheckboxes
                current={permissions}
                onChange={(cur, perm) => togglePermission(perm, cur, setPermissions)}
              />
            </Box>
          )}

          {addTab === 1 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                Create the account directly. The staff member can sign in immediately.
              </Alert>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth label="Full Name" required
                    value={directName} onChange={(e) => setDirectName(e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth label="Phone"
                    value={directPhone} onChange={(e) => setDirectPhone(e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth label="Email" type="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth label="Password" type="password" required
                    value={directPassword} onChange={(e) => setDirectPassword(e.target.value)}
                    helperText="Min 8 characters"
                  />
                </Grid>
              </Grid>
              <RoleBranchSelectors
                roleValue={role} onRoleChange={setRole}
                branchValue={selectedBranch} onBranchChange={setSelectedBranch}
              />
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={600}>Permissions</Typography>
              <PermissionCheckboxes
                current={permissions}
                onChange={(cur, perm) => togglePermission(perm, cur, setPermissions)}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={addTab === 0 ? handleInvite : handleDirectAdd}
            disabled={saving}
          >
            {saving ? 'Saving…' : addTab === 0 ? 'Send Invite' : 'Create Staff'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Edit Staff Dialog ─────────────────────────────────────────── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Staff Member</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Name" value={editName}
            onChange={(e) => setEditName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <RoleBranchSelectors
            roleValue={editRole} onRoleChange={setEditRole}
            branchValue={editBranch} onBranchChange={setEditBranch}
          />
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" fontWeight={600}>Permissions</Typography>
          <PermissionCheckboxes
            current={editPermissions}
            onChange={(cur, perm) => togglePermission(perm, cur, setEditPermissions)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving}>
            {editSaving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
