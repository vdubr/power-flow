import type { EChartsOption } from 'echarts';
import {
  BatteryConfig,
  BatterySimulationResult,
  CapacityCurvePoint,
} from '../types/energy';
import { CHART_PALETTE } from '../theme/echartsTheme';
import { parseLocalDateKey } from './dateUtils';
import {
  formatCurrency,
  formatDate,
  formatDayMonth,
  formatKwh,
  formatMonthYear,
  formatNumber,
  formatPercent,
  formatAxisNumber,
} from './format';

/**
 * ECharts option builders for the battery screen.
 *
 * Kept out of the component so the option shapes can be unit-tested without
 * rendering a canvas, and so the component stays a layout concern.
 */

const GRID = { left: '3%', right: '4%', bottom: '15%', top: '12%', containLabel: true };

/**
 * Adds an alpha channel to a palette colour.
 *
 * ECharts fills need a translucent variant of a theme colour, and it cannot
 * evaluate `color-mix()` or CSS variables in every slot. Deriving the fill from
 * the palette keeps the colour itself in one place.
 */
function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const AMBER_FILL = withAlpha(CHART_PALETTE.amber, 0.28);

const ZOOM = [
  { type: 'inside' as const, start: 0, end: 100, zoomOnMouseWheel: false, moveOnMouseWheel: false },
  { type: 'slider' as const, start: 0, end: 100, bottom: 8 },
];

/** Monthly stored / used energy with the savings line on a second axis. */
export function buildMonthlyOption(simulation: BatterySimulationResult): EChartsOption | null {
  const months = simulation.monthlyAnalysis;
  if (months.length === 0) return null;

  const labels = months.map((m) => formatMonthYear(m.month, m.year));

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const index = (params[0] as { dataIndex: number }).dataIndex;
        const month = months[index];
        return [
          `<strong>${labels[index]}</strong>`,
          `Uloženo do baterie: ${formatKwh(month.energyStored)}`,
          `Použito z baterie: ${formatKwh(month.energyUsed)}`,
          `Úspora: ${formatCurrency(month.savings)}`,
        ].join('<br/>');
      },
    },
    legend: { data: ['Uloženo do baterie', 'Použito z baterie', 'Úspora'], bottom: 0 },
    grid: GRID,
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: 45 } },
    yAxis: [
      { type: 'value', name: 'kWh', axisLabel: { formatter: formatAxisNumber } },
      {
        type: 'value',
        name: 'Kč',
        position: 'right',
        splitLine: { show: false },
        axisLabel: { formatter: formatAxisNumber },
      },
    ],
    series: [
      {
        name: 'Uloženo do baterie',
        type: 'bar',
        data: months.map((m) => Number(m.energyStored.toFixed(1))),
        itemStyle: { color: CHART_PALETTE.green },
      },
      {
        name: 'Použito z baterie',
        type: 'bar',
        data: months.map((m) => Number(m.energyUsed.toFixed(1))),
        itemStyle: { color: CHART_PALETTE.teal },
      },
      {
        name: 'Úspora',
        type: 'line',
        yAxisIndex: 1,
        data: months.map((m) => Number(m.savings.toFixed(0))),
        itemStyle: { color: CHART_PALETTE.amber },
      },
    ],
  };
}

/** Daily grid purchase, with days the battery turned into off-grid days highlighted. */
export function buildDailyImportOption(
  simulation: BatterySimulationResult
): EChartsOption | null {
  const days = simulation.dailyGridImport;
  if (days.length === 0) return null;

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const index = (params[0] as { dataIndex: number }).dataIndex;
        const day = days[index];
        const lines = [
          `<strong>${formatDate(day.date)}</strong>`,
          `Dokup ze sítě: ${formatKwh(day.gridImport, 2)}`,
          `Bez baterie by to bylo: ${formatKwh(day.gridImportOriginal, 2)}`,
          `Pokryto baterií: ${formatPercent(day.importCoveredPercent)}`,
        ];
        if (day.isOffGrid) {
          lines.push(
            day.wasAlreadyOffGrid
              ? 'Bez dokupu i bez baterie'
              : '★ Ostrovní den díky baterii'
          );
        }
        return lines.join('<br/>');
      },
    },
    grid: GRID,
    xAxis: {
      type: 'category',
      data: days.map((d) => d.date.getTime()),
      axisLabel: {
        rotate: 45,
        formatter: (value: string) => formatDayMonth(new Date(Number(value))),
      },
    },
    yAxis: { type: 'value', name: 'kWh', axisLabel: { formatter: formatAxisNumber } },
    dataZoom: ZOOM,
    series: [
      {
        name: 'Dokup ze sítě',
        type: 'bar',
        data: days.map((d) => ({
          value: d.gridImport,
          itemStyle: {
            // Amber marks a day the battery made self-sufficient; a day that
            // needed nothing even without a battery is not the battery's doing.
            color: d.isOffGrid
              ? d.wasAlreadyOffGrid
                ? CHART_PALETTE.textMuted
                : CHART_PALETTE.amber
              : CHART_PALETTE.coral,
          },
        })),
      },
    ],
  };
}

