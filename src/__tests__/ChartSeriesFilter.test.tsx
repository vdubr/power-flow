/**
 * Filtr dat pod grafem: řádky podle zobrazení (spotřeba a výroba v bilanci,
 * jediná „Dokoupená energie“ v net režimu), na začátku řádku přepínač celé
 * veličiny, dál jeden čip na rok a na konci spotřeby čtyřstavový přepínač
 * den/noc.
 *
 * Přepínače Spotřeba / Výroba se sem přesunuly z „Nastavení grafu“, testy
 * jejich chování jsou tedy tady, ne v `ChartControls.test.tsx`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { useEnergyStore } from '../store/energyStore';
import { EnergyRecord, YearlyData } from '../types/energy';
import { calculateYearStatistics } from '../utils/energyData';
import theme from '../theme';
import ChartSeriesFilter from '../components/Chart/ChartSeriesFilter';

function makeRecords(year: number): EnergyRecord[] {
  const records: EnergyRecord[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const hour of [3, 12]) {
      records.push({
        timestamp: new Date(year, month - 1, 15, hour, 0),
        consumption: hour === 12 ? 4 : 2,
        production: hour === 12 ? 6 : 0,
      });
    }
  }
  return records;
}

/** Seeds the store with the given years, all of them selected. */
function seedStore(years: number[]) {
  const yearlyData = new Map<number, YearlyData>();
  const allRecords: EnergyRecord[] = [];
  for (const year of years) {
    const records = makeRecords(year);
    yearlyData.set(year, {
      year,
      records,
      statistics: calculateYearStatistics(records, year),
      hasConsumption: true,
      hasProduction: true,
    });
    allRecords.push(...records);
  }

  useEnergyStore.setState({
    yearlyData,
    allRecords,
    availableYears: [...years],
    chartConfig: {
      ...useEnergyStore.getState().chartConfig,
      selectedYears: [...years],
      aggregationType: 'monthly',
      showConsumption: true,
      showProduction: true,
      chartMode: 'balance',
      consumptionSplit: 'sum',
      hiddenSeries: [],
    },
    highlightedSeries: [],
    batterySimulation: null,
  });
}

function renderFilter() {
  return render(
    <ThemeProvider theme={theme}>
      <ChartSeriesFilter />
    </ThemeProvider>
  );
}

function row(label: string): HTMLElement {
  return screen.getByRole('group', { name: `Filtr grafu – ${label}` });
}

