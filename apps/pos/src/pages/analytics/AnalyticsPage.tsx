import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Grid, Typography, Card, CardContent, Chip,
  Button, TextField, Select, MenuItem, FormControl, InputLabel,
  Stack, Divider, ToggleButtonGroup, ToggleButton, Skeleton,
  CircularProgress, Tooltip,
} from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { BarChart } from '@mui/x-charts/BarChart';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import BarChartIcon from '@mui/icons-material/BarChart';
import DownloadIcon from '@mui/icons-material/Download';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import PieChartIcon from '@mui/icons-material/PieChart';
import { formatCurrency } from '@paxrest/shared-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { api } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type Metric =
  | 'revenue'
  | 'cogs'
  | 'wastage'
  | 'staffing'
  | 'net_position'
  | 'sales_volume'
  | 'avg_transaction';

type Period = 'daily' | 'weekly' | 'monthly';
type ChartType = 'line' | 'bar';
type CompareBy = 'branch' | 'station';
type DatePreset = 'today' | '7days' | '30days' | '90days' | '1y' | 'custom';

interface TrendPoint { label: string; value: number; }
interface CompareEntity { entity_id: string; entity_label: string; value: number; }
interface LossItem { label: string; value: number; }

// ── Constants ─────────────────────────────────────────────────────────────────

const METRIC_OPTIONS: { value: Metric; label: string; isCurrency: boolean }[] = [
  { value: 'revenue',         label: 'Revenue',          isCurrency: true },
  { value: 'cogs',            label: 'COGS',             isCurrency: true },
  { value: 'wastage',         label: 'Wastage',          isCurrency: true },
  { value: 'staffing',        label: 'Staffing Cost',    isCurrency: true },
  { value: 'net_position',    label: 'Net Position',     isCurrency: true },
  { value: 'sales_volume',    label: 'Sales Volume',     isCurrency: false },
  { value: 'avg_transaction', label: 'Avg Transaction',  isCurrency: true },
];

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today',   label: 'Today' },
  { value: '7days',   label: 'Last 7 Days' },
  { value: '30days',  label: 'Last 30 Days' },
  { value: '90days',  label: 'Last 90 Days' },
  { value: '1y',      label: 'Last Year' },
  { value: 'custom',  label: 'Custom' },
];

const CHART_COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#c62828', '#00838f', '#f57f17'];

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const ago = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days + 1);
    return d.toISOString().slice(0, 10);
  };
  switch (preset) {
    case 'today':  return { from: to, to };
    case '7days':  return { from: ago(7), to };
    case '30days': return { from: ago(30), to };
    case '90days': return { from: ago(90), to };
    case '1y': {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      return { from: d.toISOString().slice(0, 10), to };
    }
    default: return { from: to, to };
  }
}

function formatBucketLabel(label: string, period: Period): string {
  if (period === 'monthly') {
    const [y, m] = label.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m) - 1]} ${y}`;
  }
  if (period === 'weekly') return label; // "2026-W05"
  // daily: "2026-03-09" → "Mar 9"
  const [, m, d] = label.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}`;
}

