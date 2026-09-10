/**
 * Přepínač „Spotřeba pod osu“ mění jen to, na kterou stranu nuly se odebraná
 * energie kreslí. Testy proto hlídají dvě věci: že se stav dostane do storu a
 * že je vypnutý, dokud si ho uživatel nezapne.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { useEnergyStore } from '../store/energyStore';
import { EnergyRecord, YearlyData } from '../types/energy';
import { calculateYearStatistics } from '../utils/energyData';
import theme from '../theme';
import ConsumptionAxisToggle from '../components/Chart/ConsumptionAxisToggle';

function seedStore() {
  const records: EnergyRecord[] = [
    { timestamp: new Date(2024, 5, 1, 12, 0), consumption: 5, production: 2 },
  ];
  useEnergyStore.setState({
    yearlyData: new Map<number, YearlyData>([
      [
        2024,
        {
          year: 2024,
          records,
          statistics: calculateYearStatistics(records, 2024),
          hasConsumption: true,
          hasProduction: true,
        },
      ],
    ]),
    allRecords: records,
    availableYears: [2024],
    chartConfig: { ...useEnergyStore.getState().chartConfig, selectedYears: [2024] },
    batterySimulation: null,
  });
}

function renderToggle() {
  return render(
    <ThemeProvider theme={theme}>
      <ConsumptionAxisToggle />
    </ThemeProvider>
  );
}

beforeEach(() => {
  useEnergyStore.getState().clearData();
});

describe('ConsumptionAxisToggle', () => {
  it('je vypnutý, dokud si zrcadlení uživatel nezapne', () => {
    seedStore();
    renderToggle();

    expect(useEnergyStore.getState().chartConfig.consumptionBelowAxis).toBe(false);
    expect(screen.getByLabelText('Spotřeba pod osu')).not.toBeChecked();
  });

  it('zapnutí a vypnutí se propíše do storu', () => {
    seedStore();
    renderToggle();
    const toggle = screen.getByLabelText('Spotřeba pod osu');

    fireEvent.click(toggle);
    expect(useEnergyStore.getState().chartConfig.consumptionBelowAxis).toBe(true);
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    expect(useEnergyStore.getState().chartConfig.consumptionBelowAxis).toBe(false);
  });

  it('bez dat je zamčený – není co překlápět', () => {
    renderToggle();
    expect(screen.getByLabelText('Spotřeba pod osu')).toBeDisabled();
  });
});