/** The switch in the row header for one quantity. */
function rowSwitch(label: 'Spotřeba' | 'Výroba'): HTMLInputElement {
  const control = within(row(label)).getByText(label).closest('label');
  expect(control).not.toBeNull();
  return control!.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

/**
 * Co v řádku nese zvýraznění celého řádku – hlavička se přepínačem veličiny,
 * a tam, kde přepínač není (net), samotný popisek.
 */
function rowHeader(label: string): HTMLElement {
  const text = within(row(label)).getByText(label);
  return text.closest('label') ?? text;
}

function chip(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

/** Čtyřstavový přepínač den/noc na konci řádku spotřeby. */
function splitGroup(): HTMLElement {
  return screen.getByRole('group', { name: 'Rozpad spotřeby na den a noc' });
}

function splitButton(name: string): HTMLElement {
  return within(splitGroup()).getByRole('button', { name });
}

function highlighted(): string[] {
  return useEnergyStore.getState().highlightedSeries;
}

beforeEach(() => {
  useEnergyStore.getState().clearData();
});

describe('ChartSeriesFilter', () => {
  it('má dva řádky, spotřebu a výrobu', () => {
    seedStore([2024]);
    renderFilter();

    expect(row('Spotřeba')).toBeInTheDocument();
    expect(row('Výroba')).toBeInTheDocument();
  });

  it('každá série je v řádku své veličiny, popsaná rokem', () => {
    seedStore([2023, 2024]);
    renderFilter();

    for (const year of ['2023', '2024']) {
      expect(within(row('Spotřeba')).getByRole('button', { name: `Spotřeba ${year}` })).toBeInTheDocument();
      expect(within(row('Výroba')).getByRole('button', { name: `Výroba ${year}` })).toBeInTheDocument();
      // Řádek spotřeby nesmí obsahovat sérii výroby a naopak.
      expect(within(row('Spotřeba')).queryByRole('button', { name: `Výroba ${year}` })).toBeNull();
      expect(within(row('Výroba')).queryByRole('button', { name: `Spotřeba ${year}` })).toBeNull();
    }
  });

  // Požadavek: v zobrazení „Dokoupená energie“ je jedna série celý graf, není
  // tedy co vypínat – přepínač veličiny by jen umožnil vyprázdnit graf.
  it('dokoupená energie má jediný řádek s roky a bez přepínače veličiny', () => {
    seedStore([2023, 2024]);
    useEnergyStore.getState().setChartMode('net');
    renderFilter();

    const netRow = row('Dokoupená energie');
    expect(netRow).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filtr grafu – Spotřeba' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filtr grafu – Výroba' })).toBeNull();

    expect(within(netRow).queryByRole('checkbox')).toBeNull();
    for (const year of ['2023', '2024']) {
      expect(
        within(netRow).getByRole('button', { name: `Dokoupená energie ${year}` })
      ).toBeInTheDocument();
    }
  });

  it('kliknutí na čip sérii skryje a znovu zobrazí', () => {
    seedStore([2023, 2024]);
    renderFilter();

    expect(chip('Spotřeba 2023')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(chip('Spotřeba 2023'));
    expect(useEnergyStore.getState().chartConfig.hiddenSeries).toEqual(['Spotřeba 2023']);
    expect(chip('Spotřeba 2023')).toHaveAttribute('aria-pressed', 'false');
    // Skrytá série zůstává ve filtru, jinak by ji nešlo zapnout zpátky.
    expect(chip('Spotřeba 2024')).toBeInTheDocument();

    fireEvent.click(chip('Spotřeba 2023'));
    expect(useEnergyStore.getState().chartConfig.hiddenSeries).toEqual([]);
  });

  it('skrytí série nemění aktivní rozsah ani simulaci', () => {
    seedStore([2023, 2024]);
    const before = useEnergyStore.getState().getActiveRecords().length;
    renderFilter();

    fireEvent.click(chip('Výroba 2023'));

    expect(useEnergyStore.getState().getActiveRecords().length).toBe(before);
  });

  it('přepínač Spotřeba mění showConsumption ve storu', () => {
    seedStore([2024]);
    renderFilter();

    expect(useEnergyStore.getState().chartConfig.showConsumption).toBe(true);
    fireEvent.click(rowSwitch('Spotřeba'));
    expect(useEnergyStore.getState().chartConfig.showConsumption).toBe(false);
  });

  it('přepínač Výroba mění showProduction ve storu', () => {
    seedStore([2024]);
    renderFilter();

    expect(useEnergyStore.getState().chartConfig.showProduction).toBe(true);
    fireEvent.click(rowSwitch('Výroba'));
    expect(useEnergyStore.getState().chartConfig.showProduction).toBe(false);
  });

  // Požadavek: vypnutý přepínač řádku nechá čipy vypsané a jen je zšedne,
  // stejně jako kliknutí na čip. Kdyby zmizely, filtr by pod rukama poskakoval
  // a nebylo by z něj vidět, co v grafu chybí.
  it('vypnutá veličina nechá své čipy vypsané, ale neaktivní', () => {
    seedStore([2023, 2024]);
    renderFilter();

    fireEvent.click(rowSwitch('Výroba'));

    for (const year of ['2023', '2024']) {
      const productionChip = chip(`Výroba ${year}`);
      expect(productionChip).toBeInTheDocument();
      expect(productionChip).toHaveAttribute('aria-pressed', 'false');
      expect(productionChip).toHaveAttribute('aria-disabled', 'true');

      // Spotřeba zůstává beze změny.
      expect(chip(`Spotřeba ${year}`)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('čip vypnuté veličiny se nedá kliknutím zapnout – slouží k tomu přepínač', () => {
    seedStore([2024]);
    renderFilter();
    fireEvent.click(rowSwitch('Výroba'));

    fireEvent.click(chip('Výroba 2024'));

    expect(useEnergyStore.getState().chartConfig.hiddenSeries).toEqual([]);
    expect(chip('Výroba 2024')).toHaveAttribute('aria-pressed', 'false');

    // Zpátky přes přepínač řádku.
    fireEvent.click(rowSwitch('Výroba'));
    expect(chip('Výroba 2024')).toHaveAttribute('aria-pressed', 'true');
  });

  // Požadavek: totéž platí pro odznaky roků v „Import dat“.
  it('nevybraný rok nechá své čipy vypsané, ale neaktivní', () => {
    seedStore([2023, 2024]);
    renderFilter();

    // Odznak 2023 v „Import dat“ – tady přes stejnou akci ve storu.
    act(() => useEnergyStore.getState().setSelectedYears([2024]));

    for (const quantity of ['Spotřeba', 'Výroba'] as const) {
      const offChip = chip(`${quantity} 2023`);
      expect(offChip).toHaveAttribute('aria-pressed', 'false');
      expect(offChip).toHaveAttribute('aria-disabled', 'true');
      expect(chip(`${quantity} 2024`)).toHaveAttribute('aria-pressed', 'true');
    }

    act(() => useEnergyStore.getState().setSelectedYears([2023, 2024]));
    expect(chip('Spotřeba 2023')).toHaveAttribute('aria-pressed', 'true');
  });

  it('odebraný rok z filtru zmizí úplně', () => {
    seedStore([2023, 2024]);
    renderFilter();

    act(() => useEnergyStore.getState().removeYear(2023));

    expect(screen.queryByRole('button', { name: 'Spotřeba 2023' })).toBeNull();
    expect(chip('Spotřeba 2024')).toBeInTheDocument();
  });

  it('bez dat jsou oba přepínače disabled a řádky prázdné', () => {
    renderFilter();

    expect(rowSwitch('Spotřeba')).toBeDisabled();
    expect(rowSwitch('Výroba')).toBeDisabled();
    expect(screen.queryAllByRole('button', { name: /^(Spotřeba|Výroba) \d{4}/ })).toEqual([]);
  });

  describe('přepínač den/noc', () => {
    it('má čtyři stavy a výchozí je Suma', () => {
      seedStore([2024]);
      renderFilter();

      const buttons = within(splitGroup()).getAllByRole('button');
      expect(buttons.map((button) => button.textContent)).toEqual([
        'Suma',
        'Den i noc',
        'Jen den',
        'Jen noc',
      ]);
      expect(splitButton('Suma')).toHaveAttribute('aria-pressed', 'true');
      expect(splitButton('Suma').className).toContain('Mui-selected');
    });

    it('stojí na konci řádku spotřeby, výroba ho nemá', () => {
      seedStore([2024]);
      renderFilter();

      expect(within(row('Spotřeba')).getByRole('group', { name: 'Rozpad spotřeby na den a noc' }))
        .toBeInTheDocument();
      expect(within(row('Výroba')).queryByRole('group')).toBeNull();

      // Až za čipy roků: v DOM řádku následuje po posledním čipu.
      const inRow = within(row('Spotřeba')).getAllByRole('button');
      expect(inRow.map((button) => button.textContent)).toEqual([
        '2024',
        'Suma',
        'Den i noc',
        'Jen den',
        'Jen noc',
      ]);
    });

    it('kliknutí na „Jen noc“ zapíše night do storu', () => {
      seedStore([2024]);
      renderFilter();

      fireEvent.click(splitButton('Jen noc'));

      expect(useEnergyStore.getState().chartConfig.consumptionSplit).toBe('night');
      expect(splitButton('Jen noc')).toHaveAttribute('aria-pressed', 'true');
      expect(splitButton('Suma')).toHaveAttribute('aria-pressed', 'false');
    });

    it('„Den i noc“ i „Jen den“ se zapíšou do storu', () => {
      seedStore([2024]);
      renderFilter();

      fireEvent.click(splitButton('Den i noc'));
      expect(useEnergyStore.getState().chartConfig.consumptionSplit).toBe('both');

      fireEvent.click(splitButton('Jen den'));
      expect(useEnergyStore.getState().chartConfig.consumptionSplit).toBe('day');
    });

    it('v zobrazení dokoupené energie patří k jejímu řádku', () => {
      seedStore([2024]);
      useEnergyStore.getState().setChartMode('net');
      renderFilter();

      expect(
        within(row('Dokoupená energie')).getByRole('group', {
          name: 'Rozpad spotřeby na den a noc',
        })
      ).toBeInTheDocument();

      fireEvent.click(splitButton('Jen noc'));
      expect(useEnergyStore.getState().chartConfig.consumptionSplit).toBe('night');
    });

    it('bez dat je zamčený', () => {
      renderFilter();

      for (const name of ['Suma', 'Den i noc', 'Jen den', 'Jen noc']) {
        expect(splitButton(name)).toBeDisabled();
      }
    });
  });

  describe('zvýraznění v grafu', () => {
    it('ukázání na čip roku zvýrazní jeho sérii, opuštění ji zruší', () => {
      seedStore([2023, 2024]);
      renderFilter();

      fireEvent.mouseEnter(chip('Spotřeba 2023'));
      expect(highlighted()).toEqual(['Spotřeba 2023']);

      fireEvent.mouseLeave(chip('Spotřeba 2023'));
      expect(highlighted()).toEqual([]);
    });

    it('zaostření čipu z klávesnice zvýrazní totéž', () => {
      seedStore([2023, 2024]);
      renderFilter();

      fireEvent.focus(chip('Výroba 2024'));
      expect(highlighted()).toEqual(['Výroba 2024']);

      fireEvent.blur(chip('Výroba 2024'));
      expect(highlighted()).toEqual([]);
    });

    it('ukázání na řádek zvýrazní všechny jeho aktivní série', () => {
      seedStore([2023, 2024]);
      renderFilter();

      fireEvent.mouseEnter(rowHeader('Spotřeba'));
      expect(highlighted()).toEqual(['Spotřeba 2023', 'Spotřeba 2024']);

      fireEvent.mouseLeave(rowHeader('Spotřeba'));
      expect(highlighted()).toEqual([]);
    });

    it('řádek zvýrazní jen to, co graf kreslí', () => {
      seedStore([2023, 2024]);
      renderFilter();

      fireEvent.click(chip('Spotřeba 2023'));
      fireEvent.mouseEnter(rowHeader('Spotřeba'));

      expect(highlighted()).toEqual(['Spotřeba 2024']);
    });

    // Graf neaktivní sérii nekreslí, takže by se nic nezvýraznilo a zvýrazněný
    // stav by po ní zůstal viset.
    it('ukázání na neaktivní čip nic nezvýrazní', () => {
      seedStore([2023, 2024]);
      renderFilter();

      // Vypnutá veličina.
      fireEvent.click(rowSwitch('Výroba'));
      fireEvent.mouseEnter(chip('Výroba 2023'));
      expect(highlighted()).toEqual([]);

      // Skrytá série – klikatelná, ale graf ji nekreslí.
      fireEvent.click(chip('Spotřeba 2023'));
      fireEvent.mouseEnter(chip('Spotřeba 2023'));
      expect(highlighted()).toEqual([]);
    });

    it('v zobrazení dokoupené energie zvýrazní její série', () => {
      seedStore([2023, 2024]);
      useEnergyStore.getState().setChartMode('net');
      renderFilter();

      fireEvent.mouseEnter(chip('Dokoupená energie 2023'));
      expect(highlighted()).toEqual(['Dokoupená energie 2023']);

      fireEvent.mouseEnter(rowHeader('Dokoupená energie'));
      expect(highlighted()).toEqual(['Dokoupená energie 2023', 'Dokoupená energie 2024']);
    });
  });
});