// ── Chart skeleton ────────────────────────────────────────────────────────────
function ChartSkeleton() {
  return <Skeleton variant="rounded" height={360} sx={{ mt: 1 }} />;
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyChart({ message }: { message?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 360 }}>
      <Typography color="text.secondary" variant="body2">{message ?? 'No data for the selected period'}</Typography>
    </Box>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export default function AnalyticsPage() {
  const { activeBranchId, company, activeBranch, branches, isGlobalStaff } = useAuth();
  const { currencyCode: currency } = useCurrency();
  const today = new Date().toISOString().slice(0, 10);

  // ── Trend state ──────────────────────────────────────────────────────────
  const [trendMetric,     setTrendMetric]     = useState<Metric>('revenue');
  const [trendPeriod,     setTrendPeriod]     = useState<Period>('daily');
  const [trendChartType,  setTrendChartType]  = useState<ChartType>('line');
  const [trendDatePreset, setTrendDatePreset] = useState<DatePreset>('30days');
  const [trendCustomFrom, setTrendCustomFrom] = useState('');
  const [trendCustomTo,   setTrendCustomTo]   = useState('');
  const [trendBranch,     setTrendBranch]     = useState<string>(isGlobalStaff ? '__all__' : (activeBranchId ?? ''));
  const [trendData,       setTrendData]       = useState<TrendPoint[]>([]);
  const [trendLoading,    setTrendLoading]    = useState(false);

  // ── Compare state ────────────────────────────────────────────────────────
  const [compareMetric,     setCompareMetric]     = useState<Metric>('revenue');
  const [compareBy,         setCompareBy]         = useState<CompareBy>('branch');
  const [compareDatePreset, setCompareDatePreset] = useState<DatePreset>('30days');
  const [compareCustomFrom, setCompareCustomFrom] = useState('');
  const [compareCustomTo,   setCompareCustomTo]   = useState('');
  const [compareBranch,     setCompareBranch]     = useState<string>(isGlobalStaff ? '__all__' : (activeBranchId ?? ''));
  const [compareData,       setCompareData]       = useState<CompareEntity[]>([]);
  const [compareLoading,    setCompareLoading]    = useState(false);

  // ── Loss breakdown state ─────────────────────────────────────────────────
  const [lossBranch,     setLossBranch]     = useState<string>(isGlobalStaff ? '__all__' : (activeBranchId ?? ''));
  const [lossDatePreset, setLossDatePreset] = useState<DatePreset>('30days');
  const [lossCustomFrom, setLossCustomFrom] = useState('');
  const [lossCustomTo,   setLossCustomTo]   = useState('');
  const [lossOverview,   setLossOverview]   = useState<LossItem[]>([]);
  const [lossByType,     setLossByType]     = useState<LossItem[]>([]);
  const [lossLoading,    setLossLoading]    = useState(false);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const resolveDates = useCallback((preset: DatePreset, customFrom: string, customTo: string) => {
    if (preset === 'custom') return { from: customFrom, to: customTo };
    return getDateRange(preset);
  }, []);

const { fmt: fmtCurrency } = useCurrency();
const fmt = useCallback((val: number, isCurrency: boolean) => {
  if (!isCurrency) return val.toLocaleString();
  return fmtCurrency(val);
}, [fmtCurrency]);

  // ── Trend fetch ──────────────────────────────────────────────────────────
  const fetchTrend = useCallback(async () => {
    const { from, to } = resolveDates(trendDatePreset, trendCustomFrom, trendCustomTo);
    if (!from || !to) return;
    setTrendLoading(true);
    try {
      const data = await api<{ points: TrendPoint[] }>('reports', 'analytics-trend', {
        params: { date_from: from, date_to: to, metric: trendMetric, period: trendPeriod },
        branchId: trendBranch || undefined,
      });
      setTrendData(data.points ?? []);
    } catch (err) {
      console.error('Trend fetch error:', err);
      setTrendData([]);
    } finally {
      setTrendLoading(false);
    }
  }, [trendMetric, trendPeriod, trendDatePreset, trendCustomFrom, trendCustomTo, trendBranch, resolveDates]);

  useEffect(() => { fetchTrend(); }, [fetchTrend]);

  // ── Compare fetch ────────────────────────────────────────────────────────
  const fetchCompare = useCallback(async () => {
    const { from, to } = resolveDates(compareDatePreset, compareCustomFrom, compareCustomTo);
    if (!from || !to) return;
    setCompareLoading(true);
    try {
      const data = await api<{ entities: CompareEntity[] }>('reports', 'analytics-compare', {
        params: { date_from: from, date_to: to, metric: compareMetric, compare_by: compareBy },
        branchId: compareBranch || undefined,
      });
      setCompareData(data.entities ?? []);
    } catch (err) {
      console.error('Compare fetch error:', err);
      setCompareData([]);
    } finally {
      setCompareLoading(false);
    }
  }, [compareMetric, compareBy, compareDatePreset, compareCustomFrom, compareCustomTo, compareBranch, resolveDates]);

  useEffect(() => { fetchCompare(); }, [fetchCompare]);

  // ── Loss breakdown fetch ─────────────────────────────────────────────────
  const fetchLoss = useCallback(async () => {
    const { from, to } = resolveDates(lossDatePreset, lossCustomFrom, lossCustomTo);
    if (!from || !to) return;
    setLossLoading(true);
    try {
      const data = await api<{ overview: LossItem[]; by_type: LossItem[] }>(
        'reports', 'analytics-loss-breakdown', {
          params: { date_from: from, date_to: to },
          branchId: lossBranch || undefined,
        });
      setLossOverview(data.overview ?? []);
      setLossByType(data.by_type ?? []);
    } catch (err) {
      console.error('Loss breakdown fetch error:', err);
      setLossOverview([]);
      setLossByType([]);
    } finally {
      setLossLoading(false);
    }
  }, [lossDatePreset, lossCustomFrom, lossCustomTo, lossBranch, resolveDates]);

  useEffect(() => { fetchLoss(); }, [fetchLoss]);

  // ── Chart download (simple CSV export) ──────────────────────────────────
  const downloadCSV = (rows: { label: string; value: number }[], filename: string) => {
    const lines = ['Label,Value', ...rows.map(r => `"${r.label}",${r.value}`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Metric info ───────────────────────────────────────────────────────────
  const trendMetricInfo  = METRIC_OPTIONS.find(m => m.value === trendMetric)!;
  const compareMetricInfo = METRIC_OPTIONS.find(m => m.value === compareMetric)!;

  // ── Trend chart data ──────────────────────────────────────────────────────
  const trendLabels = useMemo(() =>
    trendData.map(p => formatBucketLabel(p.label, trendPeriod)),
    [trendData, trendPeriod]);
  const trendValues = useMemo(() => trendData.map(p => p.value), [trendData]);

  const trendValueFmt = useCallback((v: number | null) => {
    if (v === null) return '';
    return fmt(v, trendMetricInfo.isCurrency);
  }, [fmt, trendMetricInfo]);

  const compareValueFmt = useCallback((v: number | null) => {
    if (v === null) return '';
    return fmt(v, compareMetricInfo.isCurrency);
  }, [fmt, compareMetricInfo]);

  // ── Date filter controls ──────────────────────────────────────────────────
  const renderDateFilter = (
    preset: DatePreset,
    setPreset: (v: DatePreset) => void,
    customFrom: string,
    setCustomFrom: (v: string) => void,
    customTo: string,
    setCustomTo: (v: string) => void,
  ) => (
    <>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>Date Range</InputLabel>
        <Select value={preset} onChange={e => setPreset(e.target.value as DatePreset)} label="Date Range">
          {DATE_PRESETS.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
        </Select>
      </FormControl>
      {preset === 'custom' && (
        <>
          <TextField size="small" type="date" label="From" value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
            sx={{ minWidth: 140 }} />
          <TextField size="small" type="date" label="To" value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today, min: customFrom || undefined } }}
            sx={{ minWidth: 140 }} />
        </>
      )}
    </>
  );

  // ── Branch filter control ─────────────────────────────────────────────────
  const renderBranchFilter = (branchVal: string, setBranchVal: (v: string) => void) => {
    if (!isGlobalStaff) return null;
    return (
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>Branch</InputLabel>
        <Select value={branchVal} onChange={e => setBranchVal(e.target.value)} label="Branch">
          <MenuItem value="__all__">All Branches</MenuItem>
          {branches.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
        </Select>
      </FormControl>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Analytics</Typography>

      {/* ────────────────────────────────────────────────────────────────────
          SECTION 1: TREND ANALYSIS
      ──────────────────────────────────────────────────────────────────── */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2.5 }}>
            <TrendingUpIcon color="primary" />
            <Typography variant="h6" fontWeight={600}>Trend Analysis</Typography>
          </Stack>

          {/* Controls row */}
          <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center" sx={{ mb: 2.5 }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Metric</InputLabel>
              <Select value={trendMetric} onChange={e => setTrendMetric(e.target.value as Metric)} label="Metric">
                {METRIC_OPTIONS.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Period</InputLabel>
              <Select value={trendPeriod} onChange={e => setTrendPeriod(e.target.value as Period)} label="Period">
                {PERIOD_OPTIONS.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
              </Select>
            </FormControl>

            {renderDateFilter(trendDatePreset, setTrendDatePreset, trendCustomFrom, setTrendCustomFrom, trendCustomTo, setTrendCustomTo)}
            {renderBranchFilter(trendBranch, setTrendBranch)}

            <ToggleButtonGroup
              size="small"
              value={trendChartType}
              exclusive
              onChange={(_, v) => v && setTrendChartType(v)}
              sx={{ ml: 'auto' }}
            >
              <ToggleButton value="line"><Tooltip title="Line chart"><ShowChartIcon fontSize="small" /></Tooltip></ToggleButton>
              <ToggleButton value="bar"><Tooltip title="Bar chart"><BarChartIcon fontSize="small" /></Tooltip></ToggleButton>
            </ToggleButtonGroup>

            <Tooltip title="Download CSV">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  disabled={trendLoading || trendData.length === 0}
                  onClick={() => downloadCSV(trendData, `trend_${trendMetric}`)}
                >CSV</Button>
              </span>
            </Tooltip>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {/* Chart */}
          {trendLoading ? (
            <ChartSkeleton />
          ) : trendData.length === 0 ? (
            <EmptyChart />
          ) : (
            trendChartType === 'line' ? (
              <LineChart
                height={360}
                series={[{
                  data: trendValues,
                  label: trendMetricInfo.label,
                  valueFormatter: trendValueFmt,
                  showMark: trendData.length <= 31,
                  color: trendMetric === 'net_position' ? '#2e7d32'
                    : trendMetric === 'wastage' ? '#c62828'
                    : '#1976d2',
                }]}
                xAxis={[{ data: trendLabels, scaleType: 'band' }]}
                yAxis={[{ valueFormatter: (v: number | null) => trendValueFmt(v) }]}
                grid={{ horizontal: true }}
                margin={{ left: 70, right: 20, top: 20, bottom: 40 }}
              />
            ) : (
              <BarChart
                height={360}
                series={[{
                  data: trendValues,
                  label: trendMetricInfo.label,
                  valueFormatter: trendValueFmt,
                  color: trendMetric === 'net_position' ? '#2e7d32'
                    : trendMetric === 'wastage' ? '#c62828'
                    : '#1976d2',
                }]}
                xAxis={[{ data: trendLabels, scaleType: 'band' }]}
                yAxis={[{ valueFormatter: (v: number | null) => trendValueFmt(v) }]}
                grid={{ horizontal: true }}
                borderRadius={4}
                margin={{ left: 70, right: 20, top: 20, bottom: 40 }}
              />
            )
          )}

          {/* Summary strip */}
          {!trendLoading && trendData.length > 0 && (() => {
            const total  = trendValues.reduce((a, b) => a + b, 0);
            const avg    = total / trendValues.length;
            const maxIdx = trendValues.indexOf(Math.max(...trendValues));
            const minIdx = trendValues.indexOf(Math.min(...trendValues));
            return (
              <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                {trendMetricInfo.isCurrency ? (
                  <><Chip size="small" label={`Total: ${fmt(total, true)}`} color="primary" variant="outlined" />
                  <Chip size="small" label={`Avg: ${fmt(avg, true)}`} variant="outlined" /></>
                ) : (
                  <><Chip size="small" label={`Total: ${total.toLocaleString()}`} color="primary" variant="outlined" />
                  <Chip size="small" label={`Avg: ${Math.round(avg).toLocaleString()}`} variant="outlined" /></>
                )}
                {trendValues.length > 1 && (
                  <><Chip size="small" label={`Peak: ${trendLabels[maxIdx]}`} color="success" variant="outlined" />
                  <Chip size="small" label={`Low: ${trendLabels[minIdx]}`} color="warning" variant="outlined" /></>
                )}
              </Stack>
            );
          })()}
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* ──────────────────────────────────────────────────────────────────
            SECTION 2: LOSS BREAKDOWN (left column on wide screens)
        ────────────────────────────────────────────────────────────────── */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2.5 }}>
                <PieChartIcon color="error" />
                <Typography variant="h6" fontWeight={600}>Loss Breakdown</Typography>
              </Stack>

              <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center" sx={{ mb: 2.5 }}>
                {renderDateFilter(lossDatePreset, setLossDatePreset, lossCustomFrom, setLossCustomFrom, lossCustomTo, setLossCustomTo)}
                {renderBranchFilter(lossBranch, setLossBranch)}
                <Tooltip title="Download CSV">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      disabled={lossLoading || lossOverview.length === 0}
                      onClick={() => downloadCSV(lossOverview, 'loss_breakdown')}
                    >CSV</Button>
                  </span>
                </Tooltip>
              </Stack>

              <Divider sx={{ mb: 2 }} />

              {lossLoading ? (
                <ChartSkeleton />
              ) : lossOverview.length === 0 ? (
                <EmptyChart message="No losses recorded in this period" />
              ) : (
                <>
                  <BarChart
                    layout="horizontal"
                    height={Math.max(200, lossOverview.length * 52 + 40)}
                    series={[{
                      data: lossOverview.map(i => i.value),
                      label: 'Value',
                      valueFormatter: (v) => fmt(v as number, true),
                      color: '#c62828',
                    }]}
                    yAxis={[{ data: lossOverview.map(i => i.label), scaleType: 'band' }]}
                    xAxis={[{ valueFormatter: (v: number | null) => fmt(v ?? 0, true) }]}
                    grid={{ vertical: true }}
                    borderRadius={4}
                    margin={{ left: 140, right: 30, top: 10, bottom: 30 }}
                  />

                  {/* Wastage by type sub-chart */}
                  {lossByType.length > 0 && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                        Wastage by Type
                      </Typography>
                      <BarChart
                        layout="horizontal"
                        height={Math.max(160, lossByType.length * 48 + 40)}
                        series={[{
                          data: lossByType.map(i => i.value),
                          label: 'Value',
                          valueFormatter: (v) => fmt(v as number, true),
                          color: '#ef6c00',
                        }]}
                        yAxis={[{ data: lossByType.map(i => i.label), scaleType: 'band' }]}
                        xAxis={[{ valueFormatter: (v: number | null) => fmt(v ?? 0, true) }]}
                        grid={{ vertical: true }}
                        borderRadius={4}
                        margin={{ left: 120, right: 30, top: 10, bottom: 30 }}
                      />
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 3: COMPARISON (right column on wide screens)
        ────────────────────────────────────────────────────────────────── */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2.5 }}>
                <CompareArrowsIcon color="secondary" />
                <Typography variant="h6" fontWeight={600}>Comparison</Typography>
              </Stack>

              <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center" sx={{ mb: 2.5 }}>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Metric</InputLabel>
                  <Select value={compareMetric} onChange={e => setCompareMetric(e.target.value as Metric)} label="Metric">
                    {METRIC_OPTIONS.filter(m => m.value !== 'staffing').map(m =>
                      <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                    )}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Compare By</InputLabel>
                  <Select value={compareBy} onChange={e => setCompareBy(e.target.value as CompareBy)} label="Compare By">
                    <MenuItem value="branch">Branch</MenuItem>
                    <MenuItem value="station">Station</MenuItem>
                  </Select>
                </FormControl>

                {renderDateFilter(compareDatePreset, setCompareDatePreset, compareCustomFrom, setCompareCustomFrom, compareCustomTo, setCompareCustomTo)}
                {compareBy === 'branch' && isGlobalStaff && (
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Branch</InputLabel>
                    <Select value={compareBranch} onChange={e => setCompareBranch(e.target.value)} label="Branch">
                      <MenuItem value="__all__">All Branches</MenuItem>
                      {branches.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}

                <Tooltip title="Download CSV">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      disabled={compareLoading || compareData.length === 0}
                      onClick={() => downloadCSV(compareData.map(e => ({ label: e.entity_label, value: e.value })), `compare_${compareMetric}_by_${compareBy}`)}
                    >CSV</Button>
                  </span>
                </Tooltip>
              </Stack>

              <Divider sx={{ mb: 2 }} />

              {compareLoading ? (
                <ChartSkeleton />
              ) : compareData.length === 0 ? (
                <EmptyChart />
              ) : (
                <>
                  <BarChart
                    height={Math.max(220, Math.min(compareData.length * 60 + 60, 480))}
                    series={[{
                      data: compareData.map(e => e.value),
                      label: compareMetricInfo.label,
                      valueFormatter: compareValueFmt,
                      color: compareMetric === 'wastage' ? '#c62828'
                        : compareMetric === 'net_position' ? '#2e7d32'
                        : '#1976d2',
                    }]}
                    xAxis={[{
                      data: compareData.map(e => e.entity_label),
                      scaleType: 'band',
                    }]}
                    yAxis={[{ valueFormatter: (v: number | null) => compareValueFmt(v) }]}
                    grid={{ horizontal: true }}
                    borderRadius={4}
                    margin={{ left: 70, right: 20, top: 20, bottom: 60 }}
                  />

                  {/* Top performers table */}
                  <Stack spacing={0.5} sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      {compareBy === 'branch' ? 'Branch' : 'Station'} ranking
                    </Typography>
                    {compareData
                      .slice()
                      .sort((a, b) => b.value - a.value)
                      .map((entity, i) => (
                        <Stack key={entity.entity_id} direction="row" justifyContent="space-between" alignItems="center"
                          sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: i === 0 ? 'action.hover' : 'transparent' }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 20 }}>#{i + 1}</Typography>
                            <Typography variant="body2">{entity.entity_label}</Typography>
                          </Stack>
                          <Typography variant="body2" fontWeight={600}>
                            {fmt(entity.value, compareMetricInfo.isCurrency)}
                          </Typography>
                        </Stack>
                      ))}
                  </Stack>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
