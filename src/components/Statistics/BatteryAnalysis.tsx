import React, { useMemo, useRef } from 'react';
import {
  Paper,
  Typography,
  Box,
  Stack,
  Slider,
  TextField,
  Card,
  CardContent,
  Alert,
  InputAdornment,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import SavingsIcon from '@mui/icons-material/Savings';
import BoltIcon from '@mui/icons-material/Bolt';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import OfflineBoltIcon from '@mui/icons-material/OfflineBolt';
import PowerOffIcon from '@mui/icons-material/PowerOff';
import ReactECharts from 'echarts-for-react';
import { useEnergyStore } from '../../store/energyStore';
import { useSmoothWheelZoom } from '../../hooks/useSmoothWheelZoom';
import { formatCurrency, formatEnergy } from '../../utils/format';
import { formatLocalDateKey, parseLocalDateKey } from '../../utils/dateUtils';
import { CHART_PALETTE } from '../../theme/echartsTheme';
import { RangeControl } from '../Common';

const MONTH_NAMES = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'
];

interface HeroTileProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle?: string;
  color: string;
}

const HeroTile: React.FC<HeroTileProps> = ({ icon, title, value, subtitle, color }) => (
  <Card
    sx={{
      height: '100%',
      borderRadius: 'var(--radius-lg, 16px)',
      border: '1px solid var(--color-border)',
      bgcolor: 'var(--color-card)',
      boxShadow: 'none',
    }}
  >
    <CardContent>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={1.5}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color,
            bgcolor: `color-mix(in oklab, ${color} 18%, transparent)`,
          }}
        >
          {icon}
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}
        >
          {title}
        </Typography>
      </Stack>
      <Typography
        variant="h4"
        fontWeight={600}
        sx={{
          color,
          fontFamily: 'var(--font-display, "Fraunces", serif)',
          mb: 0.5,
        }}
      >
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </CardContent>
  </Card>
);

interface SmallStatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const SmallStat: React.FC<SmallStatProps> = ({ icon, label, value }) => (
  <Stack
    direction="row"
    alignItems="center"
    justifyContent="space-between"
    sx={{
      px: 2,
      py: 1.25,
      borderRadius: 'var(--radius-md, 12px)',
      border: '1px solid var(--color-border)',
      bgcolor: 'rgba(255,255,255,0.02)',
    }}
  >
    <Stack direction="row" alignItems="center" spacing={1.25}>
      <Box sx={{ color: 'var(--color-muted-foreground)', display: 'flex' }}>{icon}</Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Stack>
    <Typography variant="body2" fontWeight={600}>
      {value}
    </Typography>
  </Stack>
);

