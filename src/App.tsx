import React, { useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Box, Tabs, Tab, Paper } from '@mui/material';
import Grid from '@mui/material/Grid';
import { MainLayout } from './components/Layout';
import { FileUploader } from './components/DataImport';
import { MainChart, ChartControls } from './components/Chart';
import { StatisticsPanel, BatteryAnalysis } from './components/Statistics';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ff9800',
      light: '#ffb74d',
      dark: '#f57c00',
    },
    secondary: {
      main: '#ffb74d',
    },
    background: {
      default: '#0a0a0a',
      paper: '#1a1a1a',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0b0b0',
    },
    divider: '#2d2d2d',
    success: {
      main: '#4caf50',
    },
    error: {
      main: '#f44336',
    },
    warning: {
      main: '#ff9800',
    },
    info: {
      main: '#29b6f6',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#1e1e1e',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
          '&:hover': {
            backgroundColor: '#f57c00',
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            color: '#ff9800',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: '#ff9800',
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: '#ff9800',
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          '&.Mui-checked': {
            color: '#ff9800',
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        standardSuccess: {
          backgroundColor: 'rgba(76, 175, 80, 0.15)',
          color: '#81c784',
        },
        standardInfo: {
          backgroundColor: 'rgba(41, 182, 246, 0.15)',
          color: '#4fc3f7',
        },
        standardWarning: {
          backgroundColor: 'rgba(255, 152, 0, 0.15)',
          color: '#ffb74d',
        },
        standardError: {
          backgroundColor: 'rgba(244, 67, 54, 0.15)',
          color: '#e57373',
        },
      },
    },
  },
});

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MainLayout>
        {/* Main Chart Section */}
        <Box sx={{ mb: 3 }}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, lg: 9 }}>
              <MainChart />
            </Grid>
            <Grid size={{ xs: 12, lg: 3 }}>
              <ChartControls />
            </Grid>
          </Grid>
        </Box>

        {/* Tabs for different sections */}
        <Paper elevation={3}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="main tabs"
            sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
          >
            <Tab label="Import dat" id="tab-0" aria-controls="tabpanel-0" />
            <Tab label="Statistiky" id="tab-1" aria-controls="tabpanel-1" />
            <Tab label="Analýza baterie" id="tab-2" aria-controls="tabpanel-2" />
          </Tabs>

          <Box sx={{ p: 2 }}>
            <TabPanel value={tabValue} index={0}>
              <FileUploader />
            </TabPanel>
            <TabPanel value={tabValue} index={1}>
              <StatisticsPanel />
            </TabPanel>
            <TabPanel value={tabValue} index={2}>
              <BatteryAnalysis />
            </TabPanel>
          </Box>
        </Paper>
      </MainLayout>
    </ThemeProvider>
  );
}

export default App;
