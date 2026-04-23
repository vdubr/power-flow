import React, { useMemo } from 'react';
import {
  Paper,
  Typography,
  Box,
  Slider,
  TextField,
  Card,
  CardContent,
  Alert,
  InputAdornment,
  Divider,
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
import { formatCurrency, formatEnergy } from '../../utils/batteryAlgorithm';

const MONTH_NAMES = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'
];

const BatteryAnalysis: React.FC = () => {
  const {
    batteryConfig,
    batterySimulation,
    setBatteryConfig,
    allRecords,
  } = useEnergyStore();
  
  const hasData = allRecords.length > 0;
  
  // Chart options for monthly analysis
  const monthlyChartOptions = useMemo(() => {
    if (!batterySimulation) return null;
    
    const monthlyData = batterySimulation.monthlyAnalysis;
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        borderColor: '#3d3d3d',
        textStyle: { color: '#ffffff' },
      },
      legend: {
        data: ['Uloženo do baterie', 'Použito z baterie', 'Úspora'],
        bottom: 0,
        textStyle: { color: '#b0b0b0' },
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
          color: '#b0b0b0',
        },
        axisLine: { lineStyle: { color: '#3d3d3d' } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'kWh',
          position: 'left',
          nameTextStyle: { color: '#b0b0b0' },
          axisLabel: { color: '#b0b0b0' },
          axisLine: { lineStyle: { color: '#3d3d3d' } },
          splitLine: { lineStyle: { color: '#2d2d2d' } },
        },
        {
          type: 'value',
          name: 'Kč',
          position: 'right',
          nameTextStyle: { color: '#b0b0b0' },
          axisLabel: { color: '#b0b0b0' },
          axisLine: { lineStyle: { color: '#3d3d3d' } },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Uloženo do baterie',
          type: 'bar',
          data: monthlyData.map(d => d.energyStored.toFixed(1)),
          itemStyle: { color: '#69db7c' },
        },
        {
          name: 'Použito z baterie',
          type: 'bar',
          data: monthlyData.map(d => d.energyUsed.toFixed(1)),
          itemStyle: { color: '#29b6f6' },
        },
        {
          name: 'Úspora',
          type: 'line',
          yAxisIndex: 1,
          data: monthlyData.map(d => d.savings.toFixed(0)),
          itemStyle: { color: '#ff9800' },
        },
      ],
    };
  }, [batterySimulation]);
  
  // Chart for battery state over time (simplified daily view)
  const batteryStateChartOptions = useMemo(() => {
    if (!batterySimulation || batterySimulation.batteryStates.length === 0) return null;
    
    // Sample data for performance (show daily averages)
    const dailyData = new Map<string, { chargeSum: number; count: number }>();
    
    for (const state of batterySimulation.batteryStates) {
      const dayKey = state.timestamp.toISOString().split('T')[0];
      const existing = dailyData.get(dayKey) || { chargeSum: 0, count: 0 };
      existing.chargeSum += state.chargeLevel;
      existing.count += 1;
      dailyData.set(dayKey, existing);
    }
    
    const chartData = Array.from(dailyData.entries())
      .map(([date, data]) => ({
        date,
        avgCharge: data.chargeSum / data.count,
      }))
      .slice(0, 365); // Limit to one year for readability
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        borderColor: '#3d3d3d',
        textStyle: { color: '#ffffff' },
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
          color: '#b0b0b0',
          formatter: (value: string) => {
            const date = new Date(value);
            return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
          },
        },
        axisLine: { lineStyle: { color: '#3d3d3d' } },
      },
      yAxis: {
        type: 'value',
        name: 'Stav baterie (kWh)',
        max: batteryConfig.capacity,
        nameTextStyle: { color: '#b0b0b0' },
        axisLabel: { color: '#b0b0b0' },
        axisLine: { lineStyle: { color: '#3d3d3d' } },
        splitLine: { lineStyle: { color: '#2d2d2d' } },
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
          backgroundColor: '#1e1e1e',
          borderColor: '#3d3d3d',
          fillerColor: 'rgba(255, 152, 0, 0.2)',
          handleStyle: { color: '#ff9800' },
          textStyle: { color: '#b0b0b0' },
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
                { offset: 0, color: 'rgba(255, 152, 0, 0.5)' },
                { offset: 1, color: 'rgba(255, 152, 0, 0.1)' },
              ],
            },
          },
          lineStyle: { color: '#ff9800' },
          itemStyle: { color: '#ff9800' },
          smooth: true,
          symbol: 'none',
        },
      ],
    };
  }, [batterySimulation, batteryConfig.capacity]);
  
  // Chart for daily grid import (energy purchase)
  const dailyGridImportChartOptions = useMemo(() => {
    if (!batterySimulation || batterySimulation.dailyGridImport.length === 0) return null;
    
    const dailyData = batterySimulation.dailyGridImport;
    
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        borderColor: '#3d3d3d',
        textStyle: { color: '#ffffff' },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const dataIndex = params[0].dataIndex;
          const dayData = dailyData[dataIndex];
          const date = new Date(dayData.date).toLocaleDateString('cs-CZ');
          
          let html = `<strong>${date}</strong><br/>`;
          html += `<span style="color:#ff6b6b">●</span> Dokup ze sítě: ${dayData.gridImport.toFixed(2)} kWh<br/>`;
          html += `<span style="color:#999">○</span> Původní dokup: ${dayData.gridImportOriginal.toFixed(2)} kWh<br/>`;
          html += `<span style="color:#69db7c">●</span> Pokrytí baterií: ${dayData.selfSufficiencyPercent.toFixed(1)}%<br/>`;
          if (dayData.isOffGrid) {
            html += `<span style="color:#ff9800">★ Ostrovní den</span>`;
          }
          return html;
        },
      },
      legend: {
        data: ['Dokup ze sítě', 'Ostrovní dny'],
        bottom: 0,
        textStyle: { color: '#b0b0b0' },
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
        data: dailyData.map(d => d.date.toISOString().split('T')[0]),
        axisLabel: {
          rotate: 45,
          color: '#b0b0b0',
          formatter: (value: string) => {
            const date = new Date(value);
            return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
          },
        },
        axisLine: { lineStyle: { color: '#3d3d3d' } },
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
        nameTextStyle: { color: '#b0b0b0' },
        axisLabel: { color: '#b0b0b0' },
        axisLine: { lineStyle: { color: '#3d3d3d' } },
        splitLine: { lineStyle: { color: '#2d2d2d' } },
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
          backgroundColor: '#1e1e1e',
          borderColor: '#3d3d3d',
          fillerColor: 'rgba(255, 152, 0, 0.2)',
          handleStyle: { color: '#ff9800' },
          textStyle: { color: '#b0b0b0' },
        },
      ],
      visualMap: {
        show: false,
        dimension: 0,
        pieces: dailyData.map((d, i) => ({
          value: i,
          color: d.isOffGrid ? '#ff9800' : '#ff6b6b',
        })),
      },
      series: [
        {
          name: 'Dokup ze sítě',
          type: 'bar',
          data: dailyData.map((d, i) => ({
            value: d.gridImport,
            itemStyle: {
              color: d.isOffGrid ? '#ff9800' : '#ff6b6b',
            },
          })),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: {
              color: '#69db7c',
              type: 'dashed',
            },
            data: [
              {
                yAxis: 0,
                label: {
                  show: true,
                  formatter: 'Ostrovní provoz',
                  color: '#69db7c',
                },
              },
            ],
          },
        },
      ],
    };
  }, [batterySimulation]);
  
  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Analýza baterie
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Simulace úspor při použití domácí baterie pro ukládání přebytků z FVE.
      </Typography>
      
      {/* Configuration */}
      <Grid container spacing={3} mb={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box mb={3}>
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
          
          <Box mb={3}>
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
        </Grid>
        
        <Grid size={{ xs: 12, md: 6 }}>
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
      </Grid>
      
      {!hasData && (
        <Alert severity="info">
          Nahrajte data pro spuštění simulace baterie.
        </Alert>
      )}
      
      {/* Results */}
      {batterySimulation && (
        <>
          <Divider sx={{ my: 3 }} />
          
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Výsledky simulace
          </Typography>
          
          {/* Summary cards */}
          <Grid container spacing={2} mb={3}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <SavingsIcon sx={{ color: '#ff9800', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Roční úspora
                    </Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={600} sx={{ color: '#ff9800' }}>
                    {formatCurrency(batterySimulation.annualSavings)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <BatteryChargingFullIcon sx={{ color: '#29b6f6', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Energie uložena
                    </Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={600}>
                    {formatEnergy(batterySimulation.totalEnergyStored)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <BoltIcon sx={{ color: '#ffb74d', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Energie použita
                    </Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={600}>
                    {formatEnergy(batterySimulation.totalEnergyUsedFromBattery)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <TrendingDownIcon sx={{ color: '#ab47bc', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Snížení odběru ze sítě
                    </Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={600}>
                    {formatEnergy(batterySimulation.gridImportReduction)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
          
          {/* Off-grid stats cards */}
          <Grid container spacing={2} mb={3}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Card sx={{ bgcolor: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <OfflineBoltIcon sx={{ color: '#ff9800', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Dny bez dokoupení energie
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600} sx={{ color: '#ff9800' }}>
                    {batterySimulation.offGridDays}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {batterySimulation.offGridDaysPercent.toFixed(1)}% ze všech dnů
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <PowerOffIcon sx={{ color: '#69db7c', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Průměrný denní dokup
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600}>
                    {batterySimulation.dailyGridImport.length > 0 
                      ? (batterySimulation.dailyGridImport.reduce((sum, d) => sum + d.gridImport, 0) / batterySimulation.dailyGridImport.length).toFixed(2)
                      : '0'} kWh
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Původně: {batterySimulation.dailyGridImport.length > 0 
                      ? (batterySimulation.dailyGridImport.reduce((sum, d) => sum + d.gridImportOriginal, 0) / batterySimulation.dailyGridImport.length).toFixed(2)
                      : '0'} kWh/den
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 12, md: 4 }}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <BoltIcon sx={{ color: '#29b6f6', mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Pokrytí importu baterií
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight={600}>
                    {batterySimulation.dailyGridImport.length > 0 
                      ? (batterySimulation.dailyGridImport.reduce((sum, d) => sum + d.selfSufficiencyPercent, 0) / batterySimulation.dailyGridImport.length).toFixed(1)
                      : '0'}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Průměrné denní pokrytí původního importu ze sítě
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
          
          {/* Recommended capacity */}
          <Alert severity="success" sx={{ mb: 3 }}>
            <strong>Doporučená kapacita baterie:</strong> {batterySimulation.recommendedCapacity} kWh
            <Typography variant="body2">
              Na základě analýzy denních přebytků a deficitů energie.
            </Typography>
          </Alert>
          
          {/* Monthly analysis chart */}
          {monthlyChartOptions && (
            <Box mb={3}>
              <Typography variant="subtitle2" gutterBottom>
                Měsíční analýza
              </Typography>
              <Box sx={{ height: 300 }}>
                <ReactECharts
                  option={monthlyChartOptions}
                  style={{ height: '100%', width: '100%' }}
                  notMerge={true}
                />
              </Box>
            </Box>
          )}
          
          {/* Daily grid import chart */}
          {dailyGridImportChartOptions && (
            <Box mb={3}>
              <Typography variant="subtitle2" gutterBottom>
                Denní dokup energie ze sítě
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                Oranžové sloupce = dny bez nutnosti dokoupit energii (ostrovní provoz)
              </Typography>
              <Box sx={{ height: 300 }}>
                <ReactECharts
                  option={dailyGridImportChartOptions}
                  style={{ height: '100%', width: '100%' }}
                  notMerge={true}
                />
              </Box>
            </Box>
          )}
          
          {/* Battery state chart */}
          {batteryStateChartOptions && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Průběh stavu baterie (denní průměr)
              </Typography>
              <Box sx={{ height: 250 }}>
                <ReactECharts
                  option={batteryStateChartOptions}
                  style={{ height: '100%', width: '100%' }}
                  notMerge={true}
                />
              </Box>
            </Box>
          )}
        </>
      )}
    </Paper>
  );
};

export default BatteryAnalysis;
