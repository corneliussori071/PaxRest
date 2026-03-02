import { createTheme } from '@mui/material/styles';

// ── Pax Hotel design tokens ──────────────────────────────────────────────────
const NAVY   = '#1C2B4A';
const GOLD   = '#C9973A';
const CREAM  = '#F8F6F0';
const WHITE  = '#FFFFFF';
const CHARCOAL = '#2C2C2C';
const TAUPE  = '#9A8F7E';

const hotelTheme = createTheme({
  palette: {
    mode: 'light',
    primary:   { main: NAVY,  contrastText: WHITE },
    secondary: { main: GOLD,  contrastText: WHITE },
    background: { default: CREAM, paper: WHITE },
    text: {
      primary:   CHARCOAL,
      secondary: TAUPE,
    },
    divider: '#E0DBD0',
  },
  typography: {
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    h1: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 700, letterSpacing: '-0.5px' },
    h2: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 700, letterSpacing: '-0.3px' },
    h3: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 600 },
    h4: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 600 },
    h5: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 600 },
    h6: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 600 },
    subtitle1: { fontWeight: 500, letterSpacing: '0.01em' },
    button: { textTransform: 'none', fontWeight: 500, letterSpacing: '0.04em' },
    overline: { letterSpacing: '0.12em', fontSize: '0.68rem' },
  },
  shape: { borderRadius: 4 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 3, padding: '10px 24px' },
        containedPrimary: {
          background: NAVY,
          '&:hover': { background: '#253559' },
        },
        containedSecondary: {
          background: GOLD,
          '&:hover': { background: '#B5852D' },
        },
        outlinedPrimary: {
          borderColor: NAVY,
          '&:hover': { background: `${NAVY}0A` },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: WHITE, color: CHARCOAL, boxShadow: '0 1px 0 #E0DBD0' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 12px rgba(28,43,74,0.06)',
          border: '1px solid #EDE8E0',
          '&:hover': { boxShadow: '0 4px 24px rgba(28,43,74,0.12)' },
          transition: 'box-shadow 0.25s ease',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 3, fontWeight: 500, fontSize: '0.75rem' },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: '#E0DBD0' } },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: CREAM,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        '::selection': { background: `${GOLD}33` },
      },
    },
  },
});

export default hotelTheme;
