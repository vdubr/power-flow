/**
 * Akceptační scénáře z pohledu uživatele.
 *
 * Každý test odpovídá jednomu scénáři z docs/UZIVATEL-A-POTREBY.md (ID U1.1 … U11.2)
 * a běží nad REÁLNÝMI ukázkovými exporty z public/sample-data/ (35 040 řádků/rok).
 *
 * Testy označené `it.fails` dokumentují známé chyby z docs/REVIZE-A-PLAN.md:
 * assertují SPRÁVNÉ chování, které dnes neplatí. Až bude chyba opravená,
 * Vitest začne hlásit „expected test to fail“ – pak stačí `.fails` odebrat.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useEnergyStore } from '../store/energyStore';
import { parseCSV, decodeWindows1250 } from '../utils/csvParser';
import {
  aggregateByDay,
  aggregateByMonth,
  aggregateByWeek,
  getTopConsumptionDays,
} from '../utils/dataAggregation';
import { createIsDayPredicate } from '../utils/dayNight';
import {
  buildChartSeries,
  buildUnitComparison,
  BuildChartSeriesParams,
  ChartSeriesDef,
} from '../utils/chartSeriesBuilder';
import { simulateBattery } from '../utils/batteryAlgorithm';
import { AggregatedData, BatteryConfig, CSVParseResult, ImportSummary } from '../types/energy';
import { SAMPLE_DATA_YEARS } from '../constants';

// ---------------------------------------------------------------------------
// Pomocné funkce – načtení reálných ukázkových dat
// ---------------------------------------------------------------------------

// Vitest běží z kořene projektu; v jsdom prostředí není import.meta.url file:// URL.
const SAMPLE_DIR = resolve(process.cwd(), 'public/sample-data');

type Kind = 'spotreba' | 'vyroba';

function readSampleText(year: number, kind: Kind): string {
  const path = resolve(SAMPLE_DIR, String(year), `${kind}.csv`);
  return decodeWindows1250(readFileSync(path));
}

function parseSample(year: number, kind: Kind): CSVParseResult {
  return parseCSV(readSampleText(year, kind));
}

/**
 * Nezávislý orákl: součet druhého sloupce CSV (kW za 15 min) × 0,25 = kWh.
 * Počítá se přímo z textu souboru, bez použití aplikačního parseru.
 */
