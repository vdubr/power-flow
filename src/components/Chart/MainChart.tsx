import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { Paper, Box, Typography, useTheme } from '@mui/material';
import { useEnergyStore } from '../../store/energyStore';
import { useSmoothWheelZoom } from '../../hooks/useSmoothWheelZoom';
import {
  aggregateByDay,
  aggregateByHour,
  aggregateByWeek,
  aggregateByMonth,
  aggregateByDayNight,
  getRawData,
} from '../../utils/dataAggregation';
import { getDefaultLocation, getSunTimes } from '../../utils/sunCalculations';
import { formatLocalDateKey, parseLocalDateKey } from '../../utils/dateUtils';
import { EChartsOption } from 'echarts';
import {
  EnergyRecord,
  AggregatedData,
  DayNightData,
  LocationConfig,
} from '../../types/energy';

const COLORS = {
  consumption: '#ff6b6b',
  production: '#69db7c',
  consumptionLight: 'rgba(255, 107, 107, 0.3)',
  productionLight: 'rgba(105, 219, 124, 0.3)',
};

const YEAR_COLORS = [
  '#ff9800', // orange (primary)
  '#29b6f6', // light blue
  '#66bb6a', // green
  '#ab47bc', // purple
  '#ec407a', // pink
  '#26a69a', // teal
];

/**
 * Compute night-time markArea pairs ([{xAxis: nightStart}, {xAxis: nightEnd}])
 * for a date range. Each pair represents the night band from the previous day's
 * sunset to the current day's sunrise. Returns [] if range > 400 days
 * (performance guard).
 */
