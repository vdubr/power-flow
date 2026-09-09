import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { useEnergyStore } from '../store/energyStore';
import { EnergyRecord, YearlyData } from '../types/energy';
import { calculateYearStatistics } from '../utils/energyData';
import theme from '../theme';
import ChartControls from '../components/Chart/ChartControls';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(
  year: number,
  month: number,
  day: number,
  consumption: number,
  production: number
): EnergyRecord {
  return {
    timestamp: new Date(year, month - 1, day, 12, 0),
    consumption,
    production,
  };
}

/**
 * Seed the store with one year of data so that hasData === true in the component.
 */
function seedStore(records: EnergyRecord[] = [makeRecord(2023, 6, 1, 5, 2)]) {
  const year = records[0].timestamp.getFullYear();
  const sorted = [...records].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const yearlyData = new Map<number, YearlyData>([
    [
      year,
      {
        year,
        records: sorted,
        statistics: calculateYearStatistics(sorted, year),
        hasConsumption: sorted.some(r => r.consumption > 0),
        hasProduction: sorted.some(r => r.production > 0),
      },
    ],
  ]);

  useEnergyStore.setState({
    yearlyData,
    allRecords: sorted,
    availableYears: [year],
    chartConfig: {
      ...useEnergyStore.getState().chartConfig,
      selectedYears: [year],
      aggregationType: 'daily',
      showConsumption: true,
      showProduction: true,
      timeRange: null,
      rangeMode: 'years',
    },
    batterySimulation: null,
  });
}

