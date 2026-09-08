import * as echarts from 'echarts';

export const OBSERVATORY_THEME_NAME = 'observatory';

const palette = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

// ECharts cannot resolve CSS vars at render time for all fields; provide concrete fallbacks.
const concretePalette = [
  '#f5a524', // amber
  '#2dd4bf', // teal
  '#a78bfa', // violet
  '#fb7185', // coral
  '#34d399', // green
];

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
};

export const CHART_PALETTE = {
  amber: '#f5a524',
  teal: '#2dd4bf',
  violet: '#a78bfa',
  coral: '#fb7185',
  green: '#34d399',
  destructive: '#ef4444',
  surface: 'rgba(20,24,40,0.92)',
  border: 'rgba(255,255,255,0.08)',
  textMuted: '#b6b1a3',
} as const;

let registered = false;
export function registerObservatoryTheme(): void {
  if (registered) return;
  echarts.registerTheme(OBSERVATORY_THEME_NAME, observatoryTheme);
  registered = true;
}

export { palette as observatoryPaletteVars };
