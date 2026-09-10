import { describe, it, expect } from 'vitest';
import {
  isTimeAxisAggregation,
  buildChartSeries,
  buildAccessibleChartSummary,
  buildSeriesFilterChips,
  buildUnitComparison,
  buildUnitComparisonRows,
  computeBrushDateRange,
  computeNightMarkAreas,
  computeZoomDateRange,
  createChartTooltipFormatter,
  formatCategoryAxisLabel,
  formatZoomWindowLabel,
  isComparableUnitAggregation,
  isZoomedWindow,
  seriesAverage,
  splitLookupKey,
  unitGroups,
  ChartSeriesDef,
  SeriesQuantity,
  UnitComparison,
  UnitQuantityComparison,
} from '../utils/chartSeriesBuilder';
import { calculateYearStatistics, computeHasFlags } from '../utils/energyData';
import {
  AggregationType,
  ChartMode,
  ConsumptionSplit,
  DayNightConfig,
  EnergyRecord,
  YearlyData,
} from '../types/energy';
import { getDefaultLocation } from '../utils/sunCalculations';

/**
 * The chart's data shaping lives here as a pure function, so it can be checked
 * without a canvas. These tests pin the contract MainChart relies on: one
 * x-axis category for every point, keys that actually match the categories,
 * the mirrored sign convention, and a screen-reader summary that describes the
 * same numbers.
 */

const dayNight: DayNightConfig = {
  mode: 'manual',
  manualDayStart: '06:00',
  manualDayEnd: '20:00',
};

/** A year of quarter-hourly records, one surplus and one deficit slot per day. */
function makeYear(year: number, days = 40): YearlyData {
  const records: EnergyRecord[] = [];
  for (let d = 0; d < days; d++) {
    const base = new Date(year, 0, 1 + d);
    records.push({
      timestamp: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0),
      consumption: 0.2,
      production: 3,
    });
    records.push({
      timestamp: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 21, 0),
      consumption: 2,
      production: 0,
    });
  }
  const { hasProduction, hasConsumption } = computeHasFlags(records);
  return {
    year,
    records,
    statistics: calculateYearStatistics(records, year),
    hasProduction,
    hasConsumption,
  };
}

const oneYear = new Map<number, YearlyData>([[2022, makeYear(2022)]]);
const twoYears = new Map<number, YearlyData>([
  [2022, makeYear(2022)],
  [2023, makeYear(2023)],
]);

