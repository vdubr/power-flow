import React, { useMemo } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useEnergyStore } from '../../store/energyStore';
import { formatEnergy } from '../../utils/format';

interface YearStat {
  year: number;
  consumption: number;
  production: number;
  avgDailyConsumption: number;
  avgDailyProduction: number;
  selfSufficiency: number;
}

const YearComparisonTable: React.FC = () => {
  const yearlyData = useEnergyStore((s) => s.yearlyData);
  const selectedYears = useEnergyStore((s) => s.chartConfig.selectedYears);

  const yearStats = useMemo<YearStat[]>(() => {
    return selectedYears
      .map((year) => {
        const data = yearlyData.get(year);
        if (!data) return null;
        return {
          year,
          consumption: data.statistics.totalConsumption,
          production: data.statistics.totalProduction,
          avgDailyConsumption: data.statistics.avgDailyConsumption,
          avgDailyProduction: data.statistics.avgDailyProduction,
          selfSufficiency: data.statistics.selfSufficiencyRatio,
        };
      })
      .filter((entry): entry is YearStat => entry !== null);
  }, [selectedYears, yearlyData]);

  if (yearStats.length < 2) return null;

  return (
    <Box>
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
            {yearStats.map((ys) => (
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
    </Box>
  );
};

export default YearComparisonTable;
