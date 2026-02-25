import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Paper, Typography, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import { TABLE_STATUS_COLORS } from '@paxrest/ui';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';
import { useRealtime } from '@/hooks';
import BranchGuard from '@/components/BranchGuard';
import toast from 'react-hot-toast';

interface TableData {
  id: string;
  table_number: number;
  name?: string;
  capacity: number;
  section?: string;
  status: string;
  current_order?: { id: string; order_number: number; total_amount: number };
}

interface LayoutSection {
  section: string;
  tables: TableData[];
  available: number;
  total: number;
}

export default function TablesPage() {
  return <BranchGuard><TablesContent /></BranchGuard>;
}

function TablesContent() {
  const { activeBranchId } = useAuth();
  const [layout, setLayout] = useState<LayoutSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(false);
  const [form, setForm] = useState<any>({ table_number: 1, name: '', capacity: 4, section: 'Main', status: 'available' });

  const fetchLayout = async () => {
    try {
      const data = await api<{ sections: LayoutSection[] }>('tables', 'layout', { branchId: activeBranchId! });
      setLayout(data.sections ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { if (activeBranchId) fetchLayout(); }, [activeBranchId]);

  useRealtime('tables', activeBranchId ? { column: 'branch_id', value: activeBranchId } : undefined, () => {
    fetchLayout();
  });

  const handleStatusChange = async (tableId: string, status: string) => {
    try {
      await api('tables', 'update-status', { body: { table_id: tableId, status }, branchId: activeBranchId! });
      toast.success(`Table updated to ${status}`);
      fetchLayout();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSaveTable = async () => {
    try {
      await api('tables', 'upsert', { body: form, branchId: activeBranchId! });
      toast.success('Table saved');
      setEditDialog(false);
      fetchLayout();
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {Object.entries(TABLE_STATUS_COLORS).map(([s, c]) => (
            <Chip key={s} size="small" label={s} sx={{ bgcolor: c, color: '#fff' }} />
          ))}
        </Box>
        <Button variant="contained" onClick={() => { setForm({ table_number: 1, name: '', capacity: 4, section: 'Main', status: 'available' }); setEditDialog(true); }}>
          Add Table
        </Button>
      </Box>

      {loading ? <Typography>Loading…</Typography> : layout.map((section) => (
        <Box key={section.section} sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {section.section}
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              {section.available}/{section.total} available
            </Typography>
          </Typography>
          <Grid container spacing={1.5}>
            {section.tables.map((table) => (
              <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={table.id}>
                <Paper
                  sx={{
                    p: 2, textAlign: 'center', borderRadius: 2, cursor: 'pointer',
                    border: '2px solid',
                    borderColor: TABLE_STATUS_COLORS[table.status] ?? '#9E9E9E',
                    bgcolor: `${TABLE_STATUS_COLORS[table.status] ?? '#9E9E9E'}15`,
                    '&:hover': { boxShadow: 2 },
                  }}
                >
                  <Typography variant="h6" fontWeight={700}>{table.name || `T${table.table_number}`}</Typography>
                  <Typography variant="caption" color="text.secondary">{table.capacity} seats</Typography>
                  <Chip
                    size="small" label={table.status.replace('_', ' ')}
                    sx={{ mt: 1, bgcolor: TABLE_STATUS_COLORS[table.status], color: '#fff', display: 'block' }}
                  />
                  {table.current_order && (
                    <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mt: 0.5 }}>
                      #{table.current_order.order_number}
                    </Typography>
                  )}
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {table.status === 'available' && (
                      <Chip size="small" label="Seat" variant="outlined" onClick={() => handleStatusChange(table.id, 'occupied')} />
                    )}
                    {table.status === 'occupied' && (
                      <Chip size="small" label="Dirty" variant="outlined" onClick={() => handleStatusChange(table.id, 'dirty')} />
                    )}
                    {table.status === 'dirty' && (
                      <Chip size="small" label="Clean" variant="outlined" color="success" onClick={() => handleStatusChange(table.id, 'available')} />
                    )}
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}

      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Table</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={6}><TextField fullWidth label="Number" type="number" value={form.table_number} onChange={(e) => setForm({ ...form, table_number: Number(e.target.value) })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></Grid>
            <Grid size={6}><TextField fullWidth label="Section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTable}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
