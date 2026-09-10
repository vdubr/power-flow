/**
 * Volba agregace. Přesunula se ze „Nastavení grafu“ pod nadpis grafu, protože
 * rozhoduje o tom, co graf vlastně je — testy jejího chování jsou tedy tady,
 * ne v `ChartControls.test.tsx`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { useEnergyStore } from '../store/energyStore';
import { EnergyRecord, YearlyData } from '../types/energy';
import { calculateYearStatistics } from '../utils/energyData';
import theme from '../theme';
import ChartAggregationSelect from '../components/Chart/ChartAggregationSelect';

function seedStore() {
  const records: EnergyRecord[] = [
    { timestamp: new Date(2023, 5, 1, 12, 0), consumption: 5, production: 2 },
  ];
  useEnergyStore.setState({
    yearlyData: new Map<number, YearlyData>([
      [
        2023,
        {
          year: 2023,
          records,
          statistics: calculateYearStatistics(records, 2023),
          hasConsumption: true,
          hasProduction: true,
        },
      ],
    ]),
    allRecords: records,
    availableYears: [2023],
    chartConfig: {
      ...useEnergyStore.getState().chartConfig,
      selectedYears: [2023],
      aggregationType: 'daily',
    },
    batterySimulation: null,
  });
}

function renderSelect() {
  return render(
    <ThemeProvider theme={theme}>
      <ChartAggregationSelect />
    </ThemeProvider>
  );
}

beforeEach(() => {
  useEnergyStore.getState().clearData();
});

describe('ChartAggregationSelect', () => {
  it('bez dat je zamčená', () => {
    renderSelect();
    // MUI v7 renders the closed Select as a div with role="combobox" and
    // aria-disabled, not the HTML disabled attribute.
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true');
  });

  it('s daty je odemčená a nese aktuální agregaci', () => {
    seedStore();
    renderSelect();

    const select = screen.getByRole('combobox');
    expect(select).not.toBeDisabled();
    expect(screen.getByLabelText('Agregace')).toBeInTheDocument();
    expect(screen.getByText('Součet za každý den')).toBeInTheDocument();
  });

  it('nabízí pět zobrazení, žádné Den/Noc – to je přepínač', () => {
    seedStore();
    const { baseElement } = renderSelect();

    fireEvent.mouseDown(screen.getByLabelText('Agregace'));

    // MUI renders the menu in a portal, and the selected option's text also
    // shows in the closed trigger, hence getAllByText over baseElement.
    for (const label of ['15min intervaly', '1 hodina', 'Denní', 'Týdenní', 'Měsíční']) {
      expect(within(baseElement).getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
    expect(within(baseElement).queryByText('Den/Noc')).not.toBeInTheDocument();
    expect(within(baseElement).getAllByRole('option')).toHaveLength(5);
  });

  it('výběr položky přepne agregaci ve storu', () => {
    seedStore();
    const { baseElement } = renderSelect();
    expect(useEnergyStore.getState().chartConfig.aggregationType).toBe('daily');

    fireEvent.mouseDown(screen.getByLabelText('Agregace'));
    fireEvent.click(within(baseElement).getByRole('option', { name: /Týdenní/ }));

    expect(useEnergyStore.getState().chartConfig.aggregationType).toBe('weekly');
  });
});
