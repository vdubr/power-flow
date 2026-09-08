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
  aggregateByDayNight,
  getTopConsumptionDays,
} from '../utils/dataAggregation';
import { simulateBattery } from '../utils/batteryAlgorithm';
import { BatteryConfig, CSVParseResult } from '../types/energy';

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

// Parsujeme jen jednou pro celý soubor testů (35k řádků × 4 soubory).
const sample2022 = {
  consumption: parseSample(2022, 'spotreba'),
  production: parseSample(2022, 'vyroba'),
};
const sample2025 = {
  consumption: parseSample(2025, 'spotreba'),
  production: parseSample(2025, 'vyroba'),
};

const DEFAULT_BATTERY: BatteryConfig = {
  capacity: 10,
  maxDischargePercent: 80,
  minReserve: 1,
  electricityPrice: 6,
  roundTripEfficiency: 90,
  feedInPrice: 1.5,
};

function loadYear(sample: typeof sample2022) {
  useEnergyStore.getState().addData(sample.consumption.data, sample.production.data);
}

function store() {
  return useEnergyStore.getState();
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

  it('U2.3 rozdělení den/noc se sečte na denní součet pro každý den', () => {
    loadYear(sample2022);
    const records = store().getActiveRecords();
    const daily = aggregateByDay(records);
    const dayNight = aggregateByDayNight(records, {
      mode: 'manual',
      manualDayStart: '06:00',
      manualDayEnd: '20:00',
    });
    expect(dayNight).toHaveLength(daily.length);
    for (let i = 0; i < daily.length; i++) {
      expect(dayNight[i].dayConsumption + dayNight[i].nightConsumption).toBeCloseTo(
        daily[i].totalConsumption,
        6
      );
    }
  });
});

// ---------------------------------------------------------------------------
// U3 – „Jak se to liší mezi roky?“
// ---------------------------------------------------------------------------

describe('U3 porovnání let', () => {
  it('U3.1 po nahrání dalšího roku zůstane původní výběr a nový rok je k dispozici', () => {
    loadYear(sample2022);
    loadYear(sample2025);
    expect(store().availableYears).toContain(2022);
    expect(store().availableYears).toContain(2025);
    expect(store().chartConfig.selectedYears).toContain(2022);
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
