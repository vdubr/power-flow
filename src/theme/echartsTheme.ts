import * as echarts from 'echarts';

export const OBSERVATORY_THEME_NAME = 'observatory';

const palette = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

// ECharts cannot resolve CSS vars at render time for all fields (theme merge,
// canvas fill/stroke, string concatenation for alpha variants, …), so every
// color used anywhere in a chart is defined here once as a concrete hex, and
// consumed through `CHART_PALETTE` / `YEAR_SERIES_COLORS` / `withAlpha`.
// These mirror the dark-mode `--chart-*` and `--color-*` tokens in
// src/index.css; keep them in sync if the tokens change.
const HEX = {
  amber: '#f5a524', // --chart-1 / --color-primary dark
  teal: '#2dd4bf', // --chart-2 / --color-accent dark
  violet: '#a78bfa', // --chart-3 dark (also DESIGN.md "night depth")
  coral: '#fb7185', // --chart-4 dark
  green: '#34d399', // --chart-5 dark
  destructive: '#ef4444', // --color-destructive dark
  textMuted: '#b6b1a3', // --color-muted-foreground dark, chart label tone
  // No dedicated --chart-* token exists for a 6th series; picked to stay
  // visually distinct from the five above under the dark theme.
  skyBlue: '#60a5fa',
} as const;

// ECharts cannot resolve CSS vars at render time for all fields; provide concrete fallbacks.
const concretePalette = [HEX.amber, HEX.teal, HEX.violet, HEX.coral, HEX.green];

/**
 * Adds an alpha channel to a hex color and returns an `rgba(...)` string.
 *
 * Safer than the historical `${hex}88` concatenation: that silently produces
 * an invalid CSS/canvas color for 3-digit hex input (`#fff` + `88` = `#fff88`,
 * not a valid color), and does not work at all for the `var(--chart-*)`
 * strings used elsewhere in this theme. `alpha` is a 0–1 fraction.
 */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const observatoryTheme = {
  color: concretePalette,
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: 'var(--font-body), system-ui, sans-serif',
    color: '#e9e6df',
  },
  title: {
    textStyle: {
      fontFamily: 'var(--font-display), serif',
      color: '#f5f1e8',
      fontWeight: 600,
    },
  },
  legend: {
    icon: 'roundRect',
    itemWidth: 12,
    itemHeight: 12,
    padding: [4, 8],
    textStyle: {
      color: '#c8c3b6',
      fontFamily: 'var(--font-mono), monospace',
      fontSize: 11,
    },
  },
  grid: {
    borderColor: 'rgba(255,255,255,0.08)',
    containLabel: true,
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.18)' } },
    axisTick: { lineStyle: { color: 'rgba(255,255,255,0.18)' } },
    axisLabel: {
      color: '#b6b1a3',
      fontFamily: 'var(--font-mono), monospace',
      fontSize: 11,
    },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: '#b6b1a3',
      fontFamily: 'var(--font-mono), monospace',
      fontSize: 11,
    },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
  },
  line: {
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { width: 2 },
  },
  bar: {
    itemStyle: { borderRadius: [4, 4, 0, 0] },
    barGap: '20%',
    emphasis: {
      focus: 'series',
      itemStyle: {
        shadowBlur: 12,
        shadowColor: 'rgba(245,165,36,0.35)',
      },
    },
  },
  tooltip: {
    backgroundColor: 'rgba(20,24,40,0.92)',
    borderColor: 'rgba(255,255,255,0.08)',
    padding: [10, 14],
    textStyle: {
      color: '#f5f1e8',
      fontFamily: 'var(--font-body), system-ui, sans-serif',
      fontSize: 12,
    },
    axisPointer: {
      type: 'line',
      lineStyle: { color: 'rgba(255,255,255,0.15)', width: 1 },
      label: {
        backgroundColor: 'rgba(20,24,40,0.92)',
        color: '#f5f1e8',
      },
    },
    extraCssText:
      'backdrop-filter: blur(12px); border-radius: 12px; box-shadow: 0 18px 48px -24px rgba(0,0,0,.55);',
  },
  // Charts that declare their own dataZoom/toolbox/brush (MainChart) only set
  // structural options (type, start/end, throttling, feature list) and rely
  // on this theme merge for every color, so no chart component needs to
  // hardcode a hex or rgba() value.
  dataZoom: {
    backgroundColor: 'rgba(20,24,40,0.6)',
    borderColor: 'rgba(255,255,255,0.08)',
    fillerColor: withAlpha(HEX.amber, 0.18),
    handleStyle: {
      color: HEX.amber,
      borderColor: HEX.amber,
    },
    textStyle: {
      color: HEX.textMuted,
      fontFamily: 'var(--font-mono), monospace',
      fontSize: 11,
    },
    dataBackground: {
      lineStyle: { color: 'rgba(255,255,255,0.18)' },
      areaStyle: { color: 'rgba(255,255,255,0.06)' },
    },
    selectedDataBackground: {
      lineStyle: { color: HEX.amber },
      areaStyle: { color: withAlpha(HEX.amber, 0.18) },
    },
  },
  toolbox: {
    iconStyle: {
      borderColor: HEX.textMuted,
    },
    emphasis: {
      iconStyle: { borderColor: HEX.amber },
    },
  },
  brush: {
    brushStyle: {
      borderColor: withAlpha(HEX.amber, 0.7),
      color: withAlpha(HEX.amber, 0.12),
    },
  },
};

export const CHART_PALETTE = {
  amber: HEX.amber,
  teal: HEX.teal,
  violet: HEX.violet,
  coral: HEX.coral,
  green: HEX.green,
  destructive: HEX.destructive,
  /** Consumption (energy drawn from the grid) is coral/red throughout the app. */
  consumption: HEX.coral,
  /** Production (energy exported to the grid) is green throughout the app. */
  production: HEX.green,
  surface: 'rgba(20,24,40,0.92)',
  border: 'rgba(255,255,255,0.08)',
  textMuted: HEX.textMuted,
} as const;

/**
 * One color per compared year, used by the chart when several years are
 * selected (and, by convention, anywhere else a year needs a stable color –
 * year badges, chips). Index by `yearIndex % YEAR_SERIES_COLORS.length`.
 */
export const YEAR_SERIES_COLORS: readonly string[] = [
  HEX.amber,
  HEX.teal,
  HEX.violet,
  HEX.coral,
  HEX.green,
  HEX.skyBlue,
];

let registered = false;
export function registerObservatoryTheme(): void {
  if (registered) return;
  echarts.registerTheme(OBSERVATORY_THEME_NAME, observatoryTheme);
  registered = true;
}

export { palette as observatoryPaletteVars };
