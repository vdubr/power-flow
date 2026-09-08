import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import echarts from '../../theme/echartsCore';
import { Paper, Box, Typography, useTheme } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { useEnergyStore } from '../../store/energyStore';
import { useSmoothWheelZoom } from '../../hooks/useSmoothWheelZoom';
import { parseLocalDateKey } from '../../utils/dateUtils';
import {
  buildChartSeries,
  buildAccessibleChartSummary,
  buildNightMarkArea,
  computeBrushDateRange,
  formatChartTooltip,
  isTimeAxisAggregation,
  BrushAreaLike,
  SUMMARY_EDGE_POINTS,
} from '../../utils/chartSeriesBuilder';
import { CHART_PALETTE } from '../../theme/echartsTheme';
import { formatAxisNumber, formatDayMonth } from '../../utils/format';
import type { EChartsOption } from 'echarts';

const MainChart: React.FC = () => {
  const theme = useTheme();
  const chartRef = useRef<ReactEChartsCore>(null);

  const yearlyData = useEnergyStore((s) => s.yearlyData);
  const aggregationType = useEnergyStore((s) => s.chartConfig.aggregationType);
  const selectedYears = useEnergyStore((s) => s.chartConfig.selectedYears);
  const showConsumption = useEnergyStore((s) => s.chartConfig.showConsumption);
  const showProduction = useEnergyStore((s) => s.chartConfig.showProduction);
  const dayNightConfig = useEnergyStore((s) => s.chartConfig.dayNightConfig);
  const showSunOverlay = useEnergyStore((s) => s.chartConfig.showSunOverlay);
  const setTimeRange = useEnergyStore((s) => s.setTimeRange);

  const hasAnyData = yearlyData.size > 0;

  // Aggregate + shape the data for the current settings (pure, testable in isolation).
  const chartData = useMemo(
    () =>
      buildChartSeries({
        yearlyData,
        selectedYears,
        aggregationType,
        showConsumption,
        showProduction,
        dayNightConfig,
      }),
    [yearlyData, selectedYears, aggregationType, showConsumption, showProduction, dayNightConfig]
  );

  // Build chart options
  const options = useMemo(() => {
    if (!chartData || chartData.series.length === 0) {
      const message = hasAnyData
        ? 'Vyberte alespoň jeden rok pro zobrazení grafu'
        : 'Nahrajte data pro zobrazení grafu';
      return {
        title: {
          text: message,
          left: 'center',
          top: 'center',
          textStyle: {
            color: theme.palette.text.secondary,
            fontSize: 16,
          },
        },
      };
    }

    const isTimeAxis = isTimeAxisAggregation(aggregationType);

    const chartOptions: EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: { color: CHART_PALETTE.amber },
          crossStyle: { color: CHART_PALETTE.amber },
        },
        formatter: formatChartTooltip,
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
        // Colors come from the observatory ECharts theme (dataZoom/toolbox/brush slots).
      },
      brush: {
        toolbox: ['lineX', 'clear'],
        xAxisIndex: 0,
        brushLink: 'all',
        throttleType: 'debounce',
        throttleDelay: 300,
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
              // For comparison, key is "MM-DD"
              const [month, day] = value.split('-').map(Number);
              return formatDayMonth(new Date(2000, month - 1, day));
            }
            return formatDayMonth(parseLocalDateKey(value));
          },
        },
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          formatter: (value: number) => formatAxisNumber(value),
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
      const markArea = buildNightMarkArea(chartData, dayNightConfig.location);
      if (markArea) {
        const firstSeriesOpt = chartOptions.series[0] as { markArea?: object };
        firstSeriesOpt.markArea = markArea;
      }
    }

    return chartOptions;
  }, [
    chartData,
    hasAnyData,
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

  // Brush selection handler — converts the brushed coord range into a date
  // range (computeBrushDateRange) and stores it.
  const handleBrushEnd = useCallback(
    (params: unknown) => {
      type BrushEndParams = { areas?: BrushAreaLike[] };
      const area = (params as BrushEndParams)?.areas?.[0];
      const range = computeBrushDateRange(
        area,
        aggregationType,
        selectedYears.length,
        chartData?.dates ?? []
      );
      if (range) setTimeRange(range);
    },
    [aggregationType, selectedYears.length, chartData, setTimeRange]
  );

  const accessibleSummary = useMemo(() => buildAccessibleChartSummary(chartData), [chartData]);

  return (
    <Paper className="paper-card" sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Graf spotřeby a výroby
      </Typography>

      <Box
        ref={zoomBoxRef}
        className="blueprint-surface scale-in"
        role="img"
        aria-label="Graf spotřeby a výroby elektřiny v čase"
        aria-describedby="main-chart-data-summary"
        sx={{ height: 500 }}
      >
        <ReactEChartsCore
          echarts={echarts}
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

      {/* Screen-reader-only alternative to the canvas above (DESIGN.md, A1):
          per-series totals/min/max plus the first and last few points, not
          every rendered point. */}
      <Box id="main-chart-data-summary" sx={visuallyHidden}>
        <Typography component="h3">Textový souhrn dat grafu</Typography>
        {accessibleSummary.length === 0 ? (
          <Typography>Graf neobsahuje žádná data.</Typography>
        ) : (
          <table>
            <caption>
              Souhrn za zobrazené období, podle série (prvních a posledních{' '}
              {SUMMARY_EDGE_POINTS} hodnot)
            </caption>
            <thead>
              <tr>
                <th scope="col">Série</th>
                <th scope="col">Celkem</th>
                <th scope="col">Minimum</th>
                <th scope="col">Maximum</th>
                <th scope="col">Počet bodů</th>
                <th scope="col">Prvních hodnot</th>
                <th scope="col">Posledních hodnot</th>
              </tr>
            </thead>
            <tbody>
              {accessibleSummary.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>{s.total}</td>
                  <td>{s.min}</td>
                  <td>{s.max}</td>
                  <td>{s.count}</td>
                  <td>{s.firstPoints}</td>
                  <td>{s.lastPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>
    </Paper>
  );
};

export default MainChart;
