import React, { useMemo } from 'react';
import {
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import BoltIcon from '@mui/icons-material/Bolt';
import SolarPowerIcon from '@mui/icons-material/SolarPower';
import { useEnergyStore } from '../../store/energyStore';
import { formatEnergy } from '../../utils/batteryAlgorithm';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, color }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box display="flex" alignItems="center" mb={1}>
        <Box
          sx={{
            backgroundColor: `${color}20`,
            borderRadius: 1,
            p: 0.5,
            mr: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
            '& svg': {
              fontSize: 24,
            },
          }}
        >
          {icon}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
      </Box>
      <Typography variant="h5" fontWeight={600}>
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </CardContent>
  </Card>
);

const StatisticsPanel: React.FC = () => {
  const { yearlyData, chartConfig } = useEnergyStore();
  const { selectedYears } = chartConfig;
  
  // Calculate statistics for selected years
  const statistics = useMemo(() => {
    if (selectedYears.length === 0) return null;
    
    let totalConsumption = 0;
    let totalProduction = 0;
    let totalDays = 0;
    let peakConsumption = 0;
    let peakProduction = 0;
    let peakConsumptionDate: Date | null = null;
    let peakProductionDate: Date | null = null;
    
    const yearStats: Array<{
      year: number;
      consumption: number;
      production: number;
      avgDailyConsumption: number;
      avgDailyProduction: number;
      selfSufficiency: number;
    }> = [];
    
    for (const year of selectedYears) {
      const data = yearlyData.get(year);
      if (!data) continue;
      
      const stats = data.statistics;
      totalConsumption += stats.totalConsumption;
      totalProduction += stats.totalProduction;
      totalDays += stats.daysWithData;
      
      if (stats.peakConsumption > peakConsumption) {
        peakConsumption = stats.peakConsumption;
        peakConsumptionDate = stats.peakConsumptionDate;
      }
      
      if (stats.peakProduction > peakProduction) {
        peakProduction = stats.peakProduction;
        peakProductionDate = stats.peakProductionDate;
      }
      
      yearStats.push({
        year,
        consumption: stats.totalConsumption,
        production: stats.totalProduction,
        avgDailyConsumption: stats.avgDailyConsumption,
        avgDailyProduction: stats.avgDailyProduction,
        selfSufficiency: stats.selfSufficiencyRatio,
      });
    }
    
    const avgDailyConsumption = totalDays > 0 ? totalConsumption / totalDays : 0;
    const avgDailyProduction = totalDays > 0 ? totalProduction / totalDays : 0;
    const selfSufficiency = totalConsumption > 0 
      ? Math.min(100, (totalProduction / totalConsumption) * 100) 
      : 0;
    
    return {
      totalConsumption,
      totalProduction,
      avgDailyConsumption,
      avgDailyProduction,
      peakConsumption,
      peakProduction,
      peakConsumptionDate,
      peakProductionDate,
      selfSufficiency,
      yearStats,
    };
  }, [yearlyData, selectedYears]);
  
  if (!statistics) {
    return (
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Statistiky
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Vyberte rok pro zobrazení statistik
        </Typography>
      </Paper>
    );
  }
  
  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return date.toLocaleDateString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Statistiky
      </Typography>
      
      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Celková spotřeba"
            value={formatEnergy(statistics.totalConsumption)}
            subtitle={`Ø ${statistics.avgDailyConsumption.toFixed(1)} kWh/den`}
            icon={<TrendingDownIcon />}
            color="#ff6b6b"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Celková výroba"
            value={formatEnergy(statistics.totalProduction)}
            subtitle={`Ø ${statistics.avgDailyProduction.toFixed(1)} kWh/den`}
            icon={<TrendingUpIcon />}
            color="#69db7c"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Špičková spotřeba"
            value={`${statistics.peakConsumption.toFixed(2)} kWh`}
            subtitle={formatDate(statistics.peakConsumptionDate)}
            icon={<BoltIcon />}
            color="#ff9800"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Soběstačnost"
            value={`${statistics.selfSufficiency.toFixed(1)} %`}
            subtitle="Výroba / Spotřeba"
            icon={<SolarPowerIcon />}
            color="#29b6f6"
          />
        </Grid>
      </Grid>
      
      {/* Year comparison table */}
      {statistics.yearStats.length > 1 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Porovnání let
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Rok</TableCell>
                  <TableCell align="right">Spotřeba</TableCell>
                  <TableCell align="right">Výroba</TableCell>
                  <TableCell align="right">Ø Spotřeba/den</TableCell>
                  <TableCell align="right">Ø Výroba/den</TableCell>
                  <TableCell align="right">Soběstačnost</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {statistics.yearStats.map((ys) => (
                  <TableRow key={ys.year}>
                    <TableCell>{ys.year}</TableCell>
                    <TableCell align="right">{formatEnergy(ys.consumption)}</TableCell>
                    <TableCell align="right">{formatEnergy(ys.production)}</TableCell>
                    <TableCell align="right">{ys.avgDailyConsumption.toFixed(1)} kWh</TableCell>
                    <TableCell align="right">{ys.avgDailyProduction.toFixed(1)} kWh</TableCell>
                    <TableCell align="right">{ys.selfSufficiency.toFixed(1)} %</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Paper>
  );
};

export default StatisticsPanel;
