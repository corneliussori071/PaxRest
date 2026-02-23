import { createTheme, type ThemeOptions } from '@mui/material/styles';

/* ───────── Brand Palette ───────── */
const PRIMARY = '#1B5E20';     // Deep green – restaurant / fresh
const SECONDARY = '#FF6F00';   // Amber / orange – warm, appetizing
const ERROR = '#D32F2F';
const WARNING = '#ED6C02';
const INFO = '#0288D1';
const SUCCESS = '#2E7D32';

const baseTheme: ThemeOptions = {
  palette: {
    primary: { main: PRIMARY },
    secondary: { main: SECONDARY },
    error: { main: ERROR },
    warning: { main: WARNING },
    info: { main: INFO },
    success: { main: SUCCESS },
    background: {
      default: '#F5F5F5',
      paper: '#FFFFFF',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, fontSize: '2rem' },
    h2: { fontWeight: 700, fontSize: '1.75rem' },
    h3: { fontWeight: 600, fontSize: '1.5rem' },
    h4: { fontWeight: 600, fontSize: '1.25rem' },
    h5: { fontWeight: 600, fontSize: '1.1rem' },
    h6: { fontWeight: 600, fontSize: '1rem' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, padding: '8px 20px' },
        containedPrimary: { '&:hover': { backgroundColor: '#2E7D32' } },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: '1px solid #E0E0E0', borderRadius: 12 },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 6, fontWeight: 500 } },
    },
    MuiTableHead: {
      styleOverrides: {
        root: { '& .MuiTableCell-head': { fontWeight: 700, backgroundColor: '#FAFAFA' } },
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
      styleOverrides: { root: { borderBottom: '1px solid #E0E0E0' } },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { borderRight: '1px solid #E0E0E0' },
      },
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } },
    },
  },
};

export const theme = createTheme(baseTheme);

/* ─── Dark variant for KDS ─── */
export const darkTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'dark',
    primary: { main: '#66BB6A' },
    secondary: { main: '#FFB74D' },
    error: { main: '#EF5350' },
    warning: { main: '#FFA726' },
    info: { main: '#42A5F5' },
    success: { main: '#66BB6A' },
    background: {
      default: '#121212',
      paper: '#1E1E1E',
    },
  },
});

/* ─── Status colour maps ─── */
export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: '#FFA726',
  confirmed: '#42A5F5',
  preparing: '#AB47BC',
  ready: '#66BB6A',
  out_for_delivery: '#29B6F6',
  delivered: '#2E7D32',
  completed: '#2E7D32',
  cancelled: '#EF5350',
  refunded: '#BDBDBD',
};

export const TABLE_STATUS_COLORS: Record<string, string> = {
  available: '#66BB6A',
  occupied: '#EF5350',
  reserved: '#42A5F5',
  dirty: '#FFA726',
  maintenance: '#BDBDBD',
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: '#FFA726',
  assigned: '#42A5F5',
  picked_up: '#AB47BC',
  en_route: '#29B6F6',
  delivered: '#66BB6A',
  failed: '#EF5350',
  returned: '#BDBDBD',
};