const BatteryAnalysis: React.FC = () => {
  const batteryConfig = useEnergyStore((s) => s.batteryConfig);
  const batterySimulation = useEnergyStore((s) => s.batterySimulation);
  const capacityRecommendation = useEnergyStore((s) => s.capacityRecommendation);
  const setBatteryConfig = useEnergyStore((s) => s.setBatteryConfig);
  const hasData = useEnergyStore((s) => s.allRecords.length > 0);

  // Refs for the two zoomable charts (daily grid import + battery state).
  const dailyGridImportChartRef = useRef<ReactECharts>(null);
  const batteryStateChartRef = useRef<ReactECharts>(null);
  const dailyGridImportBoxRef = useSmoothWheelZoom(dailyGridImportChartRef);
  const batteryStateBoxRef = useSmoothWheelZoom(batteryStateChartRef);

  // Derived metrics for hero tiles and secondary tiles
  const remainingGridImport = batterySimulation
    ? batterySimulation.dailyGridImport.reduce((sum, d) => sum + d.gridImport, 0)
    : 0;
  const remainingGridImportCost = remainingGridImport * batteryConfig.electricityPrice;

  const avgCoveragePercent = useMemo(() => {
    if (!batterySimulation || batterySimulation.dailyGridImport.length === 0) return 0;
    return (
      batterySimulation.dailyGridImport.reduce((s, d) => s + d.importCoveredPercent, 0) /
      batterySimulation.dailyGridImport.length
    );
  }, [batterySimulation]);

  // Chart options for monthly analysis
  const monthlyChartOptions = useMemo(() => {
    if (!batterySimulation) return null;

    const monthlyData = batterySimulation.monthlyAnalysis;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        data: ['Uloženo do baterie', 'Použito z baterie', 'Úspora'],
        bottom: 0,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: monthlyData.map(d => `${MONTH_NAMES[d.month - 1]} ${d.year}`),
        axisLabel: {
          rotate: 45,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'kWh',
          position: 'left',
        },
        {
          type: 'value',
          name: 'Kč',
          position: 'right',
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Uloženo do baterie',
          type: 'bar',
          data: monthlyData.map(d => d.energyStored.toFixed(1)),
          itemStyle: { color: CHART_PALETTE.green },
        },
        {
          name: 'Použito z baterie',
          type: 'bar',
          data: monthlyData.map(d => d.energyUsed.toFixed(1)),
          itemStyle: { color: CHART_PALETTE.teal },
        },
        {
          name: 'Úspora',
          type: 'line',
          yAxisIndex: 1,
          data: monthlyData.map(d => d.savings.toFixed(0)),
          itemStyle: { color: CHART_PALETTE.amber },
        },
      ],
    };
  }, [batterySimulation]);

  // Chart for daily grid import (energy purchase)
  const dailyGridImportChartOptions = useMemo(() => {
    if (!batterySimulation || batterySimulation.dailyGridImport.length === 0) return null;

    const dailyData = batterySimulation.dailyGridImport;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const dataIndex = (params[0] as { dataIndex: number }).dataIndex;
          const dayData = dailyData[dataIndex];
          const date = new Date(dayData.date).toLocaleDateString('cs-CZ');

          let html = `<strong>${date}</strong><br/>`;
          html += `<span style="color:${CHART_PALETTE.coral}">●</span> Dokup ze sítě: ${dayData.gridImport.toFixed(2)} kWh<br/>`;
          html += `<span style="color:${CHART_PALETTE.textMuted}">○</span> Původní dokup: ${dayData.gridImportOriginal.toFixed(2)} kWh<br/>`;
          html += `<span style="color:${CHART_PALETTE.green}">●</span> Pokrytí baterií: ${dayData.importCoveredPercent.toFixed(1)}%<br/>`;
          if (dayData.isOffGrid) {
            html += `<span style="color:${CHART_PALETTE.amber}">★ Ostrovní den</span>`;
          }
          return html;
        },
      },
      legend: {
        data: ['Dokup ze sítě', 'Ostrovní dny'],
        bottom: 0,
        selectedMode: false,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: dailyData.map(d => formatLocalDateKey(d.date)),
        axisLabel: {
          rotate: 45,
          formatter: (value: string) => {
            const [, month, day] = value.split('-');
            return `${day}.${month}.`;
          },
        },
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
          zoomOnMouseWheel: false,
          moveOnMouseWheel: false,
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
        },
      ],
      series: [
        {
          // Invisible dummy series to satisfy ECharts legend for 'Ostrovní dny'
          name: 'Ostrovní dny',
          type: 'bar',
          data: [],
          itemStyle: { color: CHART_PALETTE.amber },
        },
        {
          name: 'Dokup ze sítě',
          type: 'bar',
          data: dailyData.map((d) => ({
            value: d.gridImport,
            itemStyle: {
              color: d.isOffGrid ? CHART_PALETTE.amber : CHART_PALETTE.coral,
            },
          })),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: {
              color: CHART_PALETTE.green,
              type: 'dashed',
            },
            data: [
              {
                yAxis: 0,
                label: {
                  show: true,
                  formatter: 'Ostrovní provoz',
                  color: CHART_PALETTE.green,
                },
              },
            ],
          },
        },
      ],
    };
  }, [batterySimulation]);

  // Chart for battery state over time (daily averages, pre-computed in simulateBattery)
  const batteryStateChartOptions = useMemo(() => {
    if (!batterySimulation || batterySimulation.dailyAverageLevels.length === 0) return null;

    // dailyAverageLevels is already sorted and aggregated – just slice for readability
    const chartData = batterySimulation.dailyAverageLevels.slice(0, 365);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: chartData.map(d => d.date),
        axisLabel: {
          rotate: 45,
          formatter: (value: string) => {
            const date = parseLocalDateKey(value);
            return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
          },
        },
      },
      yAxis: {
        type: 'value',
        name: 'Stav baterie (kWh)',
        max: batteryConfig.capacity,
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
          zoomOnMouseWheel: false,
          moveOnMouseWheel: false,
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
        },
      ],
      series: [
        {
          type: 'line',
          data: chartData.map(d => d.avgCharge.toFixed(2)),
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(245, 165, 36, 0.5)' },
                { offset: 1, color: 'rgba(245, 165, 36, 0.1)' },
              ],
            },
          },
          lineStyle: { color: CHART_PALETTE.amber },
          itemStyle: { color: CHART_PALETTE.amber },
          smooth: true,
          symbol: 'none',
        },
      ],
    };
  }, [batterySimulation, batteryConfig.capacity]);

  return (
    <Paper className="paper-card" sx={{ p: 3 }}>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        mb={3}
        flexWrap="wrap"
        gap={2}
      >
        <Box>
          <Typography variant="h6">Baterie a soběstačnost</Typography>
          <Typography variant="body2" color="text.secondary">
            Simulace úspor při použití domácí baterie pro ukládání přebytků z FVE.
          </Typography>
        </Box>
        <RangeControl />
      </Stack>

      {!hasData && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Nahrajte data pro spuštění simulace baterie.
        </Alert>
      )}

      {/* 4 hero tiles */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <HeroTile
            icon={<SavingsIcon />}
            title="Roční úspora"
            value={formatCurrency(batterySimulation?.savingsPerYear ?? 0)}
            subtitle={`Při ceně ${batteryConfig.electricityPrice.toFixed(2)} Kč/kWh`}
            color="var(--color-primary)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <HeroTile
            icon={<BatteryChargingFullIcon />}
            title="Doporučená baterie"
            value={`${capacityRecommendation?.capacity ?? 0} kWh`}
            subtitle="Podle denních přebytků a deficitů"
            color="var(--chart-2)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <HeroTile
            icon={<OfflineBoltIcon />}
            title="Ostrovní dny"
            value={`${batterySimulation?.offGridDays ?? 0}`}
            subtitle={`${(batterySimulation?.offGridDaysPercent ?? 0).toFixed(1)} % ze všech dnů`}
            color="var(--chart-5)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <HeroTile
            icon={<TrendingDownIcon />}
            title="Nutno dokoupit"
            value={formatEnergy(remainingGridImport)}
            subtitle={formatCurrency(remainingGridImportCost)}
            color="var(--color-destructive)"
          />
        </Grid>
      </Grid>

      {/* Co kdyby section */}
      <Box mb={3}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Co kdyby
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Upravte parametry baterie a sledujte, jak se změní úspora a využití.
        </Typography>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Box mb={2}>
              <Typography gutterBottom>
                Kapacita baterie: <strong>{batteryConfig.capacity} kWh</strong>
              </Typography>
              <Slider
                value={batteryConfig.capacity}
                onChange={(_, value) => setBatteryConfig({ capacity: value as number })}
                min={2}
                max={30}
                step={0.5}
                marks={[
                  { value: 5, label: '5' },
                  { value: 10, label: '10' },
                  { value: 15, label: '15' },
                  { value: 20, label: '20' },
                  { value: 25, label: '25' },
                  { value: 30, label: '30' },
                ]}
                disabled={!hasData}
                valueLabelDisplay="auto"
              />
            </Box>

            <Box mb={2}>
              <Typography gutterBottom>
                Max. vybití: <strong>{batteryConfig.maxDischargePercent}%</strong>
              </Typography>
              <Slider
                value={batteryConfig.maxDischargePercent}
                onChange={(_, value) => setBatteryConfig({ maxDischargePercent: value as number })}
                min={50}
                max={100}
                step={5}
                marks={[
                  { value: 50, label: '50%' },
                  { value: 70, label: '70%' },
                  { value: 80, label: '80%' },
                  { value: 90, label: '90%' },
                  { value: 100, label: '100%' },
                ]}
                disabled={!hasData}
              />
            </Box>

            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField
                  label="Minimální rezerva"
                  type="number"
                  value={batteryConfig.minReserve}
                  onChange={(e) => setBatteryConfig({ minReserve: parseFloat(e.target.value) || 0 })}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">kWh</InputAdornment>,
                  }}
                  size="small"
                  fullWidth
                  disabled={!hasData}
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  label="Cena elektřiny"
                  type="number"
                  value={batteryConfig.electricityPrice}
                  onChange={(e) => setBatteryConfig({ electricityPrice: parseFloat(e.target.value) || 0 })}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">Kč/kWh</InputAdornment>,
                  }}
                  size="small"
                  fullWidth
                  disabled={!hasData}
                />
              </Grid>
            </Grid>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', mb: 1 }}
            >
              Reálné využití při této konfiguraci
            </Typography>
            <Stack spacing={1.5}>
              <SmallStat
                icon={<BatteryChargingFullIcon />}
                label="Energie uložena do baterie"
                value={formatEnergy(batterySimulation?.totalEnergyStored ?? 0)}
              />
              <SmallStat
                icon={<BoltIcon />}
                label="Energie použita z baterie"
                value={formatEnergy(batterySimulation?.totalEnergyUsedFromBattery ?? 0)}
              />
              <SmallStat
                icon={<TrendingDownIcon />}
                label="Snížení odběru ze sítě"
                value={formatEnergy(batterySimulation?.gridImportReduction ?? 0)}
              />
              <SmallStat
                icon={<PowerOffIcon />}
                label="Průměrné pokrytí importu"
                value={`${avgCoveragePercent.toFixed(1)} %`}
              />
            </Stack>
          </Grid>
        </Grid>
      </Box>

      {/* Charts */}
      {monthlyChartOptions && (
        <Box mb={3}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Měsíční analýza
          </Typography>
          <Box className="blueprint-surface" sx={{ height: 300 }}>
            <ReactECharts
              theme="observatory"
              option={monthlyChartOptions}
              style={{ height: '100%', width: '100%' }}
              notMerge={true}
            />
          </Box>
        </Box>
      )}

      {dailyGridImportChartOptions && (
        <Box mb={3}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Denní dokup energie ze sítě
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            Oranžové sloupce = dny bez nutnosti dokoupit energii (ostrovní provoz)
          </Typography>
          <Box ref={dailyGridImportBoxRef} className="blueprint-surface" sx={{ height: 300 }}>
            <ReactECharts
              ref={dailyGridImportChartRef}
              theme="observatory"
              option={dailyGridImportChartOptions}
              style={{ height: '100%', width: '100%' }}
              notMerge={true}
            />
          </Box>
        </Box>
      )}

      {batteryStateChartOptions && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Průběh stavu baterie (denní průměr)
          </Typography>
          <Box ref={batteryStateBoxRef} className="blueprint-surface" sx={{ height: 250 }}>
            <ReactECharts
              ref={batteryStateChartRef}
              theme="observatory"
              option={batteryStateChartOptions}
              style={{ height: '100%', width: '100%' }}
              notMerge={true}
            />
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default BatteryAnalysis;
