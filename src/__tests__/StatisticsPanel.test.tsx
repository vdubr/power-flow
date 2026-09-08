import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { useEnergyStore } from '../store/energyStore';
import { EnergyRecord, YearlyData } from '../types/energy';
import { calculateYearStatistics } from '../utils/energyData';
import theme from '../theme';
import StatisticsPanel from '../components/Statistics/StatisticsPanel';

// StatisticsPanel renders TopConsumptionDays which has no ECharts dependency.
// MainChart (ECharts) is NOT rendered here, so no echarts mock is needed.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  consumption: number,
  production: number
): EnergyRecord {
  return {
    timestamp: new Date(year, month - 1, day, hour, minute),
    consumption,
    production,
  };
}

/**
 * Seed the Zustand store directly, bypassing addData(), using the same
 * approach as components.test.tsx so test isolation is preserved.
 */
function seedStore(yearMap: Map<number, EnergyRecord[]>, selectedYears?: number[]) {
  const yearlyData = new Map<number, YearlyData>();
  const allRecords: EnergyRecord[] = [];

  for (const [year, records] of yearMap) {
    const sorted = [...records].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    yearlyData.set(year, {
      year,
      records: sorted,
      statistics: calculateYearStatistics(sorted, year),
      // YearlyData requires hasConsumption / hasProduction flags
      hasConsumption: sorted.some(r => r.consumption > 0),
      hasProduction: sorted.some(r => r.production > 0),
    });
    allRecords.push(...sorted);
  }

  allRecords.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const availableYears = Array.from(yearlyData.keys()).sort();

  useEnergyStore.setState({
    yearlyData,
    allRecords,
    availableYears,
    chartConfig: {
      ...useEnergyStore.getState().chartConfig,
      selectedYears: selectedYears ?? availableYears,
      timeRange: null,
      rangeMode: 'years',
    },
    batterySimulation: null,
  });
}

function renderPanel() {
  return render(
    <ThemeProvider theme={theme}>
      <StatisticsPanel />
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Store reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useEnergyStore.getState().clearData();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StatisticsPanel', () => {
  describe('empty state (no data loaded)', () => {
    it('renders the "Statistiky" heading in empty state', () => {
      renderPanel();
      expect(screen.getByText('Statistiky')).toBeInTheDocument();
    });

    it('shows the empty-state hint text instead of KPI cards', () => {
      renderPanel();
      expect(
        screen.getByText('Vyberte rok pro zobrazení statistik')
      ).toBeInTheDocument();
    });

    it('does not render consumption or production KPI labels when empty', () => {
      renderPanel();
      expect(screen.queryByText('Celková spotřeba')).not.toBeInTheDocument();
      expect(screen.queryByText('Celková výroba')).not.toBeInTheDocument();
    });
  });

  describe('with data loaded', () => {
    it('renders "Celková spotřeba" and "Celková výroba" KPI labels', () => {
      seedStore(
        new Map([
          [2023, [makeRecord(2023, 6, 1, 12, 0, 10, 5)]],
        ])
      );
      renderPanel();
      expect(screen.getByText('Celková spotřeba')).toBeInTheDocument();
      expect(screen.getByText('Celková výroba')).toBeInTheDocument();
    });

    it('displays the correct total consumption value next to the "Celková spotřeba" label', () => {
      // Two records: consumption 10 + 5 = 15 kWh. formatEnergy(15) → „15,0 kWh“.
      // Note: the same formatted value might appear elsewhere (e.g. day/night breakdown),
      // so we locate it by finding the card whose title is "Celková spotřeba".
      seedStore(
        new Map([
          [
            2023,
            [
              makeRecord(2023, 6, 1, 10, 0, 10, 0),
              makeRecord(2023, 6, 1, 11, 0, 5, 0),
            ],
          ],
        ])
      );
      renderPanel();
      // Find the "Celková spotřeba" label element and navigate to its card container
      // which also contains the formatted value.
      const label = screen.getByText('Celková spotřeba');
      const card = label.closest('.MuiCardContent-root');
      expect(card).not.toBeNull();
      expect(card).toHaveTextContent('15,0 kWh');
    });

    it('displays the correct total production value next to the "Celková výroba" label', () => {
      // Production: 8 kWh. formatEnergy(8) → "8.0 kWh"
      seedStore(
        new Map([
          [2023, [makeRecord(2023, 6, 1, 12, 0, 0, 8)]],
        ])
      );
      renderPanel();
      const label = screen.getByText('Celková výroba');
      const card = label.closest('.MuiCardContent-root');
      expect(card).not.toBeNull();
      expect(card).toHaveTextContent('8,0 kWh');
    });

    it('shows self-sufficiency KPI label', () => {
      seedStore(
        new Map([
          [2023, [makeRecord(2023, 6, 1, 12, 0, 10, 5)]],
        ])
      );
      renderPanel();
      expect(screen.getByText('Soběstačnost')).toBeInTheDocument();
    });

    it('shows day/night consumption KPI labels', () => {
      seedStore(
        new Map([
          [2023, [makeRecord(2023, 6, 1, 14, 0, 5, 2)]],
        ])
      );
      renderPanel();
      expect(screen.getByText('Spotřeba ve dne')).toBeInTheDocument();
      expect(screen.getByText('Spotřeba v noci')).toBeInTheDocument();
    });

    it('formats large consumption values as MWh in the "Celková spotřeba" card', () => {
      // 2000 kWh → formatEnergy(2000) → "2.0 MWh"
      // The day-breakdown card may also show a MWh value, so we scope the assertion
      // to the "Celková spotřeba" card to avoid false positives.
      seedStore(
        new Map([
          [2023, [makeRecord(2023, 6, 1, 12, 0, 2000, 0)]],
        ])
      );
      renderPanel();
      const label = screen.getByText('Celková spotřeba');
      const card = label.closest('.MuiCardContent-root');
      expect(card).not.toBeNull();
      expect(card).toHaveTextContent('2,0 MWh');
    });

    it('renders the "Dny s nejvyšší spotřebou" section when data is present', () => {
      seedStore(
        new Map([
          [2023, [makeRecord(2023, 6, 1, 12, 0, 5, 0)]],
        ])
      );
      renderPanel();
      expect(screen.getByText(/Dny s nejvyšší spotřebou/)).toBeInTheDocument();
    });
  });
});
