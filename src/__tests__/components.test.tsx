import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useEnergyStore } from '../store/energyStore';
import { EnergyRecord, YearlyData, CSVParseResult } from '../types/energy';
import { calculateYearStatistics, computeHasFlags } from '../utils/energyData';
import RangeControl from '../components/Common/RangeControl';
import TopConsumptionDays from '../components/Statistics/TopConsumptionDays';
import YearComparisonTable from '../components/Statistics/YearComparisonTable';
import CezGuide from '../components/DataImport/CezGuide';
import FileUploader from '../components/DataImport/FileUploader';
import { parseCSVFile } from '../utils/csvParser';

vi.mock('../utils/csvParser', () => ({
  parseCSVFile: vi.fn(),
}));

const makeRecord = (
  isoTimestamp: string,
  consumption: number,
  production: number
): EnergyRecord => ({
  timestamp: new Date(isoTimestamp),
  consumption,
  production,
});

/** Seed the store with multi-year data, bypassing addData. */
function seedStore(yearMap: Map<number, EnergyRecord[]>, selectedYears?: number[]) {
  const yearlyData = new Map<number, YearlyData>();
  const allRecords: EnergyRecord[] = [];

  for (const [year, records] of yearMap) {
    const sorted = [...records].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    const { hasProduction, hasConsumption } = computeHasFlags(sorted);
    yearlyData.set(year, {
      year,
      records: sorted,
      statistics: calculateYearStatistics(sorted, year),
      hasProduction,
      hasConsumption,
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

beforeEach(() => {
  useEnergyStore.getState().clearData();
});

describe('RangeControl', () => {
  it('renders three toggle buttons', () => {
    render(<RangeControl />);
    expect(screen.getByRole('button', { name: 'Vybrané roky' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poslední rok' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Výseč v grafu' })).toBeInTheDocument();
  });

  it('disables "Výseč v grafu" when timeRange is null', () => {
    render(<RangeControl />);
    const selection = screen.getByRole('button', { name: 'Výseč v grafu' });
    expect(selection).toBeDisabled();
  });

  it('enables "Výseč v grafu" when timeRange is set', () => {
    useEnergyStore.getState().setTimeRange({
      start: new Date('2024-01-01'),
      end: new Date('2024-06-01'),
    });
    render(<RangeControl />);
    const selection = screen.getByRole('button', { name: 'Výseč v grafu' });
    expect(selection).not.toBeDisabled();
  });

  it('calls setRangeMode when a button is clicked', () => {
    render(<RangeControl />);
    const lastBtn = screen.getByRole('button', { name: 'Poslední rok' });
    fireEvent.click(lastBtn);
    expect(useEnergyStore.getState().chartConfig.rangeMode).toBe('last');
  });

  it('reflects the current rangeMode as the pressed button', () => {
    useEnergyStore.getState().setRangeMode('last');
    render(<RangeControl />);
    const lastBtn = screen.getByRole('button', { name: 'Poslední rok' });
    expect(lastBtn).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('TopConsumptionDays', () => {
  it('renders nothing when records are empty', () => {
    const { container } = render(<TopConsumptionDays records={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the section header when records are present', () => {
    const records = [
      makeRecord('2024-01-15T12:00', 5, 0),
      makeRecord('2024-01-16T12:00', 3, 0),
    ];
    render(<TopConsumptionDays records={records} />);
    expect(screen.getByText(/Dny s nejvyšší spotřebou/)).toBeInTheDocument();
    expect(screen.getByText('— TOP 10')).toBeInTheDocument();
  });

  it('renders at most 10 day entries', () => {
    // Build 15 unique days, each with one record
    const records: EnergyRecord[] = [];
    for (let day = 1; day <= 15; day++) {
      const dd = String(day).padStart(2, '0');
      records.push(makeRecord(`2024-01-${dd}T12:00`, day, 0));
    }
    render(<TopConsumptionDays records={records} />);
    // Each row contains "X.0 kWh" — find them via text matcher
    const valueCells = screen.getAllByText(/\d+,\d kWh$/);
    expect(valueCells.length).toBeLessThanOrEqual(10);
    expect(valueCells.length).toBeGreaterThan(0);
  });

  it('orders entries by descending consumption (top day first)', () => {
    const records = [
      makeRecord('2024-01-15T12:00', 2, 0),
      makeRecord('2024-01-16T12:00', 9, 0),
      makeRecord('2024-01-17T12:00', 5, 0),
    ];
    render(<TopConsumptionDays records={records} />);
    const valueCells = screen.getAllByText(/\d+,\d kWh$/);
    // First entry should be the largest (9,0 kWh)
    expect(valueCells[0]).toHaveTextContent('9,0 kWh');
  });
});

describe('YearComparisonTable', () => {
  it('renders nothing when fewer than 2 years are selected', () => {
    seedStore(
      new Map([[2024, [makeRecord('2024-06-15T12:00', 1, 0.5)]]]),
      [2024]
    );
    const { container } = render(<YearComparisonTable />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a row per selected year when 2+ years are selected', () => {
    seedStore(
      new Map([
        [2022, [makeRecord('2022-06-15T12:00', 1, 0.5)]],
        [2023, [makeRecord('2023-06-15T12:00', 2, 1)]],
        [2024, [makeRecord('2024-06-15T12:00', 3, 1.5)]],
      ]),
      [2022, 2023, 2024]
    );
    render(<YearComparisonTable />);
    expect(screen.getByText('Porovnání let')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('skips selected years that have no yearlyData', () => {
    seedStore(
      new Map([
        [2023, [makeRecord('2023-06-15T12:00', 2, 1)]],
        [2024, [makeRecord('2024-06-15T12:00', 3, 1.5)]],
      ]),
      [2023, 2024, 2099] // 2099 is selected but not in yearlyData
    );
    render(<YearComparisonTable />);
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.queryByText('2099')).not.toBeInTheDocument();
  });
});

describe('CezGuide', () => {
  it('renders the heading and three steps', () => {
    render(<CezGuide />);
    expect(screen.getByText('Jak stáhnout data z ČEZ Distribuce')).toBeInTheDocument();
    expect(screen.getByText('Přihlášení')).toBeInTheDocument();
    expect(screen.getByText('Export měření')).toBeInTheDocument();
    expect(screen.getByText('Dva soubory')).toBeInTheDocument();
  });

  it('renders the three step numbers', () => {
    render(<CezGuide />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('FileUploader', () => {
  // Helper: make a successful CSVParseResult with a single data point.
  const successResult = (
    type: 'consumption' | 'production',
    isoTimestamp = '2022-06-01T12:00:00'
  ): CSVParseResult => ({
    success: true,
    data: [
      {
        timestamp: new Date(isoTimestamp),
        value: 1,
        type,
      },
    ],
    type,
    dateRange: {
      start: new Date(isoTimestamp),
      end: new Date(isoTimestamp),
    },
    errors: [],
    recordCount: 1,
    quality: { totalRows: 1, validRows: 1, invalidStatusRows: 0, rejectedRows: 0 },
  });

  // Helper: make a failed CSVParseResult.
  const failureResult = (
    errorMsg = 'Nepodařilo se rozpoznat typ dat. Hlavička musí obsahovat "+A", "a+", "-A" nebo "a-".'
  ): CSVParseResult => ({
    success: false,
    data: [],
    type: 'consumption',
    dateRange: null,
    errors: [errorMsg],
    recordCount: 0,
    quality: { totalRows: 0, validRows: 0, invalidStatusRows: 0, rejectedRows: 0 },
  });

  // Helper: dispatch a `change` event on the hidden <input type="file" /> with a
  // synthetic FileList. RTL's fireEvent.change does not always populate
  // input.files in jsdom, so we set it manually and then fire the event.
  const triggerFileSelect = (input: HTMLInputElement, files: File[]) => {
    Object.defineProperty(input, 'files', {
      value: files,
      configurable: true,
    });
    fireEvent.change(input);
  };

  beforeEach(() => {
    vi.mocked(parseCSVFile).mockReset();
    // The top-level beforeEach already calls clearData(), which resets
    // availableYears to []. We assert it explicitly here for clarity.
    expect(useEnergyStore.getState().availableYears).toHaveLength(0);
  });

  it('auto-commits successful files via addData() in empty state', async () => {
    vi.mocked(parseCSVFile)
      .mockResolvedValueOnce(successResult('consumption'))
      .mockResolvedValueOnce(successResult('production'));

    const { container } = render(<FileUploader />);

    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const consumptionFile = new File(
      ['header\n01.06.2022 12:00;1'],
      'spotreba.csv',
      { type: 'text/csv' }
    );
    const productionFile = new File(
      ['header\n01.06.2022 12:00;1'],
      'vyroba.csv',
      { type: 'text/csv' }
    );

    triggerFileSelect(input!, [consumptionFile, productionFile]);

    // Data must reach the store via addData() — the regression bug was that
    // staged files in empty state were never committed.
    await waitFor(() => {
      expect(useEnergyStore.getState().availableYears).toEqual([2022]);
    });

    // Component should transition into loaded state and render the import bar.
    expect(
      await screen.findByRole('button', { name: /Import dat/i })
    ).toBeInTheDocument();
    expect(parseCSVFile).toHaveBeenCalledTimes(2);
  });

  it('shows an Alert and does NOT commit when only failed files are uploaded', async () => {
    vi.mocked(parseCSVFile).mockResolvedValueOnce(failureResult());

    const { container } = render(<FileUploader />);
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const badFile = new File(['garbage'], 'bad.csv', { type: 'text/csv' });
    triggerFileSelect(input!, [badFile]);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('bad.csv');
    expect(alert).toHaveTextContent(/Nepodařilo se rozpoznat/);

    // No commit happened — store stays empty.
    expect(useEnergyStore.getState().availableYears).toHaveLength(0);
    expect(useEnergyStore.getState().allRecords).toHaveLength(0);
  });

  it('commits successful files AND shows an Alert for failed ones (mixed batch)', async () => {
    vi.mocked(parseCSVFile)
      .mockResolvedValueOnce(successResult('consumption'))
      .mockResolvedValueOnce(failureResult());

    const { container } = render(<FileUploader />);
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const okFile = new File(
      ['header\n01.06.2022 12:00;1'],
      'spotreba.csv',
      { type: 'text/csv' }
    );
    const badFile = new File(['garbage'], 'bad.csv', { type: 'text/csv' });

    triggerFileSelect(input!, [okFile, badFile]);

    // Successful file is committed.
    await waitFor(() => {
      expect(useEnergyStore.getState().availableYears).toContain(2022);
    });

    // Component transitions to loaded state.
    expect(
      await screen.findByRole('button', { name: /Import dat/i })
    ).toBeInTheDocument();

    // Failure surfaces as an MUI Alert that names the bad file.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('bad.csv');
  });
});
