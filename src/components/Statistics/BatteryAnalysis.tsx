import React, { useMemo, useRef } from 'react';
import { Paper, Typography, Box, Stack, Alert } from '@mui/material';
import Grid from '@mui/material/Grid';
import { visuallyHidden } from '@mui/utils';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import SavingsIcon from '@mui/icons-material/Savings';
import BoltIcon from '@mui/icons-material/Bolt';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import OfflineBoltIcon from '@mui/icons-material/OfflineBolt';
import PowerOffIcon from '@mui/icons-material/PowerOff';
import ReactECharts from 'echarts-for-react';
import { useEnergyStore } from '../../store/energyStore';
import { useSmoothWheelZoom } from '../../hooks/useSmoothWheelZoom';
import {
  formatCurrency,
  formatCurrencyPrecise,
  formatDays,
  formatEnergy,
  formatKwh,
  formatMonthYear,
  formatNumber,
  formatPercent,
} from '../../utils/format';
import {
  buildMonthlyOption,
  buildDailyImportOption,
  buildChargeLevelOption,
} from '../../utils/batteryChartOptions';
import { HeroTile, SmallStat, RangeControl } from '../Common';
import BatteryConfigForm from '../Configuration/BatteryConfigForm';
import CapacityAdvisor from './CapacityAdvisor';

/**
 * Battery screen.
 *
 * Reads the same active range as the chart and the statistics, so a selection
 * made in the chart narrows all three consistently. The heavy lifting lives in
 * the store (simulation, capacity curve) and in utils/batteryChartOptions.
 */