/** Average state of charge per day. */
export function buildChargeLevelOption(
  simulation: BatterySimulationResult,
  config: BatteryConfig
): EChartsOption | null {
  const levels = simulation.dailyAverageLevels;
  if (levels.length === 0) return null;

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const point = params[0] as { dataIndex: number; value: number };
        const level = levels[point.dataIndex];
        return `<strong>${formatDate(parseLocalDateKey(level.date))}</strong><br/>Průměrný stav: ${formatKwh(level.avgCharge, 2)}`;
      },
    },
    grid: GRID,
    xAxis: {
      type: 'category',
      data: levels.map((l) => l.date),
      axisLabel: {
        rotate: 45,
        formatter: (value: string) => formatDayMonth(parseLocalDateKey(value)),
      },
    },
    yAxis: {
      type: 'value',
      name: 'Stav baterie (kWh)',
      max: Math.max(1, config.capacity),
      axisLabel: { formatter: formatAxisNumber },
    },
    dataZoom: ZOOM,
    series: [
      {
        type: 'line',
        data: levels.map((l) => Number(l.avgCharge.toFixed(2))),
        areaStyle: { color: AMBER_FILL },
        lineStyle: { color: CHART_PALETTE.amber },
        itemStyle: { color: CHART_PALETTE.amber },
        smooth: true,
        symbol: 'none',
      },
    ],
  };
}

/**
 * Savings as a function of battery capacity, with the recommendation marked.
 *
 * This is the evidence behind the recommended size: the curve rises steeply and
 * then flattens, and the marked point sits at the knee.
 */
export function buildCapacityCurveOption(
  curve: CapacityCurvePoint[],
  recommendedCapacity: number,
  selectedCapacity: number
): EChartsOption | null {
  if (curve.length === 0) return null;

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const index = (params[0] as { dataIndex: number }).dataIndex;
        const point = curve[index];
        return [
          `<strong>${formatNumber(point.capacity, 1)} kWh</strong>`,
          `Úspora: ${formatCurrency(point.savingsPerYear)} / rok`,
          `Méně nakoupeno: ${formatKwh(point.gridImportReductionPerYear)} / rok`,
          `Dnů bez dokupu: ${formatNumber(point.offGridDaysPerYear, 0)}`,
        ].join('<br/>');
      },
    },
    grid: { ...GRID, bottom: '12%' },
    xAxis: {
      type: 'category',
      name: 'Kapacita (kWh)',
      nameLocation: 'middle',
      nameGap: 30,
      data: curve.map((p) => p.capacity),
      axisLabel: {
        formatter: (value: string) => formatAxisNumber(Number(value)),
        interval: (index: number) => index % 4 === 0,
      },
    },
    yAxis: {
      type: 'value',
      name: 'Kč / rok',
      axisLabel: { formatter: formatAxisNumber },
    },
    series: [
      {
        name: 'Roční úspora',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: curve.map((p) => Number(p.savingsPerYear.toFixed(0))),
        lineStyle: { color: CHART_PALETTE.amber, width: 3 },
        itemStyle: { color: CHART_PALETTE.amber },
        areaStyle: { color: AMBER_FILL },
        markPoint: {
          symbol: 'circle',
          symbolSize: 12,
          data: [
            {
              name: 'Doporučeno',
              xAxis: String(recommendedCapacity),
              yAxis: curve.find((p) => p.capacity === recommendedCapacity)?.savingsPerYear ?? 0,
              itemStyle: { color: CHART_PALETTE.teal },
              // Label sits above the marker; inside a pin it was clipped.
              label: {
                show: true,
                position: 'top',
                distance: 8,
                color: CHART_PALETTE.teal,
                fontSize: 11,
                formatter: 'Doporučeno',
              },
            },
          ],
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: CHART_PALETTE.textMuted, type: 'dashed' },
          data: [
            {
              xAxis: String(selectedCapacity),
              label: { show: true, formatter: 'Nastaveno', color: CHART_PALETTE.textMuted },
            },
          ],
        },
      },
    ],
  };
}
