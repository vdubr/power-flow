import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import echarts from '../../theme/echartsCore';
import { Paper, Box, Chip, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { useEnergyStore } from '../../store/energyStore';
import { useSmoothWheelZoom } from '../../hooks/useSmoothWheelZoom';
import {
  buildChartSeries,
  buildAccessibleChartSummary,
  buildNightMarkArea,
  buildUnitComparison,
  buildUnitComparisonRows,
  computeZoomDateRange,
  createChartTooltipFormatter,
  formatCategoryAxisLabel,
  formatZoomWindowLabel,
  isComparableUnitAggregation,
  isTimeAxisAggregation,
  isZoomedWindow,
  seriesAverage,
  SUMMARY_EDGE_POINTS,
  ZoomWindowLike,
} from '../../utils/chartSeriesBuilder';
import { CHART_PALETTE, withAlpha } from '../../theme/echartsTheme';
import { formatAxisNumber } from '../../utils/format';
import { formatKwh } from '../../utils/format';
import ChartAggregationSelect from './ChartAggregationSelect';
import ChartFullscreenButton from './ChartFullscreenButton';
import ChartModeToggle from './ChartModeToggle';
import ConsumptionAxisToggle from './ConsumptionAxisToggle';
import ChartSeriesFilter from './ChartSeriesFilter';
import { useFullscreen } from '../../hooks/useFullscreen';
import type { EChartsOption } from 'echarts';

/** How long the zoom has to settle before the panels follow it. */
const ZOOM_COMMIT_DELAY_MS = 400;

/** How much the series the user is not pointing at step back. */
const FADED_SERIES_OPACITY = 0.15;

const MainChart: React.FC = () => {
  const theme = useTheme();
  const chartRef = useRef<ReactEChartsCore>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const zoomCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [zoom, setZoom] = useState<{ chartKey: string; window: ZoomWindowLike } | null>(null);

  const yearlyData = useEnergyStore((s) => s.yearlyData);
  const availableYears = useEnergyStore((s) => s.availableYears);
  const aggregationType = useEnergyStore((s) => s.chartConfig.aggregationType);
  const selectedYears = useEnergyStore((s) => s.chartConfig.selectedYears);
  const showConsumption = useEnergyStore((s) => s.chartConfig.showConsumption);
  const showProduction = useEnergyStore((s) => s.chartConfig.showProduction);
  const dayNightConfig = useEnergyStore((s) => s.chartConfig.dayNightConfig);
  const consumptionSplit = useEnergyStore((s) => s.chartConfig.consumptionSplit);
  const chartMode = useEnergyStore((s) => s.chartConfig.chartMode);
  const consumptionBelowAxis = useEnergyStore((s) => s.chartConfig.consumptionBelowAxis);
  const hiddenSeries = useEnergyStore((s) => s.chartConfig.hiddenSeries);
  const highlightedSeries = useEnergyStore((s) => s.highlightedSeries);
  const setZoomRange = useEnergyStore((s) => s.setZoomRange);

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
        consumptionSplit,
        chartMode,
        consumptionBelowAxis,
      }),
    [
      yearlyData,
      selectedYears,
      aggregationType,
      showConsumption,
      showProduction,
      dayNightConfig,
      consumptionSplit,
      chartMode,
      consumptionBelowAxis,
    ]
  );

  /**
   * What the canvas actually draws. Chips in the filter under the chart hide
   * single series; the hidden ones stay in `chartData` so the filter can still
   * list them, and they stay in the active range so no number changes.
   */
  const visibleSeries = useMemo(
    () => (chartData?.series ?? []).filter((s) => !hiddenSeries.includes(s.name)),
    [chartData, hiddenSeries]
  );

  /**
   * The hovered unit's totals across every imported year, for the weekly and
   * monthly views. Built from all available years, not just the drawn ones, so
   * a July can be held up against the Julys that are off screen.
   */
  const unitComparison = useMemo(
    () =>
      buildUnitComparison({
        yearlyData,
        availableYears,
        selectedYears,
        aggregationType,
        consumptionSplit,
        dayNightConfig,
      }),
    [yearlyData, availableYears, selectedYears, aggregationType, consumptionSplit, dayNightConfig]
  );

  /**
   * Dashed line through the mean of what is drawn, one per quantity.
   *
   * Averaged over the visible series rather than per series: with four years
   * on screen eight average lines say less than two, and the question the line
   * answers is "is this bar above or below normal".
   */
  const averageMarkLine = useMemo(() => {
    // A negative plot value is energy bought (see `buildChartSeries`), so the
    // net line has to name the side it landed on.
    const netAverage = seriesAverage(visibleSeries);
    const groups: Array<{ label: string; series: typeof visibleSeries; color: string }> =
      chartMode === 'net'
        ? [
            {
              label: netAverage !== null && netAverage > 0 ? 'Ø přetok' : 'Ø dokoupeno',
              series: visibleSeries,
              color: CHART_PALETTE.amber,
            },
          ]
        : [
            {
              label: 'Ø spotřeba',
              series: visibleSeries.filter((s) => s.quantity === 'consumption'),
              color: CHART_PALETTE.consumption,
            },
            {
              label: 'Ø výroba',
              series: visibleSeries.filter((s) => s.quantity === 'production'),
              color: CHART_PALETTE.production,
            },
          ];

    const data = groups
      .map((group) => ({ ...group, average: seriesAverage(group.series) }))
      .filter((group) => group.average !== null && group.average !== 0)
      .map((group) => ({
        yAxis: group.average as number,
        // The label carries the energy, so it must not show the mirrored sign.
        name: group.label,
        lineStyle: { color: group.color, type: 'dashed' as const, width: 1, opacity: 0.8 },
        label: {
          formatter: `${group.label} ${formatKwh(Math.abs(group.average as number), 1)}`,
          // Below the zero line the label belongs under its line, otherwise it
          // sits on top of the bars it is describing.
          position: ((group.average as number) < 0 ? 'insideEndBottom' : 'insideEndTop') as
            | 'insideEndBottom'
            | 'insideEndTop',
          color: group.color,
          fontSize: 10,
        },
      }));

    return data.length > 0 ? { symbol: 'none', silent: true, data } : undefined;
  }, [visibleSeries, chartMode]);

  /**
   * Identity of the chart's shape. Changing any of it rebuilds the chart at the
   * full range, which retires both the zoom window and the selection made from it.
   */
  const chartKey = [
    aggregationType,
    chartMode,
    consumptionSplit,
    consumptionBelowAxis,
    selectedYears.join(','),
  ].join('|');

  useEffect(() => {
    setZoomRange(null);
  }, [chartKey, setZoomRange]);

  /** Why the chart is blank, if it is — each cause has its own way out. */
  const emptyMessage = useMemo(() => {
    if (!hasAnyData) return 'Nahrajte data pro zobrazení grafu';
    if (!chartData) return 'Vyberte alespoň jeden rok pro zobrazení grafu';
    if (chartData.series.length === 0) {
      return 'Zapněte spotřebu nebo výrobu ve filtru pod grafem';
    }
    if (visibleSeries.length === 0) return 'Všechny série jsou skryté ve filtru pod grafem';
    return null;
  }, [hasAnyData, chartData, visibleSeries.length]);

  // Build chart options
  const options = useMemo(() => {
    if (!chartData || emptyMessage) {
      return {
        title: {
          text: emptyMessage ?? '',
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
    const hasUnitComparison = isComparableUnitAggregation(aggregationType);

    const chartOptions: EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: hasUnitComparison
          ? {
              // A band across the whole plot height: the unit is what the user
              // is comparing, so the whole column is the hover target — no need
              // to hit one thin bar out of eight.
              type: 'shadow',
              shadowStyle: { color: withAlpha(CHART_PALETTE.amber, 0.12) },
            }
          : {
              type: 'cross',
              lineStyle: { color: CHART_PALETTE.amber },
              crossStyle: { color: CHART_PALETTE.amber },
            },
        // The cross-year table is tall; keep it inside the viewport and let it
        // scroll rather than run off the bottom of the page.
        confine: true,
        extraCssText: 'max-width:340px;max-height:70vh;overflow:auto;',
        formatter: createChartTooltipFormatter({
          unitComparison,
          series: visibleSeries,
          splitByKey: chartData.splitByKey,
          consumptionSplit,
          chartMode,
        }),
      },
      // No legend inside the canvas: it lives under the chart as ChartSeriesFilter,
      // which fits two rows, keeps the quantity switches next to the series they
      // control, and is reachable by keyboard and screen reader.
      legend: { show: false },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '13%',
        top: '10%',
        containLabel: true,
      },
      toolbox: {
        // No brush tool: the zoom window *is* the selection now, so there is
        // nothing left to draw by hand.
        feature: {
          dataZoom: {
            yAxisIndex: 'none',
          },
          restore: {},
          saveAsImage: {},
        },
        // Colors come from the observatory ECharts theme (dataZoom/toolbox slots).
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
          bottom: 8,
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
          formatter: (value: string) =>
            formatCategoryAxisLabel(value, selectedYears.length > 1, aggregationType),
        },
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          // Consumption is mirrored below zero, so the numbers there are
          // negative geometry, not negative energy.
          formatter: (value: number) => formatAxisNumber(Math.abs(value)),
        },
      },
      series: visibleSeries.map((s, index) => {
        // Pointing at a chip in the filter fades everything else, so the eye
        // can follow one year through a wall of bars. ECharts' own emphasis
        // only dims the rest on a real pointer event, which a chip is not.
        const faded = highlightedSeries.length > 0 && !highlightedSeries.includes(s.name);
        const opacity = faded ? FADED_SERIES_OPACITY : 1;

        return s.type === 'bar'
          ? {
              name: s.name,
              type: 'bar' as const,
              data: s.data,
              barMaxWidth: 28,
              itemStyle: { color: s.color, opacity },
              ...(index === 0 ? { markLine: averageMarkLine } : {}),
            }
          : {
              name: s.name,
              type: 'line' as const,
              data: s.data,
              smooth: true,
              symbol: 'none',
              lineStyle: {
                width: 2,
                type: s.lineDashed ? ('dashed' as const) : ('solid' as const),
                opacity,
              },
              opacity: (s.lineDashed ? 0.7 : 1) * opacity,
              itemStyle: { color: s.color, opacity },
              areaStyle: s.areaStyle,
              large: true,
              largeThreshold: 1000,
              ...(index === 0 ? { markLine: averageMarkLine } : {}),
            };
      }),
    };

    // On a time axis there is nothing to divide inside a point, so asking for
    // a half of the day marks the night hours instead.
    // One year only: overlaying two years of bands is unreadable.
    if (
      consumptionSplit !== 'sum' &&
      isTimeAxis &&
      selectedYears.length === 1 &&
      chartOptions.series &&
      Array.isArray(chartOptions.series) &&
      chartOptions.series[0]
    ) {
      const markArea = buildNightMarkArea(chartData, dayNightConfig);
      if (markArea) {
        const firstSeriesOpt = chartOptions.series[0] as { markArea?: object };
        firstSeriesOpt.markArea = markArea;
      }
    }

    return chartOptions;
  }, [
    chartData,
    visibleSeries,
    emptyMessage,
    aggregationType,
    selectedYears,
    theme.palette.text.secondary,
    consumptionSplit,
    chartMode,
    dayNightConfig,
    unitComparison,
    averageMarkLine,
    highlightedSeries,
  ]);

  // Custom smooth wheel zoom anchored on cursor.
  const zoomBoxRef = useSmoothWheelZoom(chartRef);

  // Handle resize. Entering or leaving fullscreen resizes the card without a
  // window resize event, so the canvas has to be told separately.
  useEffect(() => {
    const handleResize = () => {
      chartRef.current?.getEchartsInstance()?.resize();
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleResize);
    };
  }, []);

  /**
   * The zoom window is the selection.
   *
   * Zooming used to be only a way of looking; the range every panel can follow
   * had to be drawn separately with a brush tool. Now narrowing the chart is
   * what defines the range, so the tool is gone and "Výseč v grafu" applies
   * whatever is on screen.
   */
  const handleDataZoom = useCallback(() => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;
    const option = instance.getOption() as { dataZoom?: ZoomWindowLike[] };
    const current = option.dataZoom?.[0] ?? null;
    setZoom(current ? { chartKey, window: current } : null);

    // The range feeds the statistics and the battery simulation, so it must
    // not be recomputed on every wheel tick.
    if (zoomCommitRef.current !== null) clearTimeout(zoomCommitRef.current);
    zoomCommitRef.current = setTimeout(() => {
      setZoomRange(
        computeZoomDateRange(
          current ?? undefined,
          aggregationType,
          selectedYears.length,
          chartData?.dates ?? []
        )
      );
    }, ZOOM_COMMIT_DELAY_MS);
  }, [aggregationType, selectedYears.length, chartData, setZoomRange, chartKey]);

  // A pending commit from a chart that is no longer on screen would write a
  // range for data the user has already left.
  useEffect(
    () => () => {
      if (zoomCommitRef.current !== null) clearTimeout(zoomCommitRef.current);
    },
    []
  );

  const { isFullscreen } = useFullscreen(cardRef);
  // A window measured on a different view says nothing about this one, so it
  // is ignored rather than cleared — the chart is rebuilt from scratch
  // (`notMerge`) and starts at the full range again.
  const zoomWindow = zoom !== null && zoom.chartKey === chartKey ? zoom.window : null;
  const isZoomed = isZoomedWindow(zoomWindow);

  const zoomLabel = useMemo(
    () =>
      formatZoomWindowLabel(
        zoomWindow ?? undefined,
        aggregationType,
        selectedYears.length,
        chartData?.dates ?? []
      ),
    [zoomWindow, aggregationType, selectedYears.length, chartData]
  );

  // The text alternative describes what is drawn, so a series hidden in the
  // filter must not appear in it either.
  const accessibleSummary = useMemo(
    () =>
      buildAccessibleChartSummary(
        chartData
          ? { series: visibleSeries, dates: chartData.dates, splitByKey: chartData.splitByKey }
          : null
      ),
    [chartData, visibleSeries]
  );

  const unitComparisonRows = useMemo(
    () =>
      buildUnitComparisonRows(unitComparison, {
        chartMode,
        consumptionSplit,
        hasConsumption: visibleSeries.some((s) => s.quantity === 'consumption'),
        hasProduction: visibleSeries.some((s) => s.quantity === 'production'),
      }),
    [unitComparison, chartMode, consumptionSplit, visibleSeries]
  );

  return (
    <Paper ref={cardRef} className="paper-card" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
        <Typography variant="h6" gutterBottom>
          Graf spotřeby a výroby
        </Typography>
        <Stack direction="row" alignItems="center" gap={0.5}>
          {isZoomed && zoomLabel && (
            <Tooltip
              title="Rozsah, na který je graf přiblížený. Přepínač rozsahu nad statistikami ho použije pro celou stránku („Výseč v grafu“)."
              arrow
            >
              <Chip size="small" variant="outlined" label={`Výseč: ${zoomLabel}`} />
            </Tooltip>
          )}
          <ChartFullscreenButton targetRef={cardRef} />
        </Stack>
      </Stack>

      {/* What the chart draws and what one bar covers: both belong with the
          chart rather than in a settings panel further down. */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        gap={1.5}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ mb: 1.5 }}
      >
        <ChartAggregationSelect />
        <ChartModeToggle />
        <ConsumptionAxisToggle />
      </Stack>

      <Box
        ref={zoomBoxRef}
        className="blueprint-surface scale-in"
        role="img"
        aria-label="Graf spotřeby a výroby elektřiny v čase"
        aria-describedby="main-chart-data-summary"
        // Fullscreen is worth little if the chart keeps its 500 px.
        sx={{ height: isFullscreen ? '78vh' : 500 }}
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
          onEvents={{ dataZoom: handleDataZoom }}
        />
      </Box>

      {/* The legend, as two rows of real controls under the canvas. */}
      <ChartSeriesFilter />

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

        {/* The cross-year comparison is only on the tooltip otherwise, and a
            tooltip needs a pointer. Same numbers, as a table. */}
        {unitComparisonRows.length > 0 && (
          <table>
            <caption>
              Porovnání jednotky napříč všemi nahranými roky, včetně průměru a
              odchylky od něj
            </caption>
            <thead>
              <tr>
                <th scope="col">Jednotka</th>
                <th scope="col">Veličina</th>
                <th scope="col">Rok</th>
                <th scope="col">Hodnota</th>
                <th scope="col">Průměr</th>
                <th scope="col">Odchylka od průměru</th>
              </tr>
            </thead>
            <tbody>
              {unitComparisonRows.map((row) => (
                <tr key={`${row.unit}-${row.quantity}-${row.year}`}>
                  <td>{row.unit}</td>
                  <td>{row.quantity}</td>
                  <td>{row.year}</td>
                  <td>{row.value}</td>
                  <td>{row.average}</td>
                  <td>{row.vsAverage}</td>
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
