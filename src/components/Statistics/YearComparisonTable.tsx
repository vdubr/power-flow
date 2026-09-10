import React, { useMemo } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { useEnergyStore } from '../../store/energyStore';
import { formatEnergy, formatKwh, formatPercent } from '../../utils/format';
import { SectionHeader } from '../Common';

interface YearStat {
  year: number;
  consumption: number;
  production: number;
  avgDailyConsumption: number;
  avgDailyProduction: number;
  selfSufficiency: number;
}

/** Visually hidden but readable to assistive technology, e.g. for the table caption. */
const srOnlySx = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

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
      <SectionHeader title="Porovnání let" variant="section" />
      {/*
        Six columns do not fit a phone, so the container scrolls sideways. A
        scrollable region with no focusable content inside is unreachable from
        the keyboard — the last columns simply cannot be read — so the region
        itself takes focus and says what it is.
      */}
      <TableContainer tabIndex={0} role="region" aria-label="Porovnání let, vodorovně posuvná tabulka">
        <Table size="small">
          <caption style={srOnlySx as React.CSSProperties}>
            Porovnání spotřeby, výroby a poměru dodávky k odběru mezi vybranými roky
          </caption>
          <TableHead>
            <TableRow>
              <TableCell component="th" scope="col">Rok</TableCell>
              <TableCell component="th" scope="col" align="right">Spotřeba</TableCell>
              <TableCell component="th" scope="col" align="right">Výroba</TableCell>
              <TableCell component="th" scope="col" align="right">Ø Spotřeba/den</TableCell>
              <TableCell component="th" scope="col" align="right">Ø Výroba/den</TableCell>
              <TableCell component="th" scope="col" align="right">Dodávka/odběr</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {yearStats.map((ys) => (
              <TableRow key={ys.year}>
                <TableCell component="th" scope="row">{ys.year}</TableCell>
                <TableCell align="right">{formatEnergy(ys.consumption)}</TableCell>
                <TableCell align="right">{formatEnergy(ys.production)}</TableCell>
                <TableCell align="right">{formatKwh(ys.avgDailyConsumption)}</TableCell>
                <TableCell align="right">{formatKwh(ys.avgDailyProduction)}</TableCell>
                <TableCell align="right">{formatPercent(ys.selfSufficiency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default YearComparisonTable;