function renderControls() {
  return render(
    <ThemeProvider theme={theme}>
      <ChartControls />
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

describe('ChartControls', () => {
  describe('without data (empty store)', () => {
    it('renders the "Nastavení grafu" heading', () => {
      renderControls();
      expect(screen.getByText('Nastavení grafu')).toBeInTheDocument();
    });

    it('shows hint text when no years are available', () => {
      renderControls();
      expect(
        screen.getByText('Nahrajte data pro výběr roků')
      ).toBeInTheDocument();
    });

    it('Agregace select is disabled when there are no data', () => {
      renderControls();
      // MUI v7 Select renders the visible div with role="combobox" and
      // aria-disabled="true" (not the HTML disabled attribute) when the prop
      // `disabled` is set. We therefore assert on aria-disabled.
      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-disabled', 'true');
    });

    it('Spotřeba switch is disabled when there are no data', () => {
      renderControls();
      // The "Spotřeba" label is paired with a switch (checkbox role in MUI)
      const spotrebaLabel = screen.getByText('Spotřeba');
      // The switch is the closest checkbox in the same FormControlLabel subtree
      const formControlLabel = spotrebaLabel.closest('label');
      expect(formControlLabel).not.toBeNull();
      const switchInput = formControlLabel!.querySelector('input[type="checkbox"]');
      expect(switchInput).toBeDisabled();
    });

    it('Výroba switch is disabled when there are no data', () => {
      renderControls();
      const vyrobaLabel = screen.getByText('Výroba');
      const formControlLabel = vyrobaLabel.closest('label');
      expect(formControlLabel).not.toBeNull();
      const switchInput = formControlLabel!.querySelector('input[type="checkbox"]');
      expect(switchInput).toBeDisabled();
    });
  });

  describe('with data loaded', () => {
    it('Agregace select is enabled', () => {
      seedStore();
      renderControls();
      const select = screen.getByRole('combobox');
      expect(select).not.toBeDisabled();
    });

    it('Spotřeba and Výroba switches are enabled', () => {
      seedStore();
      renderControls();

      const spotrebaLabel = screen.getByText('Spotřeba').closest('label');
      const vyrobaLabel = screen.getByText('Výroba').closest('label');

      expect(
        spotrebaLabel!.querySelector('input[type="checkbox"]')
      ).not.toBeDisabled();
      expect(
        vyrobaLabel!.querySelector('input[type="checkbox"]')
      ).not.toBeDisabled();
    });

    it('toggling Spotřeba switch updates showConsumption in the store', () => {
      seedStore();
      renderControls();

      expect(useEnergyStore.getState().chartConfig.showConsumption).toBe(true);

      const spotrebaLabel = screen.getByText('Spotřeba').closest('label');
      const switchInput = spotrebaLabel!.querySelector('input[type="checkbox"]')!;
      fireEvent.click(switchInput);

      expect(useEnergyStore.getState().chartConfig.showConsumption).toBe(false);
    });

    it('toggling Výroba switch updates showProduction in the store', () => {
      seedStore();
      renderControls();

      expect(useEnergyStore.getState().chartConfig.showProduction).toBe(true);

      const vyrobaLabel = screen.getByText('Výroba').closest('label');
      const switchInput = vyrobaLabel!.querySelector('input[type="checkbox"]')!;
      fireEvent.click(switchInput);

      expect(useEnergyStore.getState().chartConfig.showProduction).toBe(false);
    });

    it('renders available year as a chip', () => {
      seedStore();
      renderControls();
      // The year chip should be visible
      expect(screen.getByText('2023')).toBeInTheDocument();
    });

    it('Den/Noc settings section is hidden until the toggle is switched on', () => {
      seedStore();
      renderControls();
      expect(screen.queryByText('Nastavení Den/Noc')).not.toBeInTheDocument();
    });

    it('the day/night toggle reveals its settings and applies to any aggregation', () => {
      seedStore();
      renderControls();

      const toggle = screen.getByLabelText('Rozdělit na den a noc');
      // The toggle is not tied to a particular aggregation any more: the default
      // here is 'daily', where the old sun overlay switch was disabled.
      expect(toggle).toBeEnabled();

      fireEvent.click(toggle);

      expect(useEnergyStore.getState().chartConfig.showDayNight).toBe(true);
      expect(screen.getAllByText('Nastavení Den/Noc').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Sloupce se dělí na denní a noční část')).toBeInTheDocument();
    });

    it('the day/night toggle is disabled without data', () => {
      renderControls();
      expect(screen.getByLabelText('Rozdělit na den a noc')).toBeDisabled();
    });

    it('explains that night bands need a single year on the time axis', () => {
      seedStore();
      useEnergyStore.getState().setAggregationType('raw');
      useEnergyStore.getState().setShowDayNight(true);
      useEnergyStore.getState().setSelectedYears([2022, 2023]);
      renderControls();

      expect(
        screen.getByText('Pásy noci se kreslí jen při výběru jednoho roku')
      ).toBeInTheDocument();
    });
  });

  describe('aggregation type selection', () => {
    it('setAggregationType updates the store when a new option is selected', () => {
      seedStore();
      renderControls();

      // Verify initial state
      expect(useEnergyStore.getState().chartConfig.aggregationType).toBe('daily');

      // Call the store action directly (same as the component does via onChange)
      useEnergyStore.getState().setAggregationType('monthly');

      expect(useEnergyStore.getState().chartConfig.aggregationType).toBe('monthly');
    });

    it('the five aggregation options are present in the select, without Den/Noc', () => {
      seedStore();
      const { baseElement } = renderControls();

      // Day/night is a toggle now, so it must not be a view the user has to
      // give up their aggregation for.
      const select = screen.getByLabelText('Agregace');
      fireEvent.mouseDown(select);

      // MUI renders menu items in a portal; use baseElement and getAllByText since
      // the currently selected option text also appears in the trigger element.
      expect(within(baseElement).getAllByText('15min intervaly').length).toBeGreaterThanOrEqual(1);
      expect(within(baseElement).getAllByText('1 hodina').length).toBeGreaterThanOrEqual(1);
      expect(within(baseElement).getAllByText('Denní').length).toBeGreaterThanOrEqual(1);
      expect(within(baseElement).getAllByText('Týdenní').length).toBeGreaterThanOrEqual(1);
      expect(within(baseElement).getAllByText('Měsíční').length).toBeGreaterThanOrEqual(1);
      expect(within(baseElement).queryByText('Den/Noc')).not.toBeInTheDocument();
    });
  });
});