function rawKwhSum(year: number, kind: Kind): number {
  const lines = readSampleText(year, kind).split(/\r?\n/).slice(1);
  let sumKw = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const value = parseFloat(line.split(';')[1].replace(/"/g, '').replace(',', '.'));
    if (!Number.isNaN(value)) sumKw += value;
  }
  return sumKw / 4;
}

interface Sample {
  consumption: CSVParseResult;
  production: CSVParseResult;
}

// Parsujeme jen jednou pro celý soubor testů (35k řádků na soubor).
const sampleCache = new Map<number, Sample>();

function sampleYear(year: number): Sample {
  let sample = sampleCache.get(year);
  if (!sample) {
    sample = {
      consumption: parseSample(year, 'spotreba'),
      production: parseSample(year, 'vyroba'),
    };
    sampleCache.set(year, sample);
  }
  return sample;
}

const sample2022 = sampleYear(2022);
const sample2025 = sampleYear(2025);

const DEFAULT_BATTERY: BatteryConfig = {
  capacity: 10,
  maxDischargePercent: 80,
  minReserve: 1,
  electricityPrice: 6,
  roundTripEfficiency: 90,
  feedInPrice: 1.5,
};

function loadYear(sample: Sample) {
  useEnergyStore.getState().addData(sample.consumption.data, sample.production.data);
}

/**
 * Co dělá tlačítko „Vyzkoušet s ukázkovými daty“: všechny přibalené roky
 * jedním importem, aby se rozsah, simulace i křivka kapacity počítaly jednou.
 */
function loadAllSampleYears(): ImportSummary {
  const consumption = SAMPLE_DATA_YEARS.flatMap((year) => sampleYear(year).consumption.data);
  const production = SAMPLE_DATA_YEARS.flatMap((year) => sampleYear(year).production.data);
  return useEnergyStore.getState().addData(consumption, production);
}

function store() {
  return useEnergyStore.getState();
}

/**
 * Energie za jedním bodem grafu.
 *
 * Graf je překlopený kolem nuly (spotřeba i dokoupená energie se kreslí pod
 * ní), takže číslo v `data` samo o sobě není kWh – teprve po vynásobení
 * `plotSign` je z něj energie, kterou uživatel v tooltipu vidí.
 */
function energyAt(series: ChartSeriesDef, index: number): number {
  return Number(series.data[index][1]) * series.plotSign;
}

function energySum(series: ChartSeriesDef): number {
  return series.data.reduce((sum, [, value]) => sum + Number(value) * series.plotSign, 0);
}

/** Série jedné veličiny, jak ji graf kreslí pro právě vybraný stav. */
function seriesOf(built: { series: ChartSeriesDef[] }, quantity: string): ChartSeriesDef {
  return built.series.find((s) => s.quantity === quantity)!;
}

beforeEach(() => {
  store().clearData();
  // clearData neresetuje batteryConfig (viz REVIZE-A-PLAN.md, nález S3) – nastavíme explicitně.
  useEnergyStore.setState({ batteryConfig: { ...DEFAULT_BATTERY } });
});

// ---------------------------------------------------------------------------
// U1 – „Kolik jsem za rok odebral ze sítě a kolik jsem do ní dodal?“
// ---------------------------------------------------------------------------

describe('U1 roční bilance vůči síti', () => {
  it('U1.0 ukázkový export ČEZ (formát a+/a-) se načte jako spotřeba a výroba', () => {
    expect(sample2022.consumption.success).toBe(true);
    expect(sample2022.consumption.type).toBe('consumption');
    expect(sample2022.production.success).toBe(true);
    expect(sample2022.production.type).toBe('production');
    // 35 041 řádků – hlavička = 35 040 datových řádků
    expect(sample2022.consumption.recordCount).toBe(35040);
    expect(sample2022.production.recordCount).toBe(35040);
  });

  // Regrese k D4: dřív poslední řádek „01.01.2023 00:00“ vytvořil fantomový rok 2023.
  it('U1.1 po nahrání exportu za jeden rok vidí uživatel přesně jeden rok', () => {
    loadYear(sample2022);
    expect(store().availableYears).toEqual([2022]);
    expect(store().chartConfig.selectedYears).toEqual([2022]);
  });

  // Regrese k D3 a D4: dřív se ztrácela duplicitní hodina zimního času a poslední interval roku.
  it('U1.2 celkový odběr a dodávka za rok odpovídají součtu CSV (kW × 0,25)', () => {
    loadYear(sample2022);
    const stats = store().yearlyData.get(2022)!.statistics;
    expect(stats.totalConsumption).toBeCloseTo(rawKwhSum(2022, 'spotreba'), 2);
    expect(stats.totalProduction).toBeCloseTo(rawKwhSum(2022, 'vyroba'), 2);
  });

  it('U1.3 hodnoty jsou v řádu odpovídajícím domácnosti s FVE (1–20 MWh/rok)', () => {
    loadYear(sample2022);
    const stats = store().yearlyData.get(2022)!.statistics;
    expect(stats.totalConsumption).toBeGreaterThan(1000);
    expect(stats.totalConsumption).toBeLessThan(20000);
    expect(stats.totalProduction).toBeGreaterThan(1000);
    expect(stats.totalProduction).toBeLessThan(20000);
    expect(stats.daysWithData).toBeGreaterThanOrEqual(365);
  });

  it('U1.4 statistiky jsou počítané z bilance vůči síti, ne jako součet obou stran', () => {
    loadYear(sample2022);
    const stats = store().yearlyData.get(2022)!.statistics;
    // Odběr ze sítě a dodávka do sítě jsou dvě nezávislé veličiny;
    // přibližně 4,8 MWh vs. 4,1 MWh v ukázkových datech.
    expect(stats.totalConsumption).not.toBeCloseTo(stats.totalProduction, 0);
    expect(stats.selfSufficiencyRatio).toBeGreaterThan(0);
    expect(stats.selfSufficiencyRatio).toBeLessThanOrEqual(100);
  });

  // Přibalené roky pokrývají všechny varianty, které ČEZ produkuje: hlavičku
  // `a+`/`a-` i `+A/… [kW]`, časy se sekundami i bez nich, `24:00:00`,
  // desetinnou tečku i čárku, Windows-1250 i poškozenou diakritiku ve Statusu.
  // Sada, kterou nabízí „Vyzkoušet s ukázkovými daty“, musí projít celá –
  // jediný odmítnutý řádek skončí červeným banerem místo grafu.
  it('U1.5 každý přibalený ukázkový rok se načte bez odmítnutého řádku a sedí na CSV', () => {
    for (const year of SAMPLE_DATA_YEARS) {
      const { consumption, production } = sampleYear(year);
      expect(consumption.type).toBe('consumption');
      expect(production.type).toBe('production');
      expect(consumption.errors).toEqual([]);
      expect(production.errors).toEqual([]);
      expect(consumption.quality.rejectedRows).toBe(0);
      expect(production.quality.rejectedRows).toBe(0);

      store().clearData();
      loadYear(sampleYear(year));
      expect(store().availableYears).toEqual([year]);
      const stats = store().yearlyData.get(year)!.statistics;
      expect(stats.totalConsumption).toBeCloseTo(rawKwhSum(year, 'spotreba'), 2);
      expect(stats.totalProduction).toBeCloseTo(rawKwhSum(year, 'vyroba'), 2);
    }
  });
});

// ---------------------------------------------------------------------------
// U2 – „Kdy nejvíc odebírám?“
// ---------------------------------------------------------------------------

describe('U2 špičky odběru', () => {
  it('U2.1 TOP 10 dnů je seřazeno od nejvyššího odběru a všechny patří do zvoleného roku', () => {
    loadYear(sample2022);
    const top = getTopConsumptionDays(store().getActiveRecords(), 10);
    expect(top).toHaveLength(10);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].consumption).toBeGreaterThanOrEqual(top[i].consumption);
    }
    for (const day of top) {
      expect(day.date.getFullYear()).toBe(2022);
    }
  });

  it('U2.2 nejnáročnější den domácnosti s FVE je v zimním půlroce', () => {
    loadYear(sample2022);
    const [worst] = getTopConsumptionDays(store().getActiveRecords(), 1);
    const month = worst.date.getMonth() + 1;
    expect([10, 11, 12, 1, 2, 3]).toContain(month);
  });

  it('U2.3 rozdělení den/noc se sečte na celek v denní, týdenní i měsíční agregaci', () => {
    loadYear(sample2022);
    const records = store().getActiveRecords();
    const isDay = createIsDayPredicate(store().chartConfig.dayNightConfig);

    const cases: Array<[string, (r: typeof records, p?: typeof isDay) => AggregatedData[]]> = [
      ['denní', aggregateByDay],
      ['týdenní', aggregateByWeek],
      ['měsíční', aggregateByMonth],
    ];

    for (const [, aggregate] of cases) {
      const plain = aggregate(records);
      const split = aggregate(records, isDay);
      expect(split).toHaveLength(plain.length);

      for (let i = 0; i < plain.length; i++) {
        const parts = split[i].dayNight!;
        expect(parts.dayConsumption + parts.nightConsumption).toBeCloseTo(
          plain[i].totalConsumption,
          6
        );
        expect(parts.dayProduction + parts.nightProduction).toBeCloseTo(
          plain[i].totalProduction,
          6
        );
      }
    }
  });

  it('U2.4 bez predikátu se rozdělení nepočítá', () => {
    loadYear(sample2022);
    const plain = aggregateByDay(store().getActiveRecords());
    expect(plain.every((period) => period.dayNight === undefined)).toBe(true);
  });

  it('U2.5 do sítě se v noci téměř nic nedodává', () => {
    // Kontrola orientace predikátu na reálných datech: kdyby byl východ
    // a západ slunce prohozený, byla by noční výroba téměř celá roční.
    loadYear(sample2022);
    const isDay = createIsDayPredicate(store().chartConfig.dayNightConfig);
    const months = aggregateByMonth(store().getActiveRecords(), isDay);

    let dayProduction = 0;
    let nightProduction = 0;
    for (const month of months) {
      dayProduction += month.dayNight!.dayProduction;
      nightProduction += month.dayNight!.nightProduction;
    }
    const total = dayProduction + nightProduction;
    expect(total).toBeGreaterThan(0);
    expect(nightProduction / total).toBeLessThan(0.05);
  });

  it('U2.6 skrytí série ve filtru pod grafem nezmění statistiky ani simulaci', () => {
    loadAllSampleYears();
    const before = {
      activeRecords: store().getActiveRecords().length,
      savingsPerYear: store().batterySimulation!.savingsPerYear,
      capacity: store().capacityRecommendation!.capacity,
      consumption2022: store().yearlyData.get(2022)!.statistics.totalConsumption,
    };

    // Filtr je zobrazení, ne výběr dat: číslo ve statistikách se po skrytí
    // čáry v grafu nesmí pohnout, jinak by uživatel nevěděl, co vlastně čte.
    store().toggleSeriesVisibility('Spotřeba 2022');
    store().toggleSeriesVisibility('Výroba 2025');

    expect(store().chartConfig.hiddenSeries).toEqual(['Spotřeba 2022', 'Výroba 2025']);
    expect(store().getActiveRecords().length).toBe(before.activeRecords);
    expect(store().batterySimulation!.savingsPerYear).toBe(before.savingsPerYear);
    expect(store().capacityRecommendation!.capacity).toBe(before.capacity);
    expect(store().yearlyData.get(2022)!.statistics.totalConsumption).toBe(
      before.consumption2022
    );
  });

  /**
   * Přepínač den/noc má čtyři polohy a dvě z nich data ořezávají. Uživatel se
   * podle nich rozhoduje, kolik odebírá po západu slunce – kdyby se při
   * ořezání kus spotřeby ztratil (nebo přičetl dvakrát), byl by to tichý
   * posun v čísle, na kterém staví nákup baterie.
   */
  it('U2.7 „jen den“ a „jen noc“ se sečtou na celou spotřebu – ořezání nic neztratí', () => {
    loadYear(sample2022);

    const common: Omit<BuildChartSeriesParams, 'consumptionSplit'> = {
      yearlyData: store().yearlyData,
      selectedYears: [2022],
      aggregationType: 'daily',
      showConsumption: true,
      showProduction: true,
      dayNightConfig: store().chartConfig.dayNightConfig,
      chartMode: 'balance',
      consumptionBelowAxis: false,
    };
    const whole = buildChartSeries({ ...common, consumptionSplit: 'sum' })!;
    const day = buildChartSeries({ ...common, consumptionSplit: 'day' })!;
    const night = buildChartSeries({ ...common, consumptionSplit: 'night' })!;
    const both = buildChartSeries({ ...common, consumptionSplit: 'both' })!;

    const wholeC = seriesOf(whole, 'consumption');
    const dayC = seriesOf(day, 'consumption');
    const nightC = seriesOf(night, 'consumption');

    // Osa se ořezáním nemění, jen hodnoty ve sloupcích.
    expect(dayC.data).toHaveLength(wholeC.data.length);
    expect(nightC.data).toHaveLength(wholeC.data.length);
    expect(wholeC.data.length).toBeGreaterThanOrEqual(365);

    for (let i = 0; i < wholeC.data.length; i++) {
      expect(dayC.data[i][0]).toBe(wholeC.data[i][0]);
      expect(energyAt(dayC, i) + energyAt(nightC, i)).toBeCloseTo(energyAt(wholeC, i), 6);
    }

    // Reálná domácnost s FVE odebírá ze sítě v obou polovinách dne, takže
    // scénář opravdu měří rozdělení a ne dvě kopie téhož čísla.
    expect(energySum(dayC)).toBeGreaterThan(0);
    expect(energySum(nightC)).toBeGreaterThan(0);
    expect(energySum(dayC) + energySum(nightC)).toBeCloseTo(
      store().yearlyData.get(2022)!.statistics.totalConsumption,
      3
    );

    // Výroba se nedělí: po západu slunce do sítě nic nejde.
    expect(seriesOf(day, 'production').data).toEqual(seriesOf(whole, 'production').data);

    // „Obojí“ sloupce nechá být a rozpad dá do tooltipu – jinak by se graf po
    // zapnutí rozpadu proměnil, ačkoli uživatel chtěl jen víc detailu.
    expect(seriesOf(both, 'consumption').data).toEqual(wholeC.data);
    expect(both.splitByKey.size).toBe(wholeC.data.length);
    const firstKey = `${wholeC.data[0][0]}|2022`;
    const halves = both.splitByKey.get(firstKey)!;
    expect(halves.day).toBeCloseTo(energyAt(dayC, 0), 6);
    expect(halves.night).toBeCloseTo(energyAt(nightC, 0), 6);
  });

  /**
   * „Spotřeba pod osu“ je způsob kresby, ne způsob počítání. Kdyby zrcadlení
   * prosáklo do čísel, uživatel by četl zápornou spotřebu — a to z bilančních
   * dat nedává smysl.
   */
  it('U2.8 překlopení pod osu zrcadlí kresbu, ne čísla', () => {
    loadYear(sample2022);
    const common: Omit<BuildChartSeriesParams, 'consumptionBelowAxis'> = {
      yearlyData: store().yearlyData,
      selectedYears: [2022],
      aggregationType: 'monthly',
      showConsumption: true,
      showProduction: true,
      dayNightConfig: store().chartConfig.dayNightConfig,
      consumptionSplit: 'sum',
      chartMode: 'balance',
    };

    const upright = buildChartSeries({ ...common, consumptionBelowAxis: false })!;
    const mirrored = buildChartSeries({ ...common, consumptionBelowAxis: true })!;

    // Výchozí poloha přepínače: obě veličiny nad nulou.
    expect(store().chartConfig.consumptionBelowAxis).toBe(false);
    expect(upright.series.every((s) => s.data.every(([, v]) => Number(v) >= 0))).toBe(true);

    const consumptionOf = (built: typeof upright) =>
      built.series.find((s) => s.quantity === 'consumption')!;
    expect(consumptionOf(mirrored).data.every(([, v]) => Number(v) <= 0)).toBe(true);
    // Výroba se nezrcadlí, zrcadlí se odebraná strana.
    expect(mirrored.series.find((s) => s.quantity === 'production')!.plotSign).toBe(1);

    // Energie za každým sloupcem je v obou polohách stejná a kladná.
    const uprightConsumption = consumptionOf(upright);
    const mirroredConsumption = consumptionOf(mirrored);
    for (let i = 0; i < uprightConsumption.data.length; i++) {
      const a = Number(uprightConsumption.data[i][1]) * uprightConsumption.plotSign;
      const b = Number(mirroredConsumption.data[i][1]) * mirroredConsumption.plotSign;
      expect(b).toBeCloseTo(a, 6);
      expect(b).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// U3 – „Jak se to liší mezi roky?“
// ---------------------------------------------------------------------------

describe('U3 porovnání let', () => {
  it('U3.1 po nahrání dalšího roku se zobrazí nahraný rok a porovnání je krok navíc', () => {
    loadYear(sample2022);
    loadYear(sample2025);
    expect(store().availableYears).toContain(2022);
    expect(store().availableYears).toContain(2025);
    // Uživatel vidí, co právě nahrál – dřív zůstal vybraný starý rok a import
    // vypadal, jako by se nic nestalo.
    expect(store().chartConfig.selectedYears).toEqual([2025]);

    // Porovnání zapne kliknutím na odznak dřívějšího roku.
    store().setSelectedYears([2022, 2025]);
    const active = store().getActiveRecords();
    const years = new Set(active.map((r) => r.timestamp.getFullYear()));
    expect(years).toEqual(new Set([2022, 2025]));
  });

  it('U3.2 každý rok má vlastní nezávislé statistiky', () => {
    loadYear(sample2022);
    loadYear(sample2025);
    const s2022 = store().yearlyData.get(2022)!.statistics;
    const s2025 = store().yearlyData.get(2025)!.statistics;
    expect(s2025.totalConsumption).toBeGreaterThan(0);
    expect(s2022.totalConsumption).not.toBeCloseTo(s2025.totalConsumption, 0);
  });

  // Regrese k D1: dřív byly řádky „DD.MM.YYYY 24:00:00“ odmítnuty (365 řádků ročně).
  it('U3.3 export ve formátu „+A/… [kW]“ (2025) se načte beze ztráty řádků', () => {
    expect(sample2025.consumption.errors).toEqual([]);
    expect(sample2025.consumption.recordCount).toBe(35040);
  });

  it('U3.4 „Vyzkoušet s ukázkovými daty“ načte všechny přibalené roky rovnou k porovnání', () => {
    const summary = loadAllSampleYears();
    const years = [...SAMPLE_DATA_YEARS];

    // Uživatel dostane celou sadu, ne jen jeden rok, a hned ji vidí v grafu.
    expect(summary.years).toEqual(years);
    expect(summary.newYears).toEqual(years);
    expect(store().availableYears).toEqual(years);
    expect(store().chartConfig.selectedYears).toEqual(years);

    // Každý rok si drží vlastní statistiky – porovnání má co ukázat.
    for (const year of years) {
      const stats = store().yearlyData.get(year)!.statistics;
      expect(stats.totalConsumption).toBeGreaterThan(1000);
      expect(stats.daysWithData).toBeGreaterThanOrEqual(365);
    }

    // Simulace jede přes celý rozsah: čtyři roky = 48 měsíců, žádný 13. měsíc.
    const sim = store().batterySimulation!;
    expect(sim.monthlyAnalysis).toHaveLength(years.length * 12);
    expect(sim.daysSimulated).toBeGreaterThanOrEqual(years.length * 365);
  });

  it('U3.5 při celé ukázkové sadě zůstává „roční“ hodnota za jeden rok', () => {
    const perYear: number[] = [];
    for (const year of SAMPLE_DATA_YEARS) {
      store().clearData();
      useEnergyStore.setState({ batteryConfig: { ...DEFAULT_BATTERY } });
      loadYear(sampleYear(year));
      perYear.push(store().batterySimulation!.savingsPerYear);
    }

    store().clearData();
    useEnergyStore.setState({ batteryConfig: { ...DEFAULT_BATTERY } });
    loadAllSampleYears();
    const all = store().batterySimulation!.savingsPerYear;

    // Čtyři roky v jednom importu nesmí úsporu zečtyřnásobit – je to průměr,
    // takže leží mezi nejhorším a nejlepším rokem.
    expect(all).toBeLessThanOrEqual(Math.max(...perYear) * 1.05);
    expect(all).toBeGreaterThanOrEqual(Math.min(...perYear) * 0.95);
  });

  it('U3.6 import více roků otevře měsíční zobrazení', () => {
    // Denní sloupce za čtyři roky přes sebe jsou nečitelná hradba; měsíční je
    // nejhrubší zobrazení, ve kterém porovnání roků něco říká.
    expect(store().chartConfig.aggregationType).toBe('daily');

    loadAllSampleYears();
    expect(store().chartConfig.selectedYears.length).toBeGreaterThan(1);
    expect(store().chartConfig.aggregationType).toBe('monthly');

    // Jeden rok si denní zobrazení nechá.
    store().clearData();
    loadYear(sample2022);
    expect(store().chartConfig.aggregationType).toBe('daily');
  });

  it('U3.7 měsíc v grafu se porovná se stejným měsícem všech nahraných roků', () => {
    loadAllSampleYears();
    // V grafu je jediný rok – porovnání musí přesto znát všechny nahrané.
    store().setSelectedYears([2025]);

    const index = buildUnitComparison({
      yearlyData: store().yearlyData,
      availableYears: store().availableYears,
      selectedYears: store().chartConfig.selectedYears,
      aggregationType: 'monthly',
      // Porovnání se ořezává stejně jako graf; tady se na celek nedělí.
      consumptionSplit: 'sum',
      dayNightConfig: store().chartConfig.dayNightConfig,
    })!;

    const july = index.units.find((u) => u.label === 'Červenec')!;
    expect(july.consumption.rows.map((r) => r.year)).toEqual([2022, 2023, 2024, 2025]);

    // Nezávislý orákl: součet červencových záznamů daného roku.
    for (const row of july.consumption.rows) {
      const fromRecords = store()
        .yearlyData.get(row.year)!
        .records.filter((r) => r.timestamp.getMonth() === 6)
        .reduce((sum, r) => sum + r.consumption, 0);
      expect(row.value).toBeCloseTo(fromRecords, 6);
    }

    // Průměr je aritmetický průměr těch let a odchylka se počítá vůči němu.
    const values = july.consumption.rows.map((r) => r.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(july.consumption.average).toBeCloseTo(mean, 6);
    for (const row of july.consumption.rows) {
      expect(row.vsAverage).toBeCloseTo(((row.value - mean) / mean) * 100, 6);
      // Znaménko odpovídá straně průměru, na kterou hodnota padá.
      if (row.value > mean) expect(row.vsAverage!).toBeGreaterThan(0);
      if (row.value < mean) expect(row.vsAverage!).toBeLessThan(0);
    }

    // Rok, který graf právě kreslí, má barvu série; ostatní jsou bez barvy,
    // aby bylo poznat, co je na obrazovce a co jen pro porovnání.
    const byYear = new Map(july.consumption.rows.map((r) => [r.year, r]));
    expect(byYear.get(2025)!.color).not.toBeNull();
    expect(byYear.get(2022)!.color).toBeNull();
  });

  it('U3.8 týdenní pás je jeden týden všech roků, ne pondělí jednoho z nich', () => {
    // Regrese: osa se klíčovala datem pondělí, které se rok od roku posouvá,
    // takže se roky prokládaly do samostatných pásů pár dnů od sebe a při
    // zoomu se pás zdánlivě pohyboval.
    loadAllSampleYears();
    const years = store().chartConfig.selectedYears;
    expect(years).toHaveLength(4);

    const built = buildChartSeries({
      yearlyData: store().yearlyData,
      selectedYears: years,
      aggregationType: 'weekly',
      showConsumption: true,
      showProduction: false,
      dayNightConfig: store().chartConfig.dayNightConfig,
      consumptionSplit: 'sum',
      chartMode: 'balance',
      consumptionBelowAxis: false,
    })!;

    // Ne 4 × 53 kategorií, ale jeden pás na týden plus přesahy na krajích.
    expect(built.dates.length).toBeLessThanOrEqual(55);

    const yearsPerCategory = new Map<string, number>();
    for (const series of built.series) {
      for (const [key] of series.data) {
        yearsPerCategory.set(String(key), (yearsPerCategory.get(String(key)) ?? 0) + 1);
      }
    }
    // Každý běžný pás (bez přesahů na krajích) nese všechny čtyři roky.
    for (const key of built.dates.slice(1, -1)) {
      expect(yearsPerCategory.get(key), `pás ${key}`).toBe(years.length);
    }

    // A tooltip u toho pásu řekne za každý rok, které dny sečetl – pondělí
    // 27. týdne padne v každém roce na jiné datum.
    const index = buildUnitComparison({
      yearlyData: store().yearlyData,
      availableYears: store().availableYears,
      selectedYears: years,
      aggregationType: 'weekly',
      consumptionSplit: 'sum',
      dayNightConfig: store().chartConfig.dayNightConfig,
    })!;
    const week27 = index.units.find((u) => u.label === '27. týden')!;
    for (const row of week27.consumption.rows) {
      expect(row.rangeLabel).toMatch(/^\d+\. \d+\. – \d+\. \d+\.$/);
    }
    // Rozsahy se mezi roky liší, proto jsou v řádcích a ne v hlavičce.
    expect(new Set(week27.consumption.rows.map((r) => r.rangeLabel)).size).toBe(4);
  });

  /**
   * Režim „net“ odpovídá na otázku, kterou si uživatel před nákupem baterie
   * klade jako první: kolik jsem musel dokoupit. Musí to tedy být přesně
   * rozdíl obou stran elektroměru za daný rok – ne odhad a ne součet.
   */
  it('U3.9 v režimu „dokoupená energie“ je součet série rozdílem ročního odběru a dodávky', () => {
    loadAllSampleYears();
    const years = store().chartConfig.selectedYears;
    expect(years.length).toBeGreaterThan(1);

    const built = buildChartSeries({
      yearlyData: store().yearlyData,
      selectedYears: years,
      aggregationType: 'monthly',
      showConsumption: true,
      showProduction: true,
      dayNightConfig: store().chartConfig.dayNightConfig,
      consumptionSplit: 'sum',
      chartMode: 'net',
      // Zrcadlení pod osu je volba uživatele; scénář ověřuje čísla, ne kresbu.
      consumptionBelowAxis: false,
    })!;

    // Jedna série na rok – ne dvě, které by si uživatel musel odečítat sám.
    expect(built.series).toHaveLength(years.length);
    expect(built.series.map((s) => s.year)).toEqual(years);

    for (const series of built.series) {
      expect(series.quantity).toBe('net');
      const stats = store().yearlyData.get(series.year)!.statistics;
      const expected = stats.totalConsumption - stats.totalProduction;

      expect(energySum(series)).toBeCloseTo(expected, 6);

      // Ukázkové roky odeberou ze sítě víc, než do ní dodají, takže „dokoupeno“
      // je kladné – a kreslí se na stejnou stranu nuly jako spotřeba v bilanci.
      expect(expected).toBeGreaterThan(0);
      expect(series.plotSign).toBe(1);
      expect(series.data.reduce((sum, [, value]) => sum + Number(value), 0)).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// U4 – „Kolik přetoků propadá do sítě a dalo by se uložit?“
// ---------------------------------------------------------------------------

describe('U4 přetoky využitelné baterií', () => {
  it('U4.1 baterie nikdy neuloží více, než kolik domácnost dodala do sítě', () => {
    loadYear(sample2022);
    const sim = store().batterySimulation!;
    const exported = store().yearlyData.get(2022)!.statistics.totalProduction;
    expect(sim.totalEnergyStored).toBeGreaterThan(0);
    expect(sim.totalEnergyStored).toBeLessThanOrEqual(exported + 1e-6);
    expect(sim.totalEnergyUsedFromBattery).toBeLessThanOrEqual(sim.totalEnergyStored + 1e-6);
  });

  it('U4.2 s baterií se dokup ze sítě sníží, ale nikdy neklesne pod nulu', () => {
    loadYear(sample2022);
    const sim = store().batterySimulation!;
    let withBattery = 0;
    let original = 0;
    for (const day of sim.dailyGridImport) {
      expect(day.gridImport).toBeGreaterThanOrEqual(0);
      expect(day.gridImport).toBeLessThanOrEqual(day.gridImportOriginal + 1e-6);
      withBattery += day.gridImport;
      original += day.gridImportOriginal;
    }
    expect(withBattery).toBeLessThan(original);
    expect(original - withBattery).toBeCloseTo(sim.gridImportReduction, 3);
  });
});

// ---------------------------------------------------------------------------
// U5 – „Jakou baterii si pořídit a kolik ročně ušetřím?“
// ---------------------------------------------------------------------------

describe('U5 doporučení baterie a úspora', () => {
  it('U5.1 doporučená kapacita je realistická (2–30 kWh) a zaokrouhlená na 0,5 kWh', () => {
    loadYear(sample2022);
    const rec = store().capacityRecommendation!;
    expect(rec.capacity).toBeGreaterThanOrEqual(2);
    expect(rec.capacity).toBeLessThanOrEqual(30);
    expect((rec.capacity * 2) % 1).toBe(0);
  });

  it('U5.1b doporučení je podložené křivkou, kterou si uživatel může prohlédnout', () => {
    loadYear(sample2022);
    const rec = store().capacityRecommendation!;
    // Křivka pokrývá celý rozsah nabízený sliderem a roste monotónně:
    // větší baterie nikdy neušetří méně.
    expect(rec.curve.length).toBeGreaterThan(10);
    expect(rec.curve[0].capacity).toBe(2);
    expect(rec.curve[rec.curve.length - 1].capacity).toBe(30);
    for (let i = 1; i < rec.curve.length; i++) {
      expect(rec.curve[i].savingsPerYear).toBeGreaterThanOrEqual(
        rec.curve[i - 1].savingsPerYear - 1e-6
      );
    }
    // Doporučení leží v koleni křivky: dál už další kWh přináší málo.
    expect(rec.capacity).toBeGreaterThan(rec.curve[0].capacity);
    expect(rec.capacity).toBeLessThan(rec.curve[rec.curve.length - 1].capacity);
    expect(rec.benefitShare).toBeGreaterThan(0.5);
    // Přírůstek za kolenem je výrazně menší než přírůstek před ním.
    const step = rec.curve[1].capacity - rec.curve[0].capacity;
    const gainBefore =
      (rec.curve[1].savingsPerYear - rec.curve[0].savingsPerYear) / step;
    expect(rec.marginalSavingsPerKwh).toBeLessThan(gainBefore / 2);
  });

  it('U5.2 roční úspora = ušetřený nákup minus ušlý výkup, přepočtený na rok', () => {
    loadYear(sample2022);
    const sim = store().batterySimulation!;
    const cfg = store().batteryConfig;
    const scale = 365 / sim.daysSimulated;
    const expected =
      (sim.gridImportReduction * cfg.electricityPrice -
        sim.gridExportReduction * cfg.feedInPrice) *
      scale;
    expect(sim.savingsPerYear).toBeCloseTo(expected, 6);
    expect(sim.savingsPerYear).toBeGreaterThan(0);
    // Rozklad musí sedět na celek.
    expect(sim.savingsPerYear).toBeCloseTo(
      sim.avoidedPurchasePerYear - sim.lostFeedInPerYear,
      6
    );
  });

  it('U5.3 větší baterie nikdy neušetří méně než menší', () => {
    loadYear(sample2022);
    const records = store().allRecords;
    const small = simulateBattery(records, { ...DEFAULT_BATTERY, capacity: 5 });
    const large = simulateBattery(records, { ...DEFAULT_BATTERY, capacity: 10 });
    expect(large.savingsPerYear).toBeGreaterThanOrEqual(small.savingsPerYear);
    expect(large.offGridDays).toBeGreaterThanOrEqual(small.offGridDays);
  });

  it('U5.4 při nahraných dvou letech je „roční úspora“ skutečně za jeden rok', () => {
    loadYear(sample2022);
    const only2022 = store().batterySimulation!.savingsPerYear;
    store().clearData();
    loadYear(sample2025);
    const only2025 = store().batterySimulation!.savingsPerYear;
    store().clearData();
    loadYear(sample2022);
    loadYear(sample2025);
    store().setSelectedYears([2022, 2025]);
    const both = store().batterySimulation!.savingsPerYear;
    // Roční hodnota za dva roky nesmí být větší než nejlepší jednotlivý rok.
    expect(both).toBeLessThanOrEqual(Math.max(only2022, only2025) * 1.05);
    // A musí ležet mezi jednotlivými roky, protože je to jejich průměr.
    expect(both).toBeGreaterThanOrEqual(Math.min(only2022, only2025) * 0.95);
  });

  it('U5.5 účinnost baterie snižuje úsporu, ztráty se nikam neztratí', () => {
    loadYear(sample2022);
    const records = store().allRecords;
    const lossless = simulateBattery(records, {
      ...DEFAULT_BATTERY,
      roundTripEfficiency: 100,
    });
    const real = simulateBattery(records, { ...DEFAULT_BATTERY, roundTripEfficiency: 90 });
    expect(real.totalEnergyUsedFromBattery).toBeLessThan(
      lossless.totalEnergyUsedFromBattery
    );
    expect(real.savingsPerYear).toBeLessThan(lossless.savingsPerYear);
    // Z baterie nikdy nevyjde víc, než do ní vstoupilo.
    expect(real.totalEnergyUsedFromBattery).toBeLessThanOrEqual(
      real.totalEnergyStored + 1e-6
    );
  });

  it('U5.6 výkupní cena snižuje úsporu o hodnotu neprodaných přetoků', () => {
    loadYear(sample2022);
    const records = store().allRecords;
    const withoutFeedIn = simulateBattery(records, { ...DEFAULT_BATTERY, feedInPrice: 0 });
    const withFeedIn = simulateBattery(records, { ...DEFAULT_BATTERY, feedInPrice: 2 });
    const scale = 365 / withFeedIn.daysSimulated;
    expect(withoutFeedIn.savingsPerYear - withFeedIn.savingsPerYear).toBeCloseTo(
      withFeedIn.gridExportReduction * 2 * scale,
      6
    );
  });
});

// U6 – „Kolik dní v roce bych s baterií nedokupoval ze sítě?“
// ---------------------------------------------------------------------------

describe('U6 ostrovní dny', () => {
  it('U6.1 počet ostrovních dnů a procento jsou konzistentní s denní analýzou', () => {
    loadYear(sample2022);
    const sim = store().batterySimulation!;
    const days = sim.dailyGridImport.length;
    expect(sim.offGridDays).toBeGreaterThanOrEqual(0);
    expect(sim.offGridDays).toBeLessThanOrEqual(days);
    expect(sim.offGridDaysPercent).toBeCloseTo((sim.offGridDays / days) * 100, 6);
    const flagged = sim.dailyGridImport.filter((d) => d.isOffGrid).length;
    expect(flagged).toBe(sim.offGridDays);
  });

  it('U6.2 ostrovní den = den bez dokupu ze sítě', () => {
    loadYear(sample2022);
    for (const day of store().batterySimulation!.dailyGridImport) {
      if (day.isOffGrid) expect(day.gridImport).toBeLessThan(0.01);
      else expect(day.gridImport).toBeGreaterThanOrEqual(0.01);
    }
  });
});

// ---------------------------------------------------------------------------
// U7 – „Co kdyby…“ (interaktivní změna parametrů)
// ---------------------------------------------------------------------------

describe('U7 co kdyby', () => {
  it('U7.1 dvojnásobná cena elektřiny zdvojnásobí ušetřený nákup', () => {
    loadYear(sample2022);
    const base = store().batterySimulation!.avoidedPurchasePerYear;
    store().setBatteryConfig({ electricityPrice: 12 });
    const doubled = store().batterySimulation!;
    expect(doubled.avoidedPurchasePerYear).toBeCloseTo(base * 2, 6);
    // Ušlý výkup na ceně nákupu nezávisí, proto celková úspora neroste přesně dvakrát.
    expect(doubled.lostFeedInPerYear).toBeGreaterThan(0);
  });

  it('U7.2 změna kapacity okamžitě přepočítá simulaci s novou konfigurací', () => {
    loadYear(sample2022);
    store().setBatteryConfig({ capacity: 15 });
    const sim = store().batterySimulation!;
    expect(sim.config.capacity).toBe(15);
    // Stav baterie nikdy nepřekročí kapacitu.
    for (const level of sim.dailyAverageLevels) {
      expect(level.avgCharge).toBeLessThanOrEqual(15 + 1e-6);
    }
  });

  it('U7.3 posun slideru kapacity nepřepočítává křivku doporučení', () => {
    loadYear(sample2022);
    const before = store().capacityRecommendation;
    store().setBatteryConfig({ capacity: 12 });
    // Křivka kapacitu sama prochází, takže na ní nezávisí a nesmí se přepočítat.
    expect(store().capacityRecommendation).toBe(before);

    // Změna hloubky vybití ale výsledek křivky mění, takže se přepočítat musí.
    store().setBatteryConfig({ maxDischargePercent: 50 });
    expect(store().capacityRecommendation).not.toBe(before);
  });
});

// U8 – „Ve kterých měsících mi baterie pomůže?“
// ---------------------------------------------------------------------------

describe('U8 sezónnost', () => {
  // Regrese k D4: dřív fantomový „Leden 2023“ přidal 13. měsíc.
  it('U8.1 měsíční analýza jednoho roku má přesně 12 měsíců', () => {
    loadYear(sample2022);
    const months = store().batterySimulation!.monthlyAnalysis;
    expect(months).toHaveLength(12);
    expect(months.every((m) => m.year === 2022)).toBe(true);
  });

  it('U8.2 v létě se do baterie uloží výrazně více než v zimě', () => {
    loadYear(sample2022);
    const months = store().batterySimulation!.monthlyAnalysis.filter((m) => m.year === 2022);
    const sum = (list: number[]) =>
      months.filter((m) => list.includes(m.month)).reduce((s, m) => s + m.energyStored, 0);
    expect(sum([6, 7, 8])).toBeGreaterThan(sum([12, 1, 2]) * 2);
  });
});

// ---------------------------------------------------------------------------
// U9 – „Chci se podívat na konkrétní období.“
// ---------------------------------------------------------------------------

describe('U9 výběr období', () => {
  it('U9.1 výběr rozsahu v grafu přepne statistiky na vybraný úsek', () => {
    loadYear(sample2022);
    const start = new Date(2022, 6, 1, 0, 0);
    const end = new Date(2022, 6, 31, 23, 59, 59);
    store().setTimeRange({ start, end });
    expect(store().chartConfig.rangeMode).toBe('selection');
    const active = store().getActiveRecords();
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThan(store().allRecords.length);
    for (const r of active) {
      expect(r.timestamp >= start && r.timestamp <= end).toBe(true);
    }
  });

  it('U9.2 zrušení výběru vrátí statistiky na celá data', () => {
    loadYear(sample2022);
    store().setTimeRange({ start: new Date(2022, 6, 1), end: new Date(2022, 6, 31) });
    store().setTimeRange(null);
    expect(store().getActiveRecords()).toHaveLength(store().allRecords.length);
  });
});

// ---------------------------------------------------------------------------
// U10 – správa nahraných dat
// ---------------------------------------------------------------------------

describe('U10 správa dat', () => {
  it('U10.1 odebrání roku odstraní jeho záznamy a přepočítá simulaci', () => {
    loadYear(sample2022);
    loadYear(sample2025);
    const before = store().allRecords.length;
    store().removeYear(2025);
    expect(store().availableYears).not.toContain(2025);
    expect(store().allRecords.length).toBeLessThan(before);
    expect(store().allRecords.every((r) => r.timestamp.getFullYear() !== 2025)).toBe(true);
    expect(store().batterySimulation).not.toBeNull();
    expect(store().batterySimulation!.monthlyAnalysis.some((m) => m.year === 2025)).toBe(false);
  });

  it('U10.3 nahrání spotřeby a poté výroby zvlášť nesmí přepsat už načtená data', () => {
    // Uživatel běžně stahuje dva soubory a může je nahrát postupně.
    store().addData(sample2022.consumption.data, []);
    const afterConsumption = store().yearlyData.get(2022)!.statistics.totalConsumption;
    expect(afterConsumption).toBeGreaterThan(0);
    expect(store().yearlyData.get(2022)!.hasProduction).toBe(false);

    store().addData([], sample2022.production.data);
    const merged = store().yearlyData.get(2022)!;
    // Spotřeba zůstala nedotčená a výroba přibyla.
    expect(merged.statistics.totalConsumption).toBeCloseTo(afterConsumption, 6);
    expect(merged.statistics.totalProduction).toBeGreaterThan(0);
    expect(merged.hasProduction).toBe(true);
    expect(merged.hasConsumption).toBe(true);
  });

  it('U10.4 opakované nahrání téhož souboru hodnoty nezdvojnásobí', () => {
    loadYear(sample2022);
    const first = store().yearlyData.get(2022)!.statistics.totalConsumption;
    const recordCount = store().allRecords.length;

    loadYear(sample2022);
    const second = store().yearlyData.get(2022)!.statistics;
    expect(second.totalConsumption).toBeCloseTo(first, 6);
    expect(store().allRecords).toHaveLength(recordCount);
  });

  it('U10.2 „Vymazat všechna data“ vrátí aplikaci do prázdného stavu', () => {
    loadYear(sample2022);
    store().clearData();
    expect(store().allRecords).toHaveLength(0);
    expect(store().availableYears).toHaveLength(0);
    expect(store().batterySimulation).toBeNull();
    expect(store().chartConfig.selectedYears).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// U11 – chybové vstupy
// ---------------------------------------------------------------------------

describe('U11 chybové vstupy', () => {
  it('U11.1 soubor bez rozpoznatelné hlavičky je odmítnut se srozumitelnou českou hláškou', () => {
    const result = parseCSV('"Datum";"Hodnota";\n01.01.2022 00:15;0.5;\n');
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('+A');
    expect(result.recordCount).toBe(0);
  });

  it('U11.2 vadné řádky jsou nahlášeny s číslem řádku, ostatní data se načtou', () => {
    const csv = [
      '"Datum";"a+";"Status";',
      '01.01.2022 00:15;0.336;OK;',
      'tohle není datum;0.378;OK;',
      '01.01.2022 00:45;0.400;OK;',
    ].join('\n');
    const result = parseCSV(csv);
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Řádek 3/);
  });
});