/** One record a day for a whole year, so every month and week has a bucket. */
function makeFullYear(year: number, consumptionPerDay: number): YearlyData {
  const records: EnergyRecord[] = [];
  const cursor = new Date(year, 0, 1);
  while (cursor.getFullYear() === year) {
    records.push({
      timestamp: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 12, 0),
      consumption: consumptionPerDay,
      production: consumptionPerDay / 2,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  const { hasProduction, hasConsumption } = computeHasFlags(records);
  return {
    year,
    records,
    statistics: calculateYearStatistics(records, year),
    hasProduction,
    hasConsumption,
  };
}

// 2022: 1 kWh/den, 2023: 2 kWh/den, 2024: 3 kWh/den → průměr 2 kWh/den.
// Výroba je vždy polovina spotřeby, takže tato sada odebírá ze sítě víc,
// než do ní dodá — což je to, co potřebuje režim „net“.
const threeYears = new Map<number, YearlyData>([
  [2022, makeFullYear(2022, 1)],
  [2023, makeFullYear(2023, 2)],
  [2024, makeFullYear(2024, 3)],
]);

interface BuildOverrides {
  showConsumption?: boolean;
  showProduction?: boolean;
  consumptionSplit?: ConsumptionSplit;
  chartMode?: ChartMode;
  consumptionBelowAxis?: boolean;
}

function build(
  yearlyData: Map<number, YearlyData>,
  selectedYears: number[],
  aggregationType: AggregationType,
  overrides: BuildOverrides = {}
) {
  return buildChartSeries({
    yearlyData,
    selectedYears,
    aggregationType,
    showConsumption: true,
    showProduction: true,
    dayNightConfig: dayNight,
    consumptionSplit: 'sum',
    chartMode: 'balance',
    // Off by default, like the store: zrcadlení pod osu je volba uživatele.
    consumptionBelowAxis: false,
    ...overrides,
  });
}

/** Energie za jedním bodem grafu: `plotSign` vrací zrcadlení zpátky. */
function energyOf(series: ChartSeriesDef, index: number): number {
  return Number(series.data[index][1]) * series.plotSign;
}

describe('chartSeriesBuilder', () => {
  describe('isTimeAxisAggregation', () => {
    it('is true only for the two aggregations plotted against real time', () => {
      expect(isTimeAxisAggregation('raw')).toBe(true);
      expect(isTimeAxisAggregation('hourly')).toBe(true);
      for (const type of ['daily', 'weekly', 'monthly'] as AggregationType[]) {
        expect(isTimeAxisAggregation(type)).toBe(false);
      }
    });
  });

  describe('buildChartSeries', () => {
    it('returns nothing to draw when no year is selected', () => {
      expect(build(oneYear, [], 'daily')).toBeNull();
    });

    it('returns nothing to draw when there is no data at all', () => {
      expect(build(new Map(), [2022], 'daily')).toBeNull();
    });

    it('builds one consumption and one production series for a single year', () => {
      const result = build(oneYear, [2022], 'daily')!;
      expect(result.series.map((s) => s.name)).toEqual(['Spotřeba', 'Výroba']);
      expect(result.dates).toHaveLength(40);
      expect(result.series[0].data).toHaveLength(40);
    });

    it('every point key exists as an x-axis category', () => {
      // This is the contract that keeps the chart from collapsing into one column.
      const result = build(oneYear, [2022], 'daily')!;
      const categories = new Set(result.dates);
      for (const series of result.series) {
        for (const [key] of series.data) {
          expect(categories.has(String(key))).toBe(true);
        }
      }
    });

    it('keeps the categories sorted chronologically', () => {
      const result = build(oneYear, [2022], 'daily')!;
      const sorted = [...result.dates].sort();
      expect(result.dates).toEqual(sorted);
      expect(result.dates[0]).toBe('2022-01-01');
    });

    it('hides a series the user switched off', () => {
      const onlyConsumption = build(oneYear, [2022], 'daily', { showProduction: false })!;
      expect(onlyConsumption.series).toHaveLength(1);
      expect(onlyConsumption.series[0].name).toBe('Spotřeba');

      const neither = build(oneYear, [2022], 'daily', {
        showConsumption: false,
        showProduction: false,
      })!;
      expect(neither.series).toHaveLength(0);
    });

    it('normalises two years onto a shared month-day axis for comparison', () => {
      const result = build(twoYears, [2022, 2023], 'daily')!;
      // Four series: consumption and production for each year, named by year.
      expect(result.series).toHaveLength(4);
      expect(result.series.map((s) => s.name)).toEqual([
        'Spotřeba 2022',
        'Výroba 2022',
        'Spotřeba 2023',
        'Výroba 2023',
      ]);
      // Keys collapse to MM-DD so the years overlay each other.
      for (const key of result.dates) {
        expect(key).toMatch(/^\d{2}-\d{2}$/);
      }
      // Bars cannot be dashed, so the years are told apart by colour only.
      expect(result.series[0].lineDashed).toBeUndefined();
      expect(result.series[0].color).not.toBe(result.series[2].color);
    });

    it('uses distinct colours per year when comparing', () => {
      const result = build(twoYears, [2022, 2023], 'daily')!;
      expect(result.series[0].color).not.toBe(result.series[2].color);
    });

    /**
     * Regrese: týdenní osa se klíčovala měsícem a dnem pondělí, které se rok od
     * roku posouvá. 27. týden 2022 a 2024 tak padly do různých pásů tři dny od
     * sebe, v každém byl jediný rok a při zoomu se pás zdánlivě pohyboval.
     */
    it('týdenní porovnání má jeden pás na týden, ne pondělí každého roku', () => {
      const years = [2022, 2023, 2024];
      const result = build(threeYears, years, 'weekly', { showProduction: false })!;

      // Ne 3 × 53 kategorií, ale jeden pás na týden plus dva přesahy.
      expect(result.dates.length).toBeLessThanOrEqual(55);
      expect(result.dates.every((key) => /^W\d{2}$/.test(key))).toBe(true);

      // Kolik roků leží v každém pásu.
      const yearsPerCategory = new Map<string, number>();
      for (const series of result.series) {
        for (const [key] of series.data) {
          yearsPerCategory.set(String(key), (yearsPerCategory.get(String(key)) ?? 0) + 1);
        }
      }
      // Běžné týdny (bez přesahů na krajích) nesou všechny tři roky.
      const middle = result.dates.slice(1, -1);
      for (const key of middle) {
        expect(yearsPerCategory.get(key), `pás ${key}`).toBe(years.length);
      }

      // Kategorie jsou v kalendářním pořadí, přesahy na krajích.
      expect([...result.dates].sort()).toEqual(result.dates);
      expect(result.dates[0]).toBe('W00');
      expect(result.dates[result.dates.length - 1]).toBe('W54');
    });

    it('týdenní osa jednoho roku zůstane u data pondělí, které umí popsat', () => {
      const result = build(threeYears, [2024], 'weekly', { showProduction: false })!;
      // Jeden rok nepotřebuje sdílený klíč a osa může ukázat konkrétní datum.
      expect(result.dates[0]).toBe('2024-01-01');
      expect(result.dates.every((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))).toBe(true);
    });

    it('produces time-axis points for raw and hourly aggregation', () => {
      for (const type of ['raw', 'hourly'] as AggregationType[]) {
        const result = build(oneYear, [2022], type)!;
        for (const [x] of result.series[0].data) {
          expect(typeof x).toBe('number');
          expect(Number.isFinite(x as number)).toBe(true);
        }
      }
    });

    /**
     * Graf je překlopený kolem nuly: obě strany elektroměru jdou proti sobě,
     * což se čte na první pohled, kde se dva sloupce vzhůru musely porovnávat
     * očima. Znaménko je ale jen geometrie — energii z bodu dostane každý
     * odběratel násobením `plotSign`, takže se nikde neukáže negativní kWh.
     */
    it('bez přepínače stojí obě veličiny nad nulou', () => {
      const result = build(oneYear, [2022], 'daily')!;
      const [consumption, production] = result.series;

      expect(consumption.quantity).toBe('consumption');
      expect(consumption.plotSign).toBe(1);
      expect(consumption.data.every(([, value]) => Number(value) > 0)).toBe(true);
      expect(production.plotSign).toBe(1);

      // Den v `makeYear`: 0,2 + 2 kWh odběru, 3 kWh dodávky.
      expect(energyOf(consumption, 0)).toBeCloseTo(2.2, 6);
      expect(energyOf(production, 0)).toBeCloseTo(3, 6);

      // A rok, na který se odkazuje filtr i tooltip, nese každá série sama.
      expect(consumption.year).toBe(2022);
      expect(production.year).toBe(2022);
    });

    /**
     * Přepínač „Spotřeba pod osu“ mění jen kresbu. Proto se energie schovává za
     * `plotSign`: každé místo, které číslo ukazuje, ho jím vynásobí a dostane
     * tutéž kladnou hodnotu jako bez zrcadlení.
     */
    it('přepínač zrcadlí spotřebu pod nulu, energie zůstane stejná', () => {
      const upright = build(oneYear, [2022], 'daily')!;
      const mirrored = build(oneYear, [2022], 'daily', { consumptionBelowAxis: true })!;
      const [consumption, production] = mirrored.series;

      expect(consumption.plotSign).toBe(-1);
      expect(consumption.data.every(([, value]) => Number(value) < 0)).toBe(true);
      // Výroba zůstává nad nulou, zrcadlí se jen odebraná strana.
      expect(production.plotSign).toBe(1);
      expect(production.data.every(([, value]) => Number(value) > 0)).toBe(true);

      for (let i = 0; i < consumption.data.length; i++) {
        expect(energyOf(consumption, i)).toBeCloseTo(energyOf(upright.series[0], i), 6);
      }
    });

    /**
     * `sum` a `both` musí kreslit totožné sloupce — `both` jen navíc naplní
     * `splitByKey` pro tooltip. Kdyby se hodnoty lišily, uživatel by po zapnutí
     * rozpadu viděl jiný graf, než jaký si nechal rozepsat.
     */
    it('„both“ nemění sloupce, jen k nim přidá rozpad pro tooltip', () => {
      const sum = build(oneYear, [2022], 'daily', { consumptionSplit: 'sum' })!;
      const both = build(oneYear, [2022], 'daily', { consumptionSplit: 'both' })!;

      // Den a noc už netvoří stohované série – je to jedna série jako u `sum`.
      expect(both.series.map((s) => s.name)).toEqual(sum.series.map((s) => s.name));
      expect(both.series[0].data).toEqual(sum.series[0].data);
      expect(both.series[1].data).toEqual(sum.series[1].data);
    });

    it('„day“ a „night“ se sečtou na „sum“', () => {
      const sum = build(oneYear, [2022], 'daily', { consumptionSplit: 'sum' })!;
      const day = build(oneYear, [2022], 'daily', { consumptionSplit: 'day' })!;
      const night = build(oneYear, [2022], 'daily', { consumptionSplit: 'night' })!;

      // Data mají obě poloviny nenulové: 0,2 kWh ve 12:00 a 2 kWh ve 21:00
      // (ruční okno 06:00–20:00), takže test skutečně měří rozdělení.
      expect(energyOf(day.series[0], 0)).toBeCloseTo(0.2, 6);
      expect(energyOf(night.series[0], 0)).toBeCloseTo(2, 6);

      const whole = sum.series[0].data;
      expect(day.series[0].data).toHaveLength(whole.length);
      for (let i = 0; i < whole.length; i++) {
        expect(day.series[0].data[i][0]).toBe(whole[i][0]);
        expect(
          energyOf(day.series[0], i) + energyOf(night.series[0], i)
        ).toBeCloseTo(energyOf(sum.series[0], i), 6);
      }

      // Výroba se nedělí: panely po západu slunce do sítě nic nedodají, takže
      // ořezání spotřeby se jí nesmí dotknout.
      expect(day.series[1].data).toEqual(sum.series[1].data);
      expect(night.series[1].data).toEqual(sum.series[1].data);
    });

    it('splitByKey plní jen „both“, ostatní režimy ne', () => {
      const both = build(oneYear, [2022], 'daily', { consumptionSplit: 'both' })!;
      expect(both.splitByKey.size).toBe(40);
      const halves = both.splitByKey.get(splitLookupKey('2022-01-01', 2022))!;
      expect(halves.day).toBeCloseTo(0.2, 6);
      expect(halves.night).toBeCloseTo(2, 6);

      // `sum` rozpad nepotřebuje, `day`/`night` ho už mají zapečený v hodnotě.
      for (const split of ['sum', 'day', 'night'] as ConsumptionSplit[]) {
        expect(
          build(oneYear, [2022], 'daily', { consumptionSplit: split })!.splitByKey.size,
          `režim ${split}`
        ).toBe(0);
      }
    });

    it('při porovnání let má „both“ rozpad na každý rok zvlášť', () => {
      const result = build(twoYears, [2022, 2023], 'daily', { consumptionSplit: 'both' })!;

      // Rozdělení už nevytváří stohované série: dva roky = dvě spotřeby a dvě
      // výroby, stejně jako bez rozdělení.
      expect(result.series.map((s) => s.name)).toEqual([
        'Spotřeba 2022',
        'Výroba 2022',
        'Spotřeba 2023',
        'Výroba 2023',
      ]);
      // Klíč rozpadu nese rok, jinak by tooltip u porovnání let sáhl na
      // polovinu jiného roku – kategorie „01-01“ mají oba.
      expect(result.splitByKey.get(splitLookupKey('01-01', 2022))).toBeDefined();
      expect(result.splitByKey.get(splitLookupKey('01-01', 2023))).toBeDefined();
      expect(result.series[0].color).not.toBe(result.series[2].color);
    });

    /**
     * Režim „net“ odpovídá na jinou otázku než bilance: ne „kolik teklo kudy“,
     * ale „kolik jsem musel dokoupit“. Proto jedna série na rok a hodnota
     * spotřeba − výroba, kreslená pod nulou stejně jako spotřeba v bilanci.
     */
    it('režim „net“ kreslí jednu sérii na rok s dokoupenou energií', () => {
      const result = build(threeYears, [2024], 'daily', { chartMode: 'net' })!;

      expect(result.series).toHaveLength(1);
      const [net] = result.series;
      expect(net.name).toBe('Dokoupená energie');
      expect(net.quantity).toBe('net');
      expect(net.year).toBe(2024);

      // 2024: 3 kWh odběru a 1,5 kWh dodávky denně → 1,5 kWh dokoupeno.
      expect(energyOf(net, 0)).toBeCloseTo(1.5, 6);

      // Dokoupená energie je odebraná strana elektroměru, takže se zrcadlí
      // stejným přepínačem jako spotřeba.
      expect(net.plotSign).toBe(1);
      const mirrored = build(threeYears, [2024], 'daily', {
        chartMode: 'net',
        consumptionBelowAxis: true,
      })!;
      expect(mirrored.series[0].plotSign).toBe(-1);
      expect(mirrored.series[0].data.every(([, value]) => Number(value) < 0)).toBe(true);
      expect(energyOf(mirrored.series[0], 0)).toBeCloseTo(1.5, 6);

      // Přepínače veličin v tomto režimu nemají co vypnout – jedna série je
      // celý graf, takže je ignoruje.
      const switchedOff = build(threeYears, [2024], 'daily', {
        chartMode: 'net',
        showConsumption: false,
        showProduction: false,
      })!;
      expect(switchedOff.series.map((s) => s.name)).toEqual(['Dokoupená energie']);
    });

    it('režim „net“ má jednu sérii na každý vybraný rok', () => {
      const result = build(threeYears, [2022, 2023, 2024], 'monthly', { chartMode: 'net' })!;
      expect(result.series.map((s) => s.name)).toEqual([
        'Dokoupená energie 2022',
        'Dokoupená energie 2023',
        'Dokoupená energie 2024',
      ]);
      expect(result.series.map((s) => s.year)).toEqual([2022, 2023, 2024]);
    });

    it('přebytek nad odběrem vyjde v režimu „net“ na opačnou stranu nuly', () => {
      // `oneYear` dodá do sítě víc (3 kWh/den), než z ní odebere (2,2 kWh/den),
      // takže „dokoupeno“ je negativní.
      const result = build(oneYear, [2022], 'daily', { chartMode: 'net' })!;
      expect(energyOf(result.series[0], 0)).toBeCloseTo(-0.8, 6);
      // Bez zrcadlení leží přebytek pod nulou, se zrcadlením nad ní.
      expect(result.series[0].data.every(([, value]) => Number(value) < 0)).toBe(true);

      const mirrored = build(oneYear, [2022], 'daily', {
        chartMode: 'net',
        consumptionBelowAxis: true,
      })!;
      expect(mirrored.series[0].data.every(([, value]) => Number(value) > 0)).toBe(true);
    });

    it('sloupcová zobrazení nekreslí plochu pod čarou, časová osa ano', () => {
      // Pole `stack` a `role` zmizela s rozpadem na stohované série; sloupce
      // se dnes od sebe liší jen barvou a stranou nuly.
      const bars = build(oneYear, [2022], 'daily')!;
      expect(bars.series.every((s) => s.areaStyle === undefined)).toBe(true);
      expect(bars.series.every((s) => s.lineDashed === undefined)).toBe(true);

      const lines = build(twoYears, [2022, 2023], 'hourly')!;
      expect(lines.series.every((s) => s.areaStyle?.opacity === 0.1)).toBe(true);
      // Starší rok je při porovnání čárkovaný, nejnovější plný.
      expect(lines.series.filter((s) => s.year === 2022).every((s) => s.lineDashed)).toBe(true);
      expect(lines.series.filter((s) => s.year === 2023).every((s) => !s.lineDashed)).toBe(true);
    });

    it('draws every calendar aggregation as bars and the time axis as lines', () => {
      for (const type of ['daily', 'weekly', 'monthly'] as AggregationType[]) {
        expect(build(oneYear, [2022], type)!.series[0].type).toBe('bar');
      }
      for (const type of ['raw', 'hourly'] as AggregationType[]) {
        expect(build(oneYear, [2022], type)!.series[0].type).toBe('line');
      }
    });
  });

  describe('seriesAverage', () => {
    it('průměruje přes všechny body všech předaných sérií', () => {
      const chartData = build(oneYear, [2022], 'daily')!;
      const [consumption, production] = chartData.series;

      // Průměr je hodnota pro `markLine`, tedy v souřadnicích grafu: se
      // zapnutým zrcadlením je u spotřeby negativní, bez něj kladný.
      expect(seriesAverage([consumption])).toBeCloseTo(2.2, 6);
      expect(seriesAverage([production])).toBeCloseTo(3, 6);
      const mirrored = build(oneYear, [2022], 'daily', { consumptionBelowAxis: true })!;
      expect(seriesAverage([mirrored.series[0]])).toBeCloseTo(-2.2, 6);

      // Průměr přes obě série je průměr všech 80 bodů, ne průměr dvou průměrů
      // (tady vyjde stejně, protože obě série mají 40 bodů).
      const all = [...consumption.data, ...production.data];
      const expected = all.reduce((sum, [, v]) => sum + Number(v), 0) / all.length;
      expect(seriesAverage([consumption, production])).toBeCloseTo(expected, 6);
    });

    it('bez bodů nemá co průměrovat a vrátí null', () => {
      expect(seriesAverage([])).toBeNull();
      // Série existuje, ale je prázdná – i to je „není z čeho počítat“.
      const empty = build(oneYear, [2022], 'daily')!.series[0];
      expect(seriesAverage([{ ...empty, data: [] }])).toBeNull();
    });
  });

  describe('buildAccessibleChartSummary', () => {
    it('describes each series with the same numbers the chart draws', () => {
      const chartData = build(oneYear, [2022], 'daily')!;
      const summary = buildAccessibleChartSummary(chartData);

      expect(summary).toHaveLength(2);
      expect(summary[0].name).toBe('Spotřeba');
      expect(summary[0].count).toBe(40);
      // 40 days × (0.2 + 2) kWh = 88 kWh of grid import. Souhrn mluví o
      // energii, ne o geometrii, takže znaménko se tady vrací zpátky.
      expect(summary[0].total).toMatch(/88/);
      expect(summary[0].total).not.toContain('−');
      expect(summary[0].total).not.toContain('-');
      expect(summary[0].firstPoints).toContain('1. 1. 2022');
      expect(summary[0].lastPoints).toBeTruthy();
    });

    it('returns an empty list when there is no chart', () => {
      expect(buildAccessibleChartSummary(null)).toEqual([]);
    });
  });

  describe('computeBrushDateRange', () => {
    const dates = ['2022-01-01', '2022-01-02', '2022-01-03', '2022-01-04'];

    it('reads a time-axis brush straight from the coordinate range', () => {
      const start = new Date(2022, 0, 1, 8, 0).getTime();
      const end = new Date(2022, 0, 3, 8, 0).getTime();
      const range = computeBrushDateRange({ coordRange: [start, end] }, 'raw', 1, dates)!;
      expect(range.start.getTime()).toBe(start);
      expect(range.end.getTime()).toBe(end);
    });

    it('maps category indices to whole days, end inclusive', () => {
      const range = computeBrushDateRange({ coordRange: [0, 2] }, 'daily', 1, dates)!;
      expect(range.start.getDate()).toBe(1);
      expect(range.end.getDate()).toBe(3);
      expect(range.end.getHours()).toBe(23);
    });

    it('handles a brush dragged right to left', () => {
      const range = computeBrushDateRange({ coordRange: [3, 1] }, 'daily', 1, dates)!;
      expect(range.start.getTime()).toBeLessThan(range.end.getTime());
    });

    it('refuses a multi-year comparison, where an index is not one date', () => {
      expect(computeBrushDateRange({ coordRange: [0, 2] }, 'daily', 2, dates)).toBeNull();
    });

    it('refuses malformed input', () => {
      expect(computeBrushDateRange(undefined, 'daily', 1, dates)).toBeNull();
      expect(computeBrushDateRange({}, 'daily', 1, dates)).toBeNull();
      expect(computeBrushDateRange({ coordRange: [0, 2] }, 'daily', 1, [])).toBeNull();
    });
  });

  /**
   * Zoom je dnes výběr: rozsah, na který uživatel graf přiblíží, je rozsah,
   * který můžou následovat statistiky i simulace baterie. Proto se z okna
   * ECharts musí dát spočítat konkrétní interval — a musí být poznat, kdy to
   * nejde.
   */
  describe('computeZoomDateRange', () => {
    const dates = ['2022-01-01', '2022-01-02', '2022-01-03', '2022-01-04'];

    it('časová osa vezme rozsah přímo ze startValue a endValue', () => {
      const start = new Date(2022, 0, 1, 8, 0).getTime();
      const end = new Date(2022, 0, 3, 8, 0).getTime();
      const range = computeZoomDateRange(
        { startValue: start, endValue: end },
        'hourly',
        1,
        dates
      )!;
      expect(range.start.getTime()).toBe(start);
      expect(range.end.getTime()).toBe(end);
    });

    it('kategoriální osa jednoho roku spočítá rozsah z indexů', () => {
      const range = computeZoomDateRange({ startValue: 1, endValue: 2 }, 'daily', 1, dates)!;
      expect(range.start.getDate()).toBe(2);
      expect(range.end.getDate()).toBe(3);
      // Konec je včetně celého dne, jinak by výseč utnula poslední sloupec.
      expect(range.end.getHours()).toBe(23);
    });

    it('porovnání více let vrátí null – index nepatří žádnému konkrétnímu roku', () => {
      expect(computeZoomDateRange({ startValue: 1, endValue: 2 }, 'daily', 3, dates)).toBeNull();
      expect(
        computeZoomDateRange({ startValue: 1, endValue: 2 }, 'monthly', 2, ['01-01', '02-01'])
      ).toBeNull();
    });

    it('bez hodnot okna není co spočítat', () => {
      expect(computeZoomDateRange(undefined, 'daily', 1, dates)).toBeNull();
      expect(computeZoomDateRange({ start: 0, end: 100 }, 'daily', 1, dates)).toBeNull();
      expect(computeZoomDateRange({ startValue: 1 }, 'daily', 1, dates)).toBeNull();
    });
  });

  describe('formatZoomWindowLabel', () => {
    const dates = ['2022-01-01', '2022-01-02', '2022-01-03', '2022-01-04'];

    it('jeden rok popíše výseč konkrétními datumy', () => {
      expect(formatZoomWindowLabel({ startValue: 1, endValue: 3 }, 'daily', 1, dates)).toBe(
        '2. 1. 2022 – 4. 1. 2022'
      );
    });

    it('při porovnání let padá na názvy kategorií, protože datum neexistuje', () => {
      // Index v porovnání let patří všem rokům zároveň (viz
      // computeZoomDateRange), ale „20.–30. týden“ řekne, co je na obrazovce.
      const weeks = ['W20', 'W21', 'W22', 'W23'];
      expect(formatZoomWindowLabel({ startValue: 0, endValue: 3 }, 'weekly', 4, weeks)).toBe(
        '20. – 23.'
      );
    });

    it('jedna kategorie se nepíše dvakrát', () => {
      const weeks = ['W20', 'W21'];
      expect(formatZoomWindowLabel({ startValue: 0, endValue: 0 }, 'weekly', 4, weeks)).toBe(
        '20.'
      );
    });

    it('bez okna, bez kategorií a na časové ose porovnání let nemá popisek', () => {
      expect(formatZoomWindowLabel(undefined, 'daily', 1, dates)).toBeNull();
      expect(formatZoomWindowLabel({ startValue: 0, endValue: 1 }, 'weekly', 4, [])).toBeNull();
      // Časová osa bez použitelných hodnot: fallback na kategorie tam nedává smysl.
      expect(formatZoomWindowLabel({ startValue: 5, endValue: 5 }, 'raw', 2, dates)).toBeNull();
    });
  });

  describe('isZoomedWindow', () => {
    it('je pravda, jen když graf ukazuje méně než celý rozsah', () => {
      expect(isZoomedWindow({ start: 10, end: 90 })).toBe(true);
      expect(isZoomedWindow({ start: 0, end: 50 })).toBe(true);
      expect(isZoomedWindow({ start: 50, end: 100 })).toBe(true);
      expect(isZoomedWindow({ start: 0, end: 100 })).toBe(false);
      expect(isZoomedWindow(null)).toBe(false);
      expect(isZoomedWindow(undefined)).toBe(false);
    });

    it('vrácení slideru na kraj se nepočítá jako zoom', () => {
      // Tažení slideru zpátky na okraj skončí na 0,0001 místo přesné nuly;
      // bez tolerance by nad grafem zůstal viset popisek výseče.
      expect(isZoomedWindow({ start: 0.0001, end: 99.9999 })).toBe(false);
    });
  });

  describe('computeNightMarkAreas', () => {
    const sunConfig: DayNightConfig = {
      mode: 'sun',
      manualDayStart: '06:00',
      manualDayEnd: '20:00',
      location: getDefaultLocation(),
    };

    it('produces one night band per day', () => {
      const areas = computeNightMarkAreas(new Date(2022, 5, 1), new Date(2022, 5, 5), sunConfig);
      expect(areas.length).toBeGreaterThanOrEqual(4);
      for (const [from, to] of areas) {
        expect(from.xAxis).toBeLessThan(to.xAxis);
      }
    });

    it('bands the manual window when that mode is chosen', () => {
      // The band runs from 20:00 to 06:00 the next morning, so the same hours
      // the statistics count as night.
      const areas = computeNightMarkAreas(new Date(2022, 5, 2), new Date(2022, 5, 3), dayNight);
      expect(areas.length).toBeGreaterThanOrEqual(1);
      const [from, to] = areas[0];
      expect(new Date(from.xAxis).getHours()).toBe(20);
      expect(new Date(to.xAxis).getHours()).toBe(6);
    });

    it('bails out on ranges too long to be worth drawing', () => {
      const areas = computeNightMarkAreas(new Date(2020, 0, 1), new Date(2023, 0, 1), sunConfig);
      expect(areas).toEqual([]);
    });
  });

  describe('buildSeriesFilterChips', () => {
    const chipsFor = (
      overrides: Partial<Parameters<typeof buildSeriesFilterChips>[0]> = {}
    ) =>
      buildSeriesFilterChips({
        availableYears: [2022, 2023],
        selectedYears: [2022, 2023],
        showConsumption: true,
        showProduction: true,
        chartMode: 'balance',
        hiddenSeries: [],
        ...overrides,
      });

    /**
     * The contract that makes the filter work at all: a chip's `seriesName` is
     * the name the chart gives that series, so `hiddenSeries` matches. Two
     * copies of the naming rule would drift and the chips would stop hiding
     * anything.
     */
    it('names and colors match the series the chart draws', () => {
      for (const aggregation of ['raw', 'hourly', 'daily', 'monthly'] as AggregationType[]) {
        // Rozdělení na den a noc už série nepřidává, ale režim grafu ano —
        // proto se prochází `chartMode`, ne `showDayNight`.
        for (const chartMode of ['balance', 'net'] as ChartMode[]) {
          for (const consumptionSplit of ['sum', 'both'] as ConsumptionSplit[]) {
            for (const selectedYears of [[2022], [2022, 2023]]) {
              const built = build(twoYears, selectedYears, aggregation, {
                chartMode,
                consumptionSplit,
              });
              const chips = chipsFor({ selectedYears, chartMode });

              for (const series of built!.series) {
                const chip = chips.find((c) => c.seriesName === series.name);
                expect(
                  chip,
                  `chybí čip pro sérii "${series.name}" (${aggregation}, ${chartMode}, ${consumptionSplit})`
                ).toBeDefined();
                expect(chip!.color).toBe(series.color);
                expect(chip!.quantity).toBe(series.quantity);
                expect(chip!.label).toBe(series.legendLabel);
                expect(chip!.active).toBe(true);
              }
            }
          }
        }
      }
    });

    it('lists every imported year, not just the selected ones', () => {
      const chips = chipsFor({ selectedYears: [2023] });

      expect(chips.filter((c) => c.year === 2022).map((c) => c.offReason)).toEqual([
        'year-not-selected',
        'year-not-selected',
      ]);
      expect(chips.filter((c) => c.year === 2023).every((c) => c.active)).toBe(true);
    });

    it('marks a whole row off when its quantity switch is off', () => {
      const chips = chipsFor({ showProduction: false });

      const production = chips.filter((c) => c.quantity === 'production');
      expect(production).toHaveLength(2);
      expect(production.every((c) => c.offReason === 'quantity-off')).toBe(true);
      expect(chips.filter((c) => c.quantity === 'consumption').every((c) => c.active)).toBe(true);
    });

    it('reports a series clicked off in the filter as hidden', () => {
      const chips = chipsFor({ hiddenSeries: ['Spotřeba 2022'] });

      const hidden = chips.find((c) => c.seriesName === 'Spotřeba 2022')!;
      expect(hidden.offReason).toBe('hidden');
      expect(hidden.active).toBe(false);
    });

    /**
     * Den a noc už ve filtru nemají svůj čip: rozdělení nevytváří sérii, jen
     * doplní tooltip. Řádky filtru tak odpovídají veličinám, které graf kreslí
     * — v bilanci dvě, v režimu „net“ jedna.
     */
    it('řádky čipů odpovídají režimu grafu, ne rozdělení na den a noc', () => {
      const balance = chipsFor();
      expect(balance.map((c) => c.label)).toEqual(['2022', '2023', '2022', '2023']);
      expect(new Set(balance.map((c) => c.quantity))).toEqual(
        new Set(['consumption', 'production'])
      );

      const net = chipsFor({ chartMode: 'net' });
      expect(net.map((c) => c.seriesName)).toEqual([
        'Dokoupená energie 2022',
        'Dokoupená energie 2023',
      ]);
      // Jedna série je celý graf, takže ji nemá cenu nabízet k vypnutí řádkem.
      expect(net.every((c) => c.quantity === 'net')).toBe(true);
      expect(chipsFor({ chartMode: 'net', showConsumption: false, showProduction: false })
        .every((c) => c.active)).toBe(true);
    });
  });

  describe('buildUnitComparison', () => {
    const indexFor = (
      overrides: Partial<Parameters<typeof buildUnitComparison>[0]> = {}
    ) =>
      buildUnitComparison({
        yearlyData: threeYears,
        availableYears: [2022, 2023, 2024],
        selectedYears: [2024],
        aggregationType: 'monthly',
        consumptionSplit: 'sum',
        dayNightConfig: dayNight,
        ...overrides,
      });

    it('exists only for aggregations whose unit repeats every year', () => {
      expect(isComparableUnitAggregation('weekly')).toBe(true);
      expect(isComparableUnitAggregation('monthly')).toBe(true);
      for (const type of ['raw', 'hourly', 'daily'] as AggregationType[]) {
        expect(isComparableUnitAggregation(type)).toBe(false);
        expect(indexFor({ aggregationType: type })).toBeNull();
      }
    });

    it('má dvanáct měsíců v kalendářním pořadí', () => {
      const index = indexFor()!;
      expect(index.units.map((u) => u.label)).toEqual([
        'Leden',
        'Únor',
        'Březen',
        'Duben',
        'Květen',
        'Červen',
        'Červenec',
        'Srpen',
        'Září',
        'Říjen',
        'Listopad',
        'Prosinec',
      ]);
    });

    /**
     * Jádro funkce: v grafu je jeden rok, ale porovnávat je potřeba se všemi
     * nahranými. Kdyby se bralo jen z vybraných roků, tooltip by ukázal jediné
     * číslo a průměr sám sebe.
     */
    it('nese všechny nahrané roky, i když je v grafu jeden', () => {
      const index = indexFor({ selectedYears: [2024] })!;
      // Leden má 31 dnů: 31, 62 a 93 kWh; průměr 62.
      const january = index.units[0];

      expect(january.consumption.rows.map((r) => r.year)).toEqual([2022, 2023, 2024]);
      expect(january.consumption.rows.map((r) => r.value)).toEqual([31, 62, 93]);
      expect(january.consumption.average).toBe(62);
    });

    it('rok, který graf nekreslí, je bez barvy – tooltip ho odliší', () => {
      const index = indexFor({ selectedYears: [2024] })!;
      const january = index.units[0];

      const byYear = new Map(january.consumption.rows.map((r) => [r.year, r]));
      expect(byYear.get(2024)!.color).not.toBeNull();
      expect(byYear.get(2022)!.color).toBeNull();
      expect(byYear.get(2023)!.color).toBeNull();
    });

    it('odchylka od průměru je v procentech, se znaménkem podle strany', () => {
      const index = indexFor()!;
      const january = index.units[0];
      const byYear = new Map(january.consumption.rows.map((r) => [r.year, r]));

      // 31 z průměru 62 je −50 %, 93 je +50 %, 62 je přesně průměr.
      expect(byYear.get(2022)!.vsAverage).toBeCloseTo(-50, 6);
      expect(byYear.get(2023)!.vsAverage).toBeCloseTo(0, 6);
      expect(byYear.get(2024)!.vsAverage).toBeCloseTo(50, 6);
    });

    it('klíčem je kategorie osy, takže tooltip najde, na co se míří', () => {
      // Jeden rok: kategorie je celé datum začátku měsíce.
      const single = indexFor({ selectedYears: [2024] })!;
      expect(single.byCategory.get('2024-07-01')?.label).toBe('Červenec');
      // Nevybraný rok na osu nic nepřidá.
      expect(single.byCategory.has('2022-07-01')).toBe(false);

      // Porovnání let: kategorie je měsíc-den, roky leží na sobě.
      const compare = indexFor({ selectedYears: [2022, 2024] })!;
      expect(compare.byCategory.get('07-01')?.label).toBe('Červenec');
      expect(compare.byCategory.get('2024-07-01')).toBeUndefined();
    });

    /**
     * Porovnání visí na sloupcích, takže musí odpovídat na stejnou otázku jako
     * ony: „net“ je rozdíl obou stran a poloviny dne mají svou skupinu, aby
     * tooltip u rozpadu nemusel počítat sám.
     */
    it('nese i dokoupenou energii a obě poloviny dne', () => {
      const index = buildUnitComparison({
        yearlyData: twoYears,
        availableYears: [2022, 2023],
        selectedYears: [2022, 2023],
        aggregationType: 'monthly',
        consumptionSplit: 'both',
        dayNightConfig: dayNight,
      })!;
      const january = index.units[0];
      const at = (group: UnitQuantityComparison, year: number) =>
        group.rows.find((r) => r.year === year)!.value;

      // Leden `makeYear`: 31 × (0,2 + 2) kWh odběru a 31 × 3 kWh dodávky.
      expect(at(january.consumption, 2022)).toBeCloseTo(68.2, 6);
      expect(at(january.production, 2022)).toBeCloseTo(93, 6);
      // Dokoupeno = odběr − dodávka, tedy tady přebytek (negativní).
      expect(at(january.net, 2022)).toBeCloseTo(68.2 - 93, 6);
      // Poloviny dne se sečtou na celou spotřebu (ruční okno 06:00–20:00).
      expect(at(january.consumptionDay, 2022)).toBeCloseTo(6.2, 6);
      expect(at(january.consumptionNight, 2022)).toBeCloseTo(62, 6);
      expect(
        at(january.consumptionDay, 2022) + at(january.consumptionNight, 2022)
      ).toBeCloseTo(at(january.consumption, 2022), 6);
    });

    it('ořezání na polovinu dne ořeže i porovnání, jinak by odpovídalo jinak než sloupce', () => {
      const night = buildUnitComparison({
        yearlyData: twoYears,
        availableYears: [2022, 2023],
        selectedYears: [2022],
        aggregationType: 'monthly',
        consumptionSplit: 'night',
        dayNightConfig: dayNight,
      })!;
      const january = night.units[0];
      // Jen noční část: 31 × 2 kWh, ne 31 × 2,2 kWh.
      expect(january.consumption.rows.find((r) => r.year === 2022)!.value).toBeCloseTo(62, 6);
    });

    it('týdenní zobrazení porovnává čísla týdnů, ne data pondělků', () => {
      const index = indexFor({ aggregationType: 'weekly', selectedYears: [2024] })!;

      // Pondělí 27. týdne padne v každém roce na jiné datum, číslo týdne ne.
      const week27 = index.units.find((u) => u.label === '27. týden')!;
      expect(week27.consumption.rows.map((r) => r.year)).toEqual([2022, 2023, 2024]);
      // Celý týden při 1, 2 a 3 kWh/den: 7, 14 a 21 kWh, průměr 14.
      expect(week27.consumption.rows.map((r) => r.value)).toEqual([7, 14, 21]);
      expect(week27.consumption.average).toBe(14);
    });

    /**
     * Rok nezačíná ani nekončí v pondělí, takže jeho první a poslední týdenní
     * kus patří ISO týdnu souseda. Dostanou vlastní pás na každém konci osy —
     * kdyby se přilepily k sousednímu týdnu, nafoukly by první nebo poslední
     * sloupec roku o pár dnů a v porovnání by to vypadalo jako skutečný rozdíl.
     */
    it('týden na přelomu roku dostane vlastní pás na každém konci osy', () => {
      const index = indexFor({
        aggregationType: 'weekly',
        selectedYears: [2022, 2023, 2024],
      })!;

      // 1. 1. 2022 byla sobota a 1. 1. 2023 nedělě: ty dny dokončují týden
      // z prosince předchozího roku, který v datech není.
      const carryIn = index.units.find((u) => u.label.startsWith('Začátek roku'))!;
      const carryInByYear = new Map(carryIn.consumption.rows.map((r) => [r.year, r]));
      expect(carryInByYear.get(2022)!.value).toBe(2); // 1.–2. 1. po 1 kWh
      expect(carryInByYear.get(2023)!.value).toBe(2); // 1. 1. za 2 kWh
      expect(carryInByYear.has(2024)).toBe(false); // 1. 1. 2024 bylo pondělí

      // 30. 12. 2024 bylo pondělí, jeho týden je 1. týden 2025.
      const carryOut = index.units.find((u) => u.label.startsWith('Konec roku'))!;
      const carryOutByYear = new Map(carryOut.consumption.rows.map((r) => [r.year, r]));
      expect(carryOutByYear.get(2024)!.value).toBe(6); // 30.–31. 12. po 3 kWh

      // Přesahy jsou na krajích osy, mezi nimi jsou jen celé týdny.
      expect(index.units[0].label.startsWith('Začátek roku')).toBe(true);
      expect(index.units[index.units.length - 1].label.startsWith('Konec roku')).toBe(true);

      // A hlavně: 52. týden 2022 zůstane šestidenní (26.–31. 12.), nepřilepí
      // se k němu 1. 1. 2023.
      const week52 = index.units.find((u) => u.label === '52. týden')!;
      const week52ByYear = new Map(week52.consumption.rows.map((r) => [r.year, r]));
      expect(week52ByYear.get(2022)!.value).toBe(6);
      expect(week52ByYear.get(2022)!.rangeLabel).toBe('26. 12. – 1. 1.');
    });

    it('u týdnů řekne každý rok, které dny sečetl', () => {
      const index = indexFor({ aggregationType: 'weekly', selectedYears: [2024] })!;
      const week27 = index.units.find((u) => u.label === '27. týden')!;

      // Pondělí 27. týdne padne v každém roce na jiné datum, proto to musí být
      // v řádku, ne v hlavičce.
      const ranges = new Map(week27.consumption.rows.map((r) => [r.year, r.rangeLabel]));
      expect(ranges.get(2022)).toBe('4. 7. – 10. 7.');
      expect(ranges.get(2023)).toBe('3. 7. – 9. 7.');
      expect(ranges.get(2024)).toBe('1. 7. – 7. 7.');
    });

    it('měsíc rozsah nepotřebuje, název měsíce je rozsah', () => {
      const index = indexFor({ aggregationType: 'monthly' })!;
      expect(index.units[6].consumption.rows.every((r) => r.rangeLabel === undefined)).toBe(true);
    });
  });

  describe('formatCategoryAxisLabel', () => {
    it('jeden rok popisuje první den období', () => {
      expect(formatCategoryAxisLabel('2024-07-01', false, 'monthly')).toBe('1. 7.');
      expect(formatCategoryAxisLabel('2024-07-01', false, 'weekly')).toBe('1. 7.');
    });

    it('při porovnání let ukáže měsíc-den u měsíců a číslo u týdnů', () => {
      expect(formatCategoryAxisLabel('07-01', true, 'monthly')).toBe('1. 7.');
      expect(formatCategoryAxisLabel('W27', true, 'weekly')).toBe('27.');
      expect(formatCategoryAxisLabel('W01', true, 'weekly')).toBe('1.');
    });

    it('přesahy na přelomu roku pojmenuje, protože číslo týdne se rok od roku liší', () => {
      expect(formatCategoryAxisLabel('W00', true, 'weekly')).toBe('přelom');
      expect(formatCategoryAxisLabel('W54', true, 'weekly')).toBe('přelom');
    });
  });

  /** Skupina porovnání s jedním řádkem na rok, jen pro fixtures níž. */
  function group(
    rows: Array<{ year: number; value: number; color: string | null; vsAverage: number | null }>,
    average: number
  ): UnitQuantityComparison {
    return { rows, average };
  }

  const EMPTY_GROUP: UnitQuantityComparison = { rows: [], average: 0 };

  /** Minimální definice série – jen pole, která tooltip čte. */
  function seriesDef(
    quantity: SeriesQuantity,
    year: number,
    name: string,
    plotSign: 1 | -1
  ): ChartSeriesDef {
    return {
      name,
      type: 'bar',
      data: [],
      color: '#abc',
      quantity,
      year,
      plotSign,
      legendLabel: String(year),
    };
  }

  describe('unitGroups', () => {
    const unit: UnitComparison = {
      label: 'Červenec',
      consumption: group([{ year: 2024, value: 200, color: '#abc', vsAverage: 0 }], 200),
      production: group([{ year: 2024, value: 80, color: '#def', vsAverage: 0 }], 80),
      net: group([{ year: 2024, value: 120, color: '#fed', vsAverage: 0 }], 120),
      consumptionDay: group([{ year: 2024, value: 150, color: '#abc', vsAverage: 0 }], 150),
      consumptionNight: group([{ year: 2024, value: 50, color: '#abc', vsAverage: 0 }], 50),
    };

    it('režim „net“ má jedinou skupinu', () => {
      // Graf kreslí jednu sérii, takže rozklad na odběr a dodávku by v tooltipu
      // odpovídal na otázku, kterou uživatel právě nemá na obrazovce.
      const groups = unitGroups(unit, {
        chartMode: 'net',
        consumptionSplit: 'both',
        hasConsumption: true,
        hasProduction: true,
      });
      expect(groups.map((g) => g.label)).toEqual(['Dokoupená energie']);
      expect(groups[0].comparison).toBe(unit.net);
    });

    it('„both“ přidá skupinu dne a noci pod spotřebu', () => {
      const groups = unitGroups(unit, {
        chartMode: 'balance',
        consumptionSplit: 'both',
        hasConsumption: true,
        hasProduction: true,
      });
      expect(groups.map((g) => g.label)).toEqual([
        'Spotřeba',
        'Spotřeba ve dne',
        'Spotřeba v noci',
        'Výroba',
      ]);
    });

    it('bez rozdělení jsou skupiny jen ty veličiny, které graf kreslí', () => {
      expect(
        unitGroups(unit, {
          chartMode: 'balance',
          consumptionSplit: 'sum',
          hasConsumption: true,
          hasProduction: true,
        }).map((g) => g.label)
      ).toEqual(['Spotřeba', 'Výroba']);

      // Vypnutá veličina nemá skupinu – ani ty poloviny dne, které pod ni patří.
      expect(
        unitGroups(unit, {
          chartMode: 'balance',
          consumptionSplit: 'both',
          hasConsumption: false,
          hasProduction: true,
        }).map((g) => g.label)
      ).toEqual(['Výroba']);

      expect(
        unitGroups(unit, {
          chartMode: 'balance',
          consumptionSplit: 'sum',
          hasConsumption: true,
          hasProduction: false,
        }).map((g) => g.label)
      ).toEqual(['Spotřeba']);
    });
  });

  describe('createChartTooltipFormatter', () => {
    const unit: UnitComparison = {
      label: 'Červenec',
      consumption: group(
        [
          { year: 2022, value: 100, color: null, vsAverage: -33.3 },
          { year: 2024, value: 200, color: '#abc', vsAverage: 33.3 },
        ],
        150
      ),
      production: group([{ year: 2024, value: 80, color: '#def', vsAverage: 0 }], 80),
      net: group([{ year: 2024, value: 120, color: '#fed', vsAverage: 0 }], 120),
      consumptionDay: EMPTY_GROUP,
      consumptionNight: EMPTY_GROUP,
    };
    const index = { byCategory: new Map([['2024-07-01', unit]]), units: [unit] };

    const consumptionSeries = seriesDef('consumption', 2024, 'Spotřeba', -1);
    const productionSeries = seriesDef('production', 2024, 'Výroba', 1);

    // Spotřeba je v datech negativní, tooltip z ní musí udělat energii.
    const params = [
      {
        axisValue: '2024-07-01',
        axisValueLabel: '1. 7.',
        seriesName: 'Spotřeba',
        value: -200,
      },
    ];

    const format = (
      overrides: Partial<Parameters<typeof createChartTooltipFormatter>[0]> = {}
    ) =>
      createChartTooltipFormatter({
        unitComparison: index,
        series: [consumptionSeries, productionSeries],
        splitByKey: new Map(),
        consumptionSplit: 'sum',
        chartMode: 'balance',
        ...overrides,
      });

    it('vypíše jednotku, všechny roky, průměr a odchylku', () => {
      const html = format()(params);

      expect(html).toContain('Červenec');
      expect(html).toContain('2022');
      expect(html).toContain('2024');
      // Průměr je označený a spočítaný z počtu let, ne ze všech nahraných.
      expect(html).toContain('Ø 2 let');
      // Čísla jdou přes formátování cs-CZ, ne přes toFixed.
      expect(html).toContain('150,0 kWh');
      // Nad průměrem ▲, pod průměrem ▼.
      expect(html).toContain('▼');
      expect(html).toContain('▲');
      expect(html).toContain('−33,3 %');
      expect(html).toContain('+33,3 %');
      // Obě veličiny mají svůj nadpis.
      expect(html).toContain('Spotřeba');
      expect(html).toContain('Výroba');
    });

    /**
     * Které veličiny tooltip vypíše, se dnes bere ze sérií, které graf kreslí —
     * ne z dvojice přepínačů. Filtr může vypnout jednotlivý rok i celý řádek
     * a tooltip má odpovídat tomu, co je na obrazovce.
     */
    it('vynechá veličinu, kterou graf právě nekreslí', () => {
      const html = format({ series: [consumptionSeries] })(params);

      expect(html).toContain('Spotřeba');
      expect(html).not.toContain('Výroba');
    });

    it('v režimu „net“ vypíše jen dokoupenou energii', () => {
      const html = format({
        chartMode: 'net',
        series: [seriesDef('net', 2024, 'Dokoupená energie', -1)],
      })(params);

      expect(html).toContain('Dokoupená energie');
      expect(html).not.toContain('Výroba');
    });

    it('bez porovnání jednotek vypíše sérii, na které uživatel stojí, jako energii', () => {
      const html = format({ unitComparison: null })(params);

      expect(html).toContain('1. 7.');
      expect(html).toContain('Spotřeba');
      // −200 v datech je 200 kWh odebraných ze sítě; negativní kWh uživatel nikdy nevidí.
      expect(html).toContain('200,00 kWh');
      expect(html).not.toContain('−200');
      expect(html).not.toContain('Ø');
    });

    it('při „both“ dopíše k sérii spotřeby denní a noční polovinu', () => {
      const html = format({
        unitComparison: null,
        consumptionSplit: 'both',
        splitByKey: new Map([
          [splitLookupKey('2024-07-01', 2024), { day: 150, night: 50 }],
        ]),
      })(params);

      expect(html).toContain('ve dne 150,00 kWh');
      expect(html).toContain('v noci 50,00 kWh');
    });

    it('bez bodů nemá co vypsat', () => {
      expect(format()([])).toBe('');
      expect(format()(undefined)).toBe('');
    });
  });

  describe('buildUnitComparisonRows', () => {
    const options = {
      chartMode: 'balance' as ChartMode,
      consumptionSplit: 'sum' as ConsumptionSplit,
      hasConsumption: true,
      hasProduction: true,
    };

    it('je prázdné, když porovnání jednotek neexistuje', () => {
      expect(buildUnitComparisonRows(null, options)).toEqual([]);
    });

    it('vyplní textovou alternativu stejnými čísly jako tooltip', () => {
      const unit: UnitComparison = {
        label: 'Červenec',
        consumption: group(
          [
            { year: 2022, value: 100, color: null, vsAverage: -33.3 },
            { year: 2024, value: 200, color: '#abc', vsAverage: 33.3 },
          ],
          150
        ),
        production: EMPTY_GROUP,
        net: EMPTY_GROUP,
        consumptionDay: EMPTY_GROUP,
        consumptionNight: EMPTY_GROUP,
      };
      const rows = buildUnitComparisonRows({ byCategory: new Map(), units: [unit] }, options);

      expect(rows).toEqual([
        {
          unit: 'Červenec',
          quantity: 'Spotřeba',
          year: 2022,
          value: '100,0 kWh',
          average: '150,0 kWh',
          vsAverage: '−33,3 %',
        },
        {
          unit: 'Červenec',
          quantity: 'Spotřeba',
          year: 2024,
          value: '200,0 kWh',
          average: '150,0 kWh',
          vsAverage: '+33,3 %',
        },
      ]);
    });

    /**
     * Textová alternativa i tooltip berou skupiny ze stejné funkce
     * (`unitGroups`), aby nemohly popsat stejný sloupec jinak.
     */
    it('drží stejné skupiny jako tooltip – i poloviny dne a režim „net“', () => {
      const unit: UnitComparison = {
        label: 'Červenec',
        consumption: group([{ year: 2024, value: 200, color: '#abc', vsAverage: 0 }], 200),
        production: group([{ year: 2024, value: 80, color: '#def', vsAverage: 0 }], 80),
        net: group([{ year: 2024, value: 120, color: '#fed', vsAverage: 0 }], 120),
        consumptionDay: group([{ year: 2024, value: 150, color: '#abc', vsAverage: 0 }], 150),
        consumptionNight: group([{ year: 2024, value: 50, color: '#abc', vsAverage: 0 }], 50),
      };
      const index = { byCategory: new Map(), units: [unit] };

      expect(
        buildUnitComparisonRows(index, { ...options, consumptionSplit: 'both' }).map(
          (r) => r.quantity
        )
      ).toEqual(['Spotřeba', 'Spotřeba ve dne', 'Spotřeba v noci', 'Výroba']);

      const net = buildUnitComparisonRows(index, { ...options, chartMode: 'net' });
      expect(net.map((r) => r.quantity)).toEqual(['Dokoupená energie']);
      expect(net[0].value).toBe('120,0 kWh');
    });
  });
});
