import { ThemeProvider, CssBaseline, Box, Stack, Paper } from '@mui/material';
import theme from './theme';
import { useEnergyStore } from './store/energyStore';
import { MainLayout } from './components/Layout';
import { FileUploader, CezGuide } from './components/DataImport';
import { MainChart } from './components/Chart';
import { StatisticsPanel, BatteryAnalysis, YearComparisonTable } from './components/Statistics';

function App() {
  const allRecords = useEnergyStore((s) => s.allRecords);
  const selectedYears = useEnergyStore((s) => s.chartConfig.selectedYears);
  const hasData = allRecords.length > 0;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className="observatory-bg" sx={{ minHeight: '100vh' }}>
        <MainLayout>
          <Stack spacing={3}>
            {/* Always show FileUploader — switches between full drop zone and compact bar internally */}
            <FileUploader />

            {hasData ? (
              <>
                <MainChart />
                <StatisticsPanel />
                <BatteryAnalysis />
                {selectedYears.length > 1 && (
                  <Paper className="paper-card" sx={{ p: 3 }}>
                    <YearComparisonTable />
                  </Paper>
                )}
              </>
            ) : (
              <CezGuide />
            )}
          </Stack>
        </MainLayout>
      </Box>
    </ThemeProvider>
  );
}

export default App;
