import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Typography, Tabs, Tab, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ReceiptIcon from '@mui/icons-material/Receipt';
import DeliveryDiningIcon from '@mui/icons-material/DeliveryDining';
import WarningIcon from '@mui/icons-material/Warning';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { StatCard } from '@paxrest/ui';
import { formatCurrency } from '@paxrest/shared-utils';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/supabase';

export default function ReportsPage() {
  const { activeBranchId, company, activeBranch } = useAuth();
  const currency = activeBranch?.currency ?? company?.currency ?? 'USD';
  const [tab, setTab] = useState(0);
  const [dashboard, setDashboard] = useState<any>(null);
  const [report, setReport] = useState<any[]>([]);
  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    if (!activeBranchId) return;
    setLoadingDash(true);
    api('reports', 'dashboard', { branchId: activeBranchId })
      .then((data) => setDashboard(data))
      .catch(() => {})
      .finally(() => setLoadingDash(false));
  }, [activeBranchId]);

  const reportTypes = ['daily-sales', 'payment-breakdown', 'menu-performance', 'wastage-trends', 'rider-performance', 'loyalty-usage', 'shift-summary'];

  useEffect(() => {
    if (tab === 0 || !activeBranchId) return;
    const type = reportTypes[tab - 1];
    if (!type) return;
    setLoadingReport(true);
    api(`reports`, type, { branchId: activeBranchId })
      .then((data) => setReport(data.data ?? data.rows ?? []))
      .catch(() => setReport([]))
      .finally(() => setLoadingReport(false));
  }, [tab, activeBranchId]);

  return (
    <Box>
      {/* Dashboard Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            title="Today's Sales"
            value={formatCurrency(dashboard?.today_sales ?? 0, currency)}
            icon={<AttachMoneyIcon />}
            loading={loadingDash}
            color="#1B5E20"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            title="Today's Orders"
            value={dashboard?.today_orders ?? 0}
            icon={<ReceiptIcon />}
            loading={loadingDash}
            color="#0288D1"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            title="Active Deliveries"
            value={dashboard?.active_deliveries ?? 0}
            icon={<DeliveryDiningIcon />}
            loading={loadingDash}
            color="#FF6F00"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            title="Low Stock Items"
            value={dashboard?.low_stock_count ?? 0}
            icon={<WarningIcon />}
            loading={loadingDash}
            color="#D32F2F"
          />
        </Grid>
      </Grid>

      {/* Report Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab label="Dashboard" />
        <Tab label="Daily Sales" />
        <Tab label="Payments" />
        <Tab label="Menu Performance" />
        <Tab label="Wastage" />
        <Tab label="Riders" />
        <Tab label="Loyalty" />
        <Tab label="Shifts" />
      </Tabs>

      {tab === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Active Orders</Typography>
            <Typography variant="h3" fontWeight={700} color="primary">
              {dashboard?.active_orders ?? 0}
            </Typography>
            {dashboard?.current_shift && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Current shift opened at {new Date(dashboard.current_shift.opened_at).toLocaleTimeString()}
                  {' • '}{dashboard.current_shift.total_orders ?? 0} orders
                  {' • '}{formatCurrency(dashboard.current_shift.total_sales ?? 0, currency)} sales
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {tab > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {report.length > 0 && Object.keys(report[0]).map((key) => (
                  <TableCell key={key} sx={{ fontWeight: 700 }}>
                    {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingReport ? (
                <TableRow><TableCell colSpan={10}>Loading…</TableCell></TableRow>
              ) : report.length === 0 ? (
                <TableRow><TableCell colSpan={10}>No data</TableCell></TableRow>
              ) : report.map((row, i) => (
                <TableRow key={i}>
                  {Object.values(row).map((val: any, j) => (
                    <TableCell key={j}>{typeof val === 'number' ? val.toLocaleString() : String(val ?? '—')}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