function computeSunMarkAreas(
  startDate: Date,
  endDate: Date,
  location: LocationConfig
): Array<[{ xAxis: number }, { xAxis: number }]> {
  const areas: Array<[{ xAxis: number }, { xAxis: number }]> = [];
  const daysSpan = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (daysSpan > 400) return areas;

  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  while (cur <= endDate) {
    const sun = getSunTimes(cur, location);
    // Night band: from previous sunset to today's sunrise
    const prevDay = new Date(cur);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevSun = getSunTimes(prevDay, location);
    if (
      prevSun.sunset instanceof Date &&
      !Number.isNaN(prevSun.sunset.getTime()) &&
      sun.sunrise instanceof Date &&
      !Number.isNaN(sun.sunrise.getTime())
    ) {
      areas.push([
        { xAxis: prevSun.sunset.getTime() },
        { xAxis: sun.sunrise.getTime() },
      ]);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return areas;
}

const MainChart: React.FC = () => {
  const theme = useTheme();
  const chartRef = useRef<ReactECharts>(null);

  const yearlyData = useEnergyStore((s) => s.yearlyData);
  const aggregationType = useEnergyStore((s) => s.chartConfig.aggregationType);
  const selectedYears = useEnergyStore((s) => s.chartConfig.selectedYears);
  const showConsumption = useEnergyStore((s) => s.chartConfig.showConsumption);
  const showProduction = useEnergyStore((s) => s.chartConfig.showProduction);
  const dayNightConfig = useEnergyStore((s) => s.chartConfig.dayNightConfig);
  const showSunOverlay = useEnergyStore((s) => s.chartConfig.showSunOverlay);
  const setTimeRange = useEnergyStore((s) => s.setTimeRange);

  // Get filtered and aggregated data
  const chartData = useMemo(() => {
    if (selectedYears.length === 0 || yearlyData.size === 0) {
      return null;
    }

    const series: Array<{
      name: string;
      type: 'line' | 'bar';
      data: Array<[string | number, number]>;
      color: string;
      areaStyle?: object;
      stack?: string;
      lineDashed?: boolean;
    }> = [];

    const allDates = new Set<string>();

    const latestSelectedYear = Math.max(...selectedYears);
    const isCompare = selectedYears.length > 1;

    // Process each selected year
    selectedYears.forEach((year, yearIndex) => {
      const yearData = yearlyData.get(year);
      if (!yearData) return;

      const records = yearData.records;

      // Aggregate based on type
      let aggregated: AggregatedData[] | DayNightData[] | EnergyRecord[];

      switch (aggregationType) {
        case 'raw':
          aggregated = getRawData(records); // Uniform sampling up to MAX_RAW_CHART_POINTS
          break;
        case 'hourly':
          aggregated = aggregateByHour(records);
          break;
        case 'dayNight':
          aggregated = aggregateByDayNight(
            records,
            dayNightConfig,
            dayNightConfig.mode === 'sun' ? dayNightConfig.location || getDefaultLocation() : undefined
          );
          break;
        case 'daily':
          aggregated = aggregateByDay(records);
          break;
        case 'weekly':
          aggregated = aggregateByWeek(records);
          break;
        case 'monthly':
          aggregated = aggregateByMonth(records);
          break;
        default:
          aggregated = aggregateByDay(records);
      }

      const dashed = isCompare && year !== latestSelectedYear;

      // Build series based on aggregation type
      if (aggregationType === 'raw') {
        const rawData = aggregated as EnergyRecord[];
        const yearColor = isCompare ? YEAR_COLORS[yearIndex % YEAR_COLORS.length] : null;

        if (showConsumption) {
          const consumptionData: Array<[number, number]> = rawData.map(r => [
            r.timestamp.getTime(),
            r.consumption,
          ]);
          series.push({
            name: isCompare ? `Spotřeba ${year}` : 'Spotřeba',
            type: 'line',
            data: consumptionData,
            color: yearColor || COLORS.consumption,
            areaStyle: { opacity: 0.1 },
            lineDashed: dashed,
          });
        }

        if (showProduction) {
          const productionData: Array<[number, number]> = rawData.map(r => [
            r.timestamp.getTime(),
            r.production,
          ]);
          series.push({
            name: isCompare ? `Výroba ${year}` : 'Výroba',
            type: 'line',
            data: productionData,
            color: yearColor ? `${yearColor}88` : COLORS.production,
            areaStyle: { opacity: 0.1 },
            lineDashed: dashed,
          });
        }
      } else if (aggregationType === 'hourly') {
        const aggData = aggregated as AggregatedData[];
        const yearColor = isCompare ? YEAR_COLORS[yearIndex % YEAR_COLORS.length] : null;

        if (showConsumption) {
          const consumptionData: Array<[number, number]> = aggData.map(d => [
            d.startDate.getTime(),
            d.totalConsumption,
          ]);
          series.push({
            name: isCompare ? `Spotřeba ${year}` : 'Spotřeba',
            type: 'line',
            data: consumptionData,
            color: yearColor || COLORS.consumption,
            areaStyle: { opacity: 0.1 },
            lineDashed: dashed,
          });
        }

        if (showProduction) {
          const productionData: Array<[number, number]> = aggData.map(d => [
            d.startDate.getTime(),
            d.totalProduction,
          ]);
          series.push({
            name: isCompare ? `Výroba ${year}` : 'Výroba',
            type: 'line',
            data: productionData,
            color: yearColor ? `${yearColor}88` : COLORS.production,
            areaStyle: { opacity: 0.1 },
            lineDashed: dashed,
          });
        }
      } else if (aggregationType === 'dayNight') {
        const dayNightData = aggregated as DayNightData[];

        // Add dates for x-axis
        dayNightData.forEach(d => {
          allDates.add(formatLocalDateKey(d.date));
        });

        if (showConsumption) {
          series.push({
            name: `Den - Spotřeba ${year}`,
            type: 'bar',
            stack: `consumption-${year}`,
            data: dayNightData.map(d => [formatLocalDateKey(d.date), d.dayConsumption]),
            color: COLORS.consumption,
          });
          series.push({
            name: `Noc - Spotřeba ${year}`,
            type: 'bar',
            stack: `consumption-${year}`,
            data: dayNightData.map(d => [formatLocalDateKey(d.date), d.nightConsumption]),
            color: COLORS.consumptionLight,
          });
        }

        if (showProduction) {
          series.push({
            name: `Den - Výroba ${year}`,
            type: 'bar',
            stack: `production-${year}`,
            data: dayNightData.map(d => [formatLocalDateKey(d.date), d.dayProduction]),
            color: COLORS.production,
          });
          series.push({
            name: `Noc - Výroba ${year}`,
            type: 'bar',
            stack: `production-${year}`,
            data: dayNightData.map(d => [formatLocalDateKey(d.date), d.nightProduction]),
            color: COLORS.productionLight,
          });
        }
      } else {
        const aggData = aggregated as AggregatedData[];
        const yearColor = isCompare ? YEAR_COLORS[yearIndex % YEAR_COLORS.length] : null;

        // For multi-year comparison, normalize dates to same year for overlay
        const normalizeDate = (date: Date): string => {
          if (isCompare) {
            // Use month-day format for comparison
            return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          }
          return formatLocalDateKey(date);
        };

        if (showConsumption) {
          const consumptionData: Array<[string, number]> = aggData.map(d => {
            const dateKey = normalizeDate(d.startDate);
            allDates.add(dateKey);
            return [dateKey, d.totalConsumption];
          });
          series.push({
            name: isCompare ? `Spotřeba ${year}` : 'Spotřeba',
            type: aggregationType === 'monthly' ? 'bar' : 'line',
            data: consumptionData,
            color: yearColor || COLORS.consumption,
            areaStyle: aggregationType !== 'monthly' ? { opacity: 0.1 } : undefined,
            lineDashed: aggregationType !== 'monthly' ? dashed : undefined,
          });
        }

        if (showProduction) {
          const productionData: Array<[string, number]> = aggData.map(d => {
            const dateKey = normalizeDate(d.startDate);
            allDates.add(dateKey);
            return [dateKey, d.totalProduction];
          });
          series.push({
            name: isCompare ? `Výroba ${year}` : 'Výroba',
            type: aggregationType === 'monthly' ? 'bar' : 'line',
            data: productionData,
            color: yearColor ? `${yearColor}88` : COLORS.production,
            areaStyle: aggregationType !== 'monthly' ? { opacity: 0.1 } : undefined,
            lineDashed: aggregationType !== 'monthly' ? dashed : undefined,
          });
        }
      }
    });

    return { series, dates: Array.from(allDates).sort() };
  }, [yearlyData, selectedYears, aggregationType, showConsumption, showProduction, dayNightConfig]);
  
  // Build chart options
  const options = useMemo(() => {
    if (!chartData || chartData.series.length === 0) {
      return {
        title: {
          text: 'Nahrajte data pro zobrazení grafu',
          left: 'center',
          top: 'center',
          textStyle: {
            color: theme.palette.text.secondary,
            fontSize: 16,
          },
        },
      };
    }

    const isTimeAxis = aggregationType === 'raw' || aggregationType === 'hourly';

    const chartOptions: EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: '#ff9800',
          },
          crossStyle: {
            color: '#ff9800',
          },
        },
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || params.length === 0) return '';

          type TooltipPoint = {
            axisValueLabel?: string;
            seriesName?: string;
            color?: string;
            value?: number | [string | number, number];
          };
          const points = params as TooltipPoint[];

          let tooltip = `<strong>${points[0].axisValueLabel ?? ''}</strong><br/>`;
          points.forEach((p) => {
            const raw = p.value;
            const value = typeof raw === 'number' ? raw : Array.isArray(raw) ? Number(raw[1]) || 0 : 0;
            tooltip += `<span style="color:${p.color}">●</span> ${p.seriesName}: ${value.toFixed(2)} kWh<br/>`;
          });
          return tooltip;
        },
      },
      legend: {
        data: chartData.series.map(s => s.name),
        bottom: 0,
        type: 'scroll',
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true,
      },
      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: 'none',
          },
          brush: {
            type: ['lineX', 'clear'],
          },
          restore: {},
          saveAsImage: {},
        },
        iconStyle: {
          borderColor: '#b0b0b0',
        },
      },
      brush: {
        toolbox: ['lineX', 'clear'],
        xAxisIndex: 0,
        brushLink: 'all',
        throttleType: 'debounce',
        throttleDelay: 300,
        brushStyle: {
          borderColor: 'rgba(255, 152, 0, 0.7)',
          color: 'rgba(255, 152, 0, 0.12)',
        },
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
          zoomOnMouseWheel: false,
          moveOnMouseWheel: false,
          minSpan: 0.5,
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
          bottom: 40,
          backgroundColor: '#1e1e1e',
          borderColor: '#3d3d3d',
          fillerColor: 'rgba(255, 152, 0, 0.2)',
          handleStyle: {
            color: '#ff9800',
          },
          textStyle: {
            color: '#b0b0b0',
          },
          dataBackground: {
            lineStyle: {
              color: '#3d3d3d',
            },
            areaStyle: {
              color: '#2d2d2d',
            },
          },
        },
      ],
      xAxis: isTimeAxis ? {
        type: 'time' as const,
        axisLabel: {
          rotate: 45,
        },
      } : {
        type: 'category' as const,
        data: chartData.dates,
        axisLabel: {
          rotate: 45,
          formatter: (value: string) => {
            if (selectedYears.length > 1) {
              // For comparison, show month-day
              const [month, day] = value.split('-');
              return `${day}.${month}.`;
            }
            // For single year, show full date
            const date = parseLocalDateKey(value);
            return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
          },
        },
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          formatter: (value: number) => value.toFixed(1),
        },
      },
      series: chartData.series.map(s => ({
        name: s.name,
        type: s.type,
        data: s.data,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2,
          type: s.lineDashed ? ('dashed' as const) : ('solid' as const),
        },
        opacity: s.lineDashed ? 0.7 : 1,
        itemStyle: {
          color: s.color,
        },
        areaStyle: s.areaStyle,
        stack: s.stack,
        large: true,
        largeThreshold: 1000,
      })),
    };

    // Sun overlay (markArea on first series), only for time-axis & single year
    if (
      showSunOverlay &&
      isTimeAxis &&
      selectedYears.length === 1 &&
      chartOptions.series &&
      Array.isArray(chartOptions.series) &&
      chartOptions.series[0]
    ) {
      // Compute visible date range from data of first series
      // Data is chronologically sorted – use first/last element to avoid O(n) spread
      const firstSeries = chartData.series[0];
      if (firstSeries && firstSeries.data.length > 0) {
        const firstX = firstSeries.data[0][0];
        const lastX = firstSeries.data[firstSeries.data.length - 1][0];
        const minT = typeof firstX === 'number' ? firstX : new Date(firstX as string).getTime();
        const maxT = typeof lastX === 'number' ? lastX : new Date(lastX as string).getTime();

        if (Number.isFinite(minT) && Number.isFinite(maxT)) {
          const location = dayNightConfig.location || getDefaultLocation();
          const areas = computeSunMarkAreas(
            new Date(minT),
            new Date(maxT),
            location
          );

          if (areas.length > 0) {
            const firstSeriesOpt = chartOptions.series[0] as {
              markArea?: object;
            };
            firstSeriesOpt.markArea = {
              silent: true,
              itemStyle: {
                color: 'rgba(91, 107, 134, 0.14)',
              },
              data: areas,
            };
          }
        }
      }
    }

    return chartOptions;
  }, [
    chartData,
    aggregationType,
    selectedYears,
    theme.palette.text.secondary,
    showSunOverlay,
    dayNightConfig.location,
  ]);
  
  // Custom smooth wheel zoom anchored on cursor.
  const zoomBoxRef = useSmoothWheelZoom(chartRef);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      chartRef.current?.getEchartsInstance()?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Brush selection handler — converts coord range to a date range and stores it.
  const handleBrushEnd = useCallback(
    (params: unknown) => {
      type BrushArea = {
        coordRange?: [number | string, number | string];
        range?: [number, number];
      };
      type BrushEndParams = { areas?: BrushArea[] };

      const p = params as BrushEndParams;
      const area = p?.areas?.[0];
      if (!area) return;

      const range = area.coordRange ?? area.range;
      if (!range || range.length < 2) return;

      const isTimeAxis =
        aggregationType === 'raw' || aggregationType === 'hourly';

      // Multi-year compare with category axis: skip (no meaningful date range).
      if (!isTimeAxis && selectedYears.length > 1) return;

      let startMs: number | null = null;
      let endMs: number | null = null;

      if (isTimeAxis) {
        // Time axis: coordRange is [startMs, endMs] (numbers). Numeric compare.
        const [s, e] = range as [number | string, number | string];
        const sNum = typeof s === 'number' ? s : Number(s);
        const eNum = typeof e === 'number' ? e : Number(e);
        if (Number.isFinite(sNum) && Number.isFinite(eNum)) {
          startMs = Math.min(sNum, eNum);
          endMs = Math.max(sNum, eNum);
        }
      } else {
        // Category axis (single year only) — convert indices to dates from chartData.dates
        if (!chartData || chartData.dates.length === 0) return;
        const [si, ei] = range as [number, number];
        const startIdx = Math.max(0, Math.min(chartData.dates.length - 1, Math.floor(Math.min(si, ei))));
        const endIdx = Math.max(0, Math.min(chartData.dates.length - 1, Math.ceil(Math.max(si, ei))));
        const startKey = chartData.dates[startIdx];
        const endKey = chartData.dates[endIdx];
        if (!startKey || !endKey) return;
        // Single-year category keys are YYYY-MM-DD (parseLocalDateKey)
        const startDate = parseLocalDateKey(startKey);
        const endDate = parseLocalDateKey(endKey);
        // Make endDate inclusive (end of day)
        endDate.setHours(23, 59, 59, 999);
        startMs = startDate.getTime();
        endMs = endDate.getTime();
      }

      if (
        startMs === null ||
        endMs === null ||
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        startMs >= endMs
      ) {
        return;
      }

      setTimeRange({ start: new Date(startMs), end: new Date(endMs) });
    },
    [aggregationType, selectedYears.length, chartData, setTimeRange]
  );

  return (
    <Paper className="paper-card" sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Graf spotřeby a výroby
      </Typography>

      <Box ref={zoomBoxRef} className="blueprint-surface scale-in" sx={{ height: 500 }}>
        <ReactECharts
          ref={chartRef}
          theme="observatory"
          option={options}
          style={{ height: '100%', width: '100%' }}
          notMerge={true}
          lazyUpdate={true}
          opts={{ renderer: 'canvas' }}
          onEvents={{ brushEnd: handleBrushEnd }}
        />
      </Box>
    </Paper>
  );
};

export default MainChart;
