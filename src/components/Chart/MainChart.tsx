import React, { useMemo, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Paper, Box, Typography, useTheme } from '@mui/material';
import { useEnergyStore } from '../../store/energyStore';
import {
  aggregateByDay,
  aggregateByWeek,
  aggregateByMonth,
  aggregateByDayNight,
} from '../../utils/dataAggregation';
import { getDefaultLocation } from '../../utils/sunCalculations';
import { EChartsOption } from 'echarts';
import { EnergyRecord, AggregatedData, DayNightData } from '../../types/energy';

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

const MainChart: React.FC = () => {
  const theme = useTheme();
  const chartRef = useRef<ReactECharts>(null);
  
  const {
    yearlyData,
    chartConfig,
    availableYears,
  } = useEnergyStore();
  
  const {
    aggregationType,
    selectedYears,
    showConsumption,
    showProduction,
    dayNightConfig,
  } = chartConfig;
  
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
    }> = [];
    
    const allDates = new Set<string>();
    
    // Process each selected year
    selectedYears.forEach((year, yearIndex) => {
      const yearData = yearlyData.get(year);
      if (!yearData) return;
      
      const records = yearData.records;
      
      // Aggregate based on type
      let aggregated: AggregatedData[] | DayNightData[] | EnergyRecord[];
      
      switch (aggregationType) {
        case 'raw':
          aggregated = records.slice(0, 5000); // Limit for performance
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
      
      // Build series based on aggregation type
      if (aggregationType === 'raw') {
        const rawData = aggregated as EnergyRecord[];
        const yearColor = selectedYears.length > 1 ? YEAR_COLORS[yearIndex % YEAR_COLORS.length] : null;
        
        if (showConsumption) {
          const consumptionData: Array<[string, number]> = rawData.map(r => [
            r.timestamp.toISOString(),
            r.consumption,
          ]);
          series.push({
            name: selectedYears.length > 1 ? `Spotřeba ${year}` : 'Spotřeba',
            type: 'line',
            data: consumptionData,
            color: yearColor || COLORS.consumption,
            areaStyle: { opacity: 0.1 },
          });
        }
        
        if (showProduction) {
          const productionData: Array<[string, number]> = rawData.map(r => [
            r.timestamp.toISOString(),
            r.production,
          ]);
          series.push({
            name: selectedYears.length > 1 ? `Výroba ${year}` : 'Výroba',
            type: 'line',
            data: productionData,
            color: yearColor ? `${yearColor}88` : COLORS.production,
            areaStyle: { opacity: 0.1 },
          });
        }
      } else if (aggregationType === 'dayNight') {
        const dayNightData = aggregated as DayNightData[];
        
        // Add dates for x-axis
        dayNightData.forEach(d => {
          allDates.add(d.date.toISOString().split('T')[0]);
        });
        
        if (showConsumption) {
          series.push({
            name: `Den - Spotřeba ${year}`,
            type: 'bar',
            stack: `consumption-${year}`,
            data: dayNightData.map(d => [d.date.toISOString().split('T')[0], d.dayConsumption]),
            color: COLORS.consumption,
          });
          series.push({
            name: `Noc - Spotřeba ${year}`,
            type: 'bar',
            stack: `consumption-${year}`,
            data: dayNightData.map(d => [d.date.toISOString().split('T')[0], d.nightConsumption]),
            color: COLORS.consumptionLight,
          });
        }
        
        if (showProduction) {
          series.push({
            name: `Den - Výroba ${year}`,
            type: 'bar',
            stack: `production-${year}`,
            data: dayNightData.map(d => [d.date.toISOString().split('T')[0], d.dayProduction]),
            color: COLORS.production,
          });
          series.push({
            name: `Noc - Výroba ${year}`,
            type: 'bar',
            stack: `production-${year}`,
            data: dayNightData.map(d => [d.date.toISOString().split('T')[0], d.nightProduction]),
            color: COLORS.productionLight,
          });
        }
      } else {
        const aggData = aggregated as AggregatedData[];
        const yearColor = selectedYears.length > 1 ? YEAR_COLORS[yearIndex % YEAR_COLORS.length] : null;
        
        // For multi-year comparison, normalize dates to same year for overlay
        const normalizeDate = (date: Date): string => {
          if (selectedYears.length > 1) {
            // Use month-day format for comparison
            return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          }
          return date.toISOString().split('T')[0];
        };
        
        if (showConsumption) {
          const consumptionData: Array<[string, number]> = aggData.map(d => {
            const dateKey = normalizeDate(d.startDate);
            allDates.add(dateKey);
            return [dateKey, d.totalConsumption];
          });
          series.push({
            name: selectedYears.length > 1 ? `Spotřeba ${year}` : 'Spotřeba',
            type: aggregationType === 'monthly' ? 'bar' : 'line',
            data: consumptionData,
            color: yearColor || COLORS.consumption,
            areaStyle: aggregationType !== 'monthly' ? { opacity: 0.1 } : undefined,
          });
        }
        
        if (showProduction) {
          const productionData: Array<[string, number]> = aggData.map(d => {
            const dateKey = normalizeDate(d.startDate);
            allDates.add(dateKey);
            return [dateKey, d.totalProduction];
          });
          series.push({
            name: selectedYears.length > 1 ? `Výroba ${year}` : 'Výroba',
            type: aggregationType === 'monthly' ? 'bar' : 'line',
            data: productionData,
            color: yearColor ? `${yearColor}88` : COLORS.production,
            areaStyle: aggregationType !== 'monthly' ? { opacity: 0.1 } : undefined,
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
    
    const isTimeAxis = aggregationType === 'raw';
    
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
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        borderColor: '#3d3d3d',
        textStyle: {
          color: '#ffffff',
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          
          let tooltip = `<strong>${params[0].axisValueLabel}</strong><br/>`;
          params.forEach((p: any) => {
            const value = typeof p.value === 'number' ? p.value : p.value?.[1] || 0;
            tooltip += `<span style="color:${p.color}">●</span> ${p.seriesName}: ${value.toFixed(2)} kWh<br/>`;
          });
          return tooltip;
        },
      },
      legend: {
        data: chartData.series.map(s => s.name),
        bottom: 0,
        type: 'scroll',
        textStyle: {
          color: '#b0b0b0',
        },
        pageTextStyle: {
          color: '#b0b0b0',
        },
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
          restore: {},
          saveAsImage: {},
        },
        iconStyle: {
          borderColor: '#b0b0b0',
        },
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
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
          color: '#b0b0b0',
        },
        axisLine: {
          lineStyle: {
            color: '#3d3d3d',
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed' as const,
            color: '#2d2d2d',
          },
        },
      } : {
        type: 'category' as const,
        data: chartData.dates,
        axisLabel: {
          rotate: 45,
          color: '#b0b0b0',
          formatter: (value: string) => {
            if (selectedYears.length > 1) {
              // For comparison, show month-day
              const [month, day] = value.split('-');
              return `${day}.${month}.`;
            }
            // For single year, show full date
            const date = new Date(value);
            return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
          },
        },
        axisLine: {
          lineStyle: {
            color: '#3d3d3d',
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed' as const,
            color: '#2d2d2d',
          },
        },
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: {
          color: '#b0b0b0',
        },
        axisLabel: {
          color: '#b0b0b0',
          formatter: (value: number) => value.toFixed(1),
        },
        axisLine: {
          lineStyle: {
            color: '#3d3d3d',
          },
        },
        splitLine: {
          lineStyle: {
            color: '#2d2d2d',
          },
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
        },
        itemStyle: {
          color: s.color,
        },
        areaStyle: s.areaStyle,
        stack: s.stack,
        large: true,
        largeThreshold: 1000,
      })),
    };
    return chartOptions;
  }, [chartData, aggregationType, selectedYears.length, theme.palette.text.secondary]);
  
  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      chartRef.current?.getEchartsInstance()?.resize();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const hasData = availableYears.length > 0;
  
  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%', minHeight: 500 }}>
      <Typography variant="h6" gutterBottom>
        Graf spotřeby a výroby
      </Typography>
      
      <Box sx={{ height: 'calc(100% - 40px)', minHeight: 450 }}>
        <ReactECharts
          ref={chartRef}
          option={options}
          style={{ height: '100%', width: '100%' }}
          notMerge={true}
          lazyUpdate={true}
          opts={{ renderer: 'canvas' }}
        />
      </Box>
    </Paper>
  );
};

export default MainChart;
