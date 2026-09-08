import { createTheme } from '@mui/material/styles';

// MUI augmentColor (lighten/darken) requires concrete hex values — CSS vars not supported.
// These match the dark-mode tokens in src/index.css.
const HEX = {
  primary: '#f5a524',       // --color-primary dark  (amber)
  accent:  '#2dd4bf',       // --color-accent dark   (teal)
  secondary: '#1e2a44',     // --color-secondary dark (approx oklch(0.25 0.06 244))
  destructive: '#ef4444',   // --color-destructive dark
  chart5: '#34d399',        // --chart-5 dark (green)
  foreground: '#f5f1e8',    // --color-foreground dark
  mutedFg: '#c8c3b6',       // --color-muted-foreground dark
  background: '#111827',    // --color-background dark (approx oklch(0.15 0.038 252))
  border: 'rgba(250,246,232,0.14)', // --color-border dark
} as const;

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: 'var(--color-background)',
      paper: 'var(--color-card)',
    },
    text: {
      primary: HEX.foreground,
      secondary: HEX.mutedFg,
    },
    primary: {
      main: HEX.primary,
      contrastText: '#0d0d0d',
    },
    secondary: {
      main: HEX.secondary,
    },
    error: {
      main: HEX.destructive,
    },
    warning: {
      main: HEX.primary,
    },
    info: {
      main: HEX.accent,
    },
    success: {
      main: HEX.chart5,
    },
    divider: HEX.border,
  },
  typography: {
    fontFamily: 'var(--font-body)',
    h1: { fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.03em' },
    h2: { fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.025em' },
    h3: { fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.02em' },
    h4: { fontFamily: 'var(--font-display)', fontWeight: 600 },
    h5: { fontFamily: 'var(--font-display)', fontWeight: 600 },
    h6: { fontFamily: 'var(--font-display)', fontWeight: 600 },
    button: { fontFamily: 'var(--font-body)', textTransform: 'none' },
    overline: {
      fontFamily: 'var(--font-mono)',
      letterSpacing: '.14em',
      textTransform: 'uppercase',
    },
    caption: { fontFamily: 'var(--font-mono)', letterSpacing: '.06em' },
  },
  shape: {
    borderRadius: 14,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: 'var(--color-background)',
          color: 'var(--color-foreground)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundColor: 'var(--color-card)',
          backgroundImage: 'none',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--color-border)',
          boxShadow:
            '0 18px 48px -24px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          backdropFilter: 'blur(12px)',
          boxShadow:
            '0 24px 60px -28px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        },
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          '&.Mui-focusVisible': {
            outline: '3px solid var(--color-ring)',
            outlineOffset: 2,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 999,
          fontWeight: 600,
          paddingInline: 18,
          transition: 'transform .2s ease, box-shadow .2s ease',
          '&:hover': {
            transform: 'translateY(-1px)',
          },
          '&:focus-visible': {
            outline: '3px solid var(--color-ring)',
            outlineOffset: 2,
          },
        },
        containedPrimary: {
          backgroundImage: 'none',
          backgroundColor: 'var(--color-primary)',
          color: '#0d0d0d',
          boxShadow: '0 8px 24px -10px var(--color-primary)',
          '&:hover': {
            backgroundColor: 'var(--color-primary)',
            filter: 'brightness(1.12)',
          },
          '&.Mui-disabled': {
            backgroundImage: 'none',
          },
        },
        outlined: {
          borderColor: 'var(--color-border)',
          color: 'var(--color-foreground)',
          backgroundColor: 'color-mix(in oklab, var(--color-card) 60%, transparent)',
          '&:hover': {
            borderColor: 'var(--color-accent)',
            color: 'var(--color-accent)',
            backgroundColor: 'color-mix(in oklab, var(--color-accent) 8%, transparent)',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: 'color-mix(in oklab, var(--color-card) 70%, transparent)',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--color-border)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--color-accent)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--color-ring)',
            borderWidth: 2,
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: 'var(--color-ring)',
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '.14em',
          fontSize: '.72rem',
          border: '1px solid var(--color-border)',
          backgroundColor: 'color-mix(in oklab, var(--color-card) 75%, transparent)',
          color: 'var(--color-muted-foreground)',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: 'var(--color-primary)',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          '&.Mui-selected': {
            color: 'var(--color-primary)',
          },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: 'var(--color-primary)',
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          '&.Mui-checked': {
            color: 'var(--color-primary)',
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundImage: 'none',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'var(--color-border)',
        },
      },
    },
  },
});

export { theme };
export default theme;