const BatteryAnalysis: React.FC = () => {
  const batteryConfig = useEnergyStore((s) => s.batteryConfig);
  const batterySimulation = useEnergyStore((s) => s.batterySimulation);
  const capacityRecommendation = useEnergyStore((s) => s.capacityRecommendation);
  const setBatteryConfig = useEnergyStore((s) => s.setBatteryConfig);
  const hasData = useEnergyStore((s) => s.allRecords.length > 0);

  const dailyImportChartRef = useRef<ReactECharts>(null);
  const chargeLevelChartRef = useRef<ReactECharts>(null);
  const dailyImportBoxRef = useSmoothWheelZoom(dailyImportChartRef);
  const chargeLevelBoxRef = useSmoothWheelZoom(chargeLevelChartRef);

  const monthlyOption = useMemo(
    () => (batterySimulation ? buildMonthlyOption(batterySimulation) : null),
    [batterySimulation]
  );
  const dailyImportOption = useMemo(
    () => (batterySimulation ? buildDailyImportOption(batterySimulation) : null),
    [batterySimulation]
  );
  const chargeLevelOption = useMemo(
    () =>
      batterySimulation ? buildChargeLevelOption(batterySimulation, batteryConfig) : null,
    [batterySimulation, batteryConfig]
  );

  const remainingImport = batterySimulation
    ? batterySimulation.dailyGridImport.reduce((sum, d) => sum + d.gridImport, 0)
    : 0;
  const remainingImportCost = remainingImport * batteryConfig.electricityPrice;

  return (
    <Stack spacing={3}>
      {hasData && (
        <CapacityAdvisor
          recommendation={capacityRecommendation}
          selectedCapacity={batteryConfig.capacity}
          onApply={(capacity) => setBatteryConfig({ capacity })}
        />
      )}

      <Paper className="paper-card" sx={{ p: 3 }}>
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          mb={3}
          flexWrap="wrap"
          gap={2}
        >
          <Box>
            <Typography variant="h6">Baterie a přetoky</Typography>
            <Typography variant="body2" color="text.secondary">
              Co by se stalo, kdyby přetoky z fotovoltaiky nešly do sítě, ale do baterie.
            </Typography>
          </Box>
          <RangeControl />
        </Stack>

        {!hasData && (
          <Alert severity="info" sx={{ mb: 3 }} role="status">
            Nahrajte data pro spuštění simulace baterie.
          </Alert>
        )}

        {/* Headline numbers for the configured battery */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <HeroTile
              icon={<SavingsIcon />}
              title="Úspora za rok"
              value={formatCurrency(batterySimulation?.savingsPerYear ?? 0)}
              subtitle={`Při ${formatCurrencyPrecise(batteryConfig.electricityPrice)}/kWh`}
              color="var(--color-primary)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <HeroTile
              icon={<BatteryChargingFullIcon />}
              title="Nastavená baterie"
              value={`${formatNumber(batteryConfig.capacity, 1)} kWh`}
              subtitle={
                capacityRecommendation
                  ? `Doporučeno ${formatNumber(capacityRecommendation.capacity, 1)} kWh`
                  : undefined
              }
              color="var(--chart-2)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <HeroTile
              icon={<OfflineBoltIcon />}
              title="Dny bez dokupu"
              value={formatDays(batterySimulation?.offGridDaysGained ?? 0)}
              subtitle={
                batterySimulation
                  ? `Díky baterii, z ${formatDays(batterySimulation.daysSimulated)}`
                  : undefined
              }
              color="var(--chart-5)"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <HeroTile
              icon={<TrendingDownIcon />}
              title="Přesto nutno dokoupit"
              value={formatEnergy(remainingImport)}
              subtitle={formatCurrency(remainingImportCost)}
              color="var(--color-destructive)"
            />
          </Grid>
        </Grid>

        {/* What-if controls */}
        <Box mb={3}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Co kdyby
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Upravte parametry baterie a sledujte, jak se změní úspora a využití.
          </Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <BatteryConfigForm
                config={batteryConfig}
                disabled={!hasData}
                onChange={setBatteryConfig}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Typography
                variant="overline"
                className="micro-label"
                display="block"
                gutterBottom
              >
                Reálné využití při této konfiguraci
              </Typography>
              <Stack spacing={1.5}>
                <SmallStat
                  icon={<BatteryChargingFullIcon />}
                  label="Uloženo do baterie"
                  value={formatEnergy(batterySimulation?.totalEnergyStored ?? 0)}
                />
                <SmallStat
                  icon={<BoltIcon />}
                  label="Použito z baterie"
                  value={formatEnergy(batterySimulation?.totalEnergyUsedFromBattery ?? 0)}
                />
                <SmallStat
                  icon={<TrendingDownIcon />}
                  label="Ušetřený nákup"
                  value={formatCurrency(batterySimulation?.avoidedPurchasePerYear ?? 0)}
                />
                <SmallStat
                  icon={<PowerOffIcon />}
                  label="Ušlý výkup přetoků"
                  value={`− ${formatCurrency(batterySimulation?.lostFeedInPerYear ?? 0)}`}
                />
                <SmallStat
                  icon={<SavingsIcon />}
                  label="Pokrytí odběru baterií"
                  value={formatPercent(batterySimulation?.importCoveragePercent ?? 0)}
                />
              </Stack>
            </Grid>
          </Grid>
        </Box>

        {/* Charts */}
        {monthlyOption && batterySimulation && (
          <Box mb={3}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Měsíční analýza
            </Typography>
            <Box
              className="blueprint-surface"
              sx={{ height: 300 }}
              role="img"
              aria-label="Sloupcový graf uložené a použité energie po měsících s křivkou úspory."
            >
              <ReactECharts
                theme="observatory"
                option={monthlyOption}
                style={{ height: '100%', width: '100%' }}
                notMerge
              />
            </Box>
            <Box sx={visuallyHidden}>
              <table>
                <caption>Měsíční využití baterie</caption>
                <thead>
                  <tr>
                    <th scope="col">Měsíc</th>
                    <th scope="col">Uloženo</th>
                    <th scope="col">Použito</th>
                    <th scope="col">Úspora</th>
                  </tr>
                </thead>
                <tbody>
                  {batterySimulation.monthlyAnalysis.map((month) => (
                    <tr key={`${month.year}-${month.month}`}>
                      <th scope="row">{formatMonthYear(month.month, month.year)}</th>
                      <td>{formatKwh(month.energyStored)}</td>
                      <td>{formatKwh(month.energyUsed)}</td>
                      <td>{formatCurrency(month.savings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Box>
        )}

        {dailyImportOption && batterySimulation && (
          <Box mb={3}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Denní dokup energie ze sítě
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              Dny bez sloupce jsou dny, kdy by domácnost nemusela ze sítě nakupovat vůbec.
            </Typography>
            <Box
              ref={dailyImportBoxRef}
              className="blueprint-surface"
              sx={{ height: 300 }}
              role="img"
              aria-label={`Sloupcový graf denního dokupu ze sítě. Baterie pokryla ${formatPercent(batterySimulation.importCoveragePercent)} odběru.`}
            >
              <ReactECharts
                ref={dailyImportChartRef}
                theme="observatory"
                option={dailyImportOption}
                style={{ height: '100%', width: '100%' }}
                notMerge
              />
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
              Bez dokupu ze sítě: {formatDays(batterySimulation.offGridDays)} celkem, z
              toho {formatDays(batterySimulation.offGridDaysGained)} díky baterii.
            </Typography>
          </Box>
        )}

        {chargeLevelOption && (
          <Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Průběh stavu baterie (denní průměr)
            </Typography>
            <Box
              ref={chargeLevelBoxRef}
              className="blueprint-surface"
              sx={{ height: 250 }}
              role="img"
              aria-label="Spojnicový graf průměrného denního stavu nabití baterie."
            >
              <ReactECharts
                ref={chargeLevelChartRef}
                theme="observatory"
                option={chargeLevelOption}
                style={{ height: '100%', width: '100%' }}
                notMerge
              />
            </Box>
          </Box>
        )}
      </Paper>
    </Stack>
  );
};

export default BatteryAnalysis;
