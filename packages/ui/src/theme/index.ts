import { createTheme, type ThemeOptions } from '@mui/material/styles';

/* ───────── Brand Palette (Stripe-inspired) ───────── */
const PRIMARY = '#635BFF';     // Indigo – Stripe accent
const SECONDARY = '#0A2540';   // Dark navy – enterprise feel
const ERROR = '#DF1B41';
const WARNING = '#F5A623';
const INFO = '#067DF7';
const SUCCESS = '#30B130';

/* Sidebar / header dark surface */
export const SHELL_BG = '#0A2540';
export const SHELL_BG_LIGHT = '#0F2F4F';

const baseTheme: ThemeOptions = {
  palette: {
    primary: { main: PRIMARY },
    secondary: { main: SECONDARY },
    error: { main: ERROR },
    warning: { main: WARNING },
    info: { main: INFO },
    success: { main: SUCCESS },
    background: {
      default: '#F6F9FC',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A1F36',
      secondary: '#697386',
    },
    divider: '#E3E8EE',
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 700, fontSize: '1.75rem', letterSpacing: '-0.02em', lineHeight: 1.3 },
    h2: { fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.01em', lineHeight: 1.35 },
    h3: { fontWeight: 600, fontSize: '1.25rem', letterSpacing: '-0.01em', lineHeight: 1.4 },
    h4: { fontWeight: 600, fontSize: '1.125rem', lineHeight: 1.4 },
    h5: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.5 },
    h6: { fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.5 },
    body1: { fontSize: '0.875rem', lineHeight: 1.57 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.57 },
    caption: { fontSize: '0.75rem', lineHeight: 1.5, color: '#697386' },
    button: { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem' },
    overline: { textTransform: 'uppercase', fontWeight: 600, fontSize: '0.6875rem', letterSpacing: '0.08em' },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6, padding: '6px 16px', fontSize: '0.8125rem' },
        sizeSmall: { padding: '4px 12px', fontSize: '0.75rem' },
        containedPrimary: { '&:hover': { backgroundColor: '#5851DB' } },
        outlined: { borderColor: '#E3E8EE', '&:hover': { borderColor: '#C1C9D2', backgroundColor: 'rgba(99,91,255,0.04)' } },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: '1px solid #E3E8EE', borderRadius: 8 },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 6, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E3E8EE' }, '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#C1C9D2' } },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 6, fontWeight: 500, fontSize: '0.75rem' } },
    },
    MuiTableHead: {
      styleOverrides: {
        root: { '& .MuiTableCell-head': { fontWeight: 600, fontSize: '0.75rem', color: '#697386', textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: '#F6F9FC' } },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: '#E3E8EE', fontSize: '0.8125rem', padding: '12px 16px' },
      },
    },
    MuiDialog: {
      defaultProps: { maxWidth: 'sm', fullWidth: true },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderBottom: 'none' } },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { borderRight: 'none' },
      },
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: 'none', fontWeight: 500, fontSize: '0.8125rem', minHeight: 40 } },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 2 },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 6, fontSize: '0.8125rem' } },
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { fontSize: '0.75rem', borderRadius: 4 } },
    },
  },
};

export const theme = createTheme(baseTheme);

/* ─── Dark variant for KDS ─── */
export const darkTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'dark',
    primary: { main: '#7A73FF' },
    secondary: { main: '#A3ACB9' },
    error: { main: '#EF5350' },
    warning: { main: '#FFA726' },
    info: { main: '#42A5F5' },
    success: { main: '#66BB6A' },
    background: {
      default: '#0A1929',
      paper: '#132F4C',
    },
    text: {
      primary: '#E7EBF0',
      secondary: '#A3ACB9',
    },
    divider: '#1E3A5F',
  },
});

/* ─── Status colour maps ─── */
export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: '#F5A623',
  confirmed: '#067DF7',
  preparing: '#8B5CF6',
  ready: '#30B130',
  out_for_delivery: '#0EA5E9',
  delivered: '#30B130',
  completed: '#30B130',
  cancelled: '#DF1B41',
  refunded: '#8792A2',
};

export const TABLE_STATUS_COLORS: Record<string, string> = {
  available: '#30B130',
  occupied: '#DF1B41',
  reserved: '#067DF7',
  dirty: '#F5A623',
  maintenance: '#8792A2',
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: '#F5A623',
  assigned: '#067DF7',
  picked_up: '#8B5CF6',
  en_route: '#0EA5E9',
  delivered: '#30B130',
  failed: '#DF1B41',
  returned: '#8792A2',
};
