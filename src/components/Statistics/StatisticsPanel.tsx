import React, { useMemo } from 'react';
import {
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  IconButton,
  Tooltip,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import BoltIcon from '@mui/icons-material/Bolt';
import SolarPowerIcon from '@mui/icons-material/SolarPower';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import NightlightIcon from '@mui/icons-material/Nightlight';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useEnergyStore } from '../../store/energyStore';
import { formatEnergy, formatNumber, formatPercent, formatDateTime } from '../../utils/format';
import { aggregateByDayNight } from '../../utils/dataAggregation';
import { getDefaultLocation } from '../../utils/sunCalculations';
import { calculateYearStatistics } from '../../utils/energyData';
import { RangeControl, SectionHeader } from '../Common';
import TopConsumptionDays from './TopConsumptionDays';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  /** Extra explanation shown in a tooltip next to the title, for metrics whose name alone can mislead. */
  tooltip?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, color, tooltip }) => (
  <Card
    className="paper-card fade-up"
    sx={{
      height: '100%',
      transition: 'transform .2s ease',
      '&:hover': { transform: 'translateY(-2px)' },
    }}
  >
    <CardContent>
      <Box display="flex" alignItems="center" mb={1}>
        <Box
          sx={{
            backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
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
        <Typography className="micro-label" variant="overline">
          {title}
        </Typography>
        {tooltip && (
          <Tooltip title={tooltip} arrow>
            <IconButton
              size="small"
              aria-label={`Vysvětlení metriky: ${title}`}
              sx={{ ml: 0.25, p: 0.25, color: 'var(--color-muted-foreground)' }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        )}
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
  const allRecords = useEnergyStore((s) => s.allRecords);
  const rangeMode = useEnergyStore((s) => s.chartConfig.rangeMode);
  const selectedYears = useEnergyStore((s) => s.chartConfig.selectedYears);
  const timeRange = useEnergyStore((s) => s.chartConfig.timeRange);
  const dayNightConfig = useEnergyStore((s) => s.chartConfig.dayNightConfig);
  const getActiveRecords = useEnergyStore((s) => s.getActiveRecords);

  const activeRecords = useMemo(
    () => getActiveRecords(),
    // Specific chartConfig fields that affect active record computation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getActiveRecords, rangeMode, selectedYears, timeRange, allRecords],
  );

  // `calculateYearStatistics` is the single source of truth for these sums
  // (also used by the store for the per-year YearStatistics). Passing it the
  // active range instead of a whole year's records works the same way,
  // since it only ever iterates the list it is given.
  const summary = useMemo(
    () => calculateYearStatistics(activeRecords, 0),
    [activeRecords],
  );

  const dayNightTotals = useMemo(() => {
    if (activeRecords.length === 0) {
      return {
        dayConsumptionTotal: 0,
        nightConsumptionTotal: 0,
        dayPercent: 0,
        nightPercent: 0,
      };
    }

    const location = dayNightConfig.location || getDefaultLocation();
    const buckets = aggregateByDayNight(activeRecords, dayNightConfig, location);

    let dayConsumptionTotal = 0;
    let nightConsumptionTotal = 0;
    for (const bucket of buckets) {
      dayConsumptionTotal += bucket.dayConsumption;
      nightConsumptionTotal += bucket.nightConsumption;
    }

    const totalDayNight = dayConsumptionTotal + nightConsumptionTotal;
    const dayPercent = totalDayNight > 0 ? (dayConsumptionTotal / totalDayNight) * 100 : 0;
    const nightPercent = totalDayNight > 0 ? (nightConsumptionTotal / totalDayNight) * 100 : 0;

    return {
      dayConsumptionTotal,
      nightConsumptionTotal,
      dayPercent,
      nightPercent,
    };
  }, [activeRecords, dayNightConfig]);

  const rangeSubtitle = useMemo(() => {
    switch (rangeMode) {
      case 'years':
        return 'Součet za vybrané roky';
      case 'last': {
        const targetYear = selectedYears.length > 0
          ? Math.max(...selectedYears)
          : null;
        return targetYear !== null ? `Poslední rok (${targetYear})` : 'Poslední rok';
      }
      case 'selection':
        return 'Vybraný rozsah';
      default:
        return '';
    }
  }, [rangeMode, selectedYears]);

  // Empty state: no data uploaded at all OR nothing selected and no records
  const isEmpty = selectedYears.length === 0 && allRecords.length === 0;

  if (isEmpty) {
    return (
      <Paper className="paper-card" sx={{ p: 3 }}>
        <SectionHeader title="Statistiky" action={<RangeControl />} />
        <Typography variant="body2" color="text.secondary">
          Vyberte rok pro zobrazení statistik
        </Typography>
      </Paper>
    );
  }

  const {
    totalConsumption,
    totalProduction,
    peakConsumption,
    peakConsumptionDate,
    selfSufficiencyRatio,
  } = summary;
  const { dayConsumptionTotal, nightConsumptionTotal, dayPercent, nightPercent } = dayNightTotals;

  return (
    <Paper className="paper-card" sx={{ p: 3 }}>
      <SectionHeader title="Statistiky" action={<RangeControl />} />

      {/* 6 KPI tiles */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Celková spotřeba"
            value={formatEnergy(totalConsumption)}
            subtitle={rangeSubtitle}
            icon={<TrendingDownIcon />}
            color="var(--chart-4)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Celková výroba"
            value={formatEnergy(totalProduction)}
            subtitle={rangeSubtitle}
            icon={<TrendingUpIcon />}
            color="var(--chart-5)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Poměr dodávky k odběru"
            value={formatPercent(selfSufficiencyRatio)}
            subtitle="Horní odhad, ne spotřeba domu"
            icon={<SolarPowerIcon />}
            color="var(--chart-2)"
            tooltip={
              'Kolik procent odběru ze sítě by teoreticky pokryly přetoky dodané do sítě, ' +
              'kdyby šly použít přesně v okamžiku odběru (nejvýš 100 %). Nejde o skutečný ' +
              'podíl vlastní energie na spotřebě domácnosti – ten by vyžadoval znát hrubou ' +
              'výrobu FVE a spotřebu domu bez přetoků, což z bilančních dat ČEZ nelze zjistit.'
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Špička spotřeby"
            value={`${formatNumber(peakConsumption, 2)} kW`}
            subtitle={peakConsumptionDate ? formatDateTime(peakConsumptionDate) : '–'}
            icon={<BoltIcon />}
            color="var(--chart-1)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Spotřeba ve dne"
            value={formatEnergy(dayConsumptionTotal)}
            subtitle={formatPercent(dayPercent, 0)}
            icon={<WbSunnyIcon />}
            color="var(--chart-1)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <StatCard
            title="Spotřeba v noci"
            value={formatEnergy(nightConsumptionTotal)}
            subtitle={formatPercent(nightPercent, 0)}
            icon={<NightlightIcon />}
            color="var(--chart-3)"
          />
        </Grid>
      </Grid>

      {/* TOP-10 dní s nejvyšší spotřebou */}
      <TopConsumptionDays records={activeRecords} />
    </Paper>
  );
};

export default StatisticsPanel;
