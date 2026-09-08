import React, { useMemo } from 'react';
import { Box, Button, Paper, Stack, Typography, Chip } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import echarts from '../../theme/echartsCore';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import { CapacityRecommendation } from '../../types/energy';
import { buildCapacityCurveOption } from '../../utils/batteryChartOptions';
import { formatCurrency, formatKwh, formatNumber, formatPercent } from '../../utils/format';

interface CapacityAdvisorProps {
  recommendation: CapacityRecommendation | null;
  selectedCapacity: number;
  onApply: (capacity: number) => void;
}

/**
 * The answer to the question the app exists for: which battery to buy.
 *
 * The number alone is not persuasive, so the curve behind it is shown: savings
 * rise steeply for the first few kWh and then flatten, and the recommendation
 * sits at the knee. The reader can see what a smaller or larger battery would
 * do and decide differently.
 */
const CapacityAdvisor: React.FC<CapacityAdvisorProps> = ({
  recommendation,
  selectedCapacity,
  onApply,
}) => {
  const option = useMemo(
    () =>
      recommendation
        ? buildCapacityCurveOption(
            recommendation.curve,
            recommendation.capacity,
            selectedCapacity
          )
        : null,
    [recommendation, selectedCapacity]
  );

  if (!recommendation || recommendation.curve.length === 0) {
    return null;
  }

  const { capacity, savingsPerYear, marginalSavingsPerKwh, benefitShare, curve } =
    recommendation;

  const best = curve.reduce((max, p) => Math.max(max, p.savingsPerYear), 0);
  const isApplied = Math.abs(selectedCapacity - capacity) < 1e-6;

  // A few reference sizes for the screen-reader summary, so the table stays short.
  const summaryPoints = curve.filter(
    (p) => Number.isInteger(p.capacity) && p.capacity % 5 === 0
  );

  return (
    <Paper className="paper-card" sx={{ p: 3 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={3}
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
      >
        <Box sx={{ minWidth: { md: 280 } }}>
          <Typography variant="overline" className="micro-label" display="block">
            Doporučená kapacita
          </Typography>
          <Stack direction="row" alignItems="baseline" spacing={1} mb={0.5}>
            <Typography
              sx={{
                fontFamily: 'var(--font-display)',
                fontSize: '3rem',
                fontWeight: 700,
                lineHeight: 1,
                color: 'var(--color-primary)',
              }}
            >
              {formatNumber(capacity, 1)}
            </Typography>
            <Typography variant="h6" color="text.secondary">
              kWh
            </Typography>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ušetří přibližně <strong>{formatCurrency(savingsPerYear)}</strong> ročně, což
            je {formatPercent(benefitShare * 100, 0)} z toho, co by zvládla i baterie za
            {' '}
            {formatKwh(curve[curve.length - 1].capacity, 0)}. Každá další kWh přidá jen{' '}
            {formatCurrency(marginalSavingsPerKwh)} ročně, proto se větší baterie
            nevyplatí.
          </Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              size="small"
              startIcon={<BatteryChargingFullIcon />}
              onClick={() => onApply(capacity)}
              disabled={isApplied}
            >
              {isApplied ? 'Nastaveno' : 'Použít v simulaci'}
            </Button>
            {!isApplied && (
              <Chip
                size="small"
                variant="outlined"
                label={`Nyní ${formatNumber(selectedCapacity, 1)} kWh`}
              />
            )}
          </Stack>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" gutterBottom>
            Kolik ušetří baterie podle velikosti
          </Typography>
          <Box
            className="blueprint-surface"
            sx={{ height: 260 }}
            role="img"
            aria-label={`Graf roční úspory podle kapacity baterie. Doporučená kapacita ${formatNumber(capacity, 1)} kilowatthodin ušetří ${formatCurrency(savingsPerYear)} ročně.`}
          >
            {option && (
              <ReactEChartsCore
                echarts={echarts}
                theme="observatory"
                option={option}
                style={{ height: '100%', width: '100%' }}
                notMerge
              />
            )}
          </Box>

          <Box sx={visuallyHidden}>
            <table>
              <caption>Roční úspora podle kapacity baterie</caption>
              <thead>
                <tr>
                  <th scope="col">Kapacita</th>
                  <th scope="col">Úspora za rok</th>
                  <th scope="col">Podíl dosažitelného přínosu</th>
                  <th scope="col">Dnů bez dokupu ze sítě</th>
                </tr>
              </thead>
              <tbody>
                {summaryPoints.map((point) => (
                  <tr key={point.capacity}>
                    <th scope="row">{formatKwh(point.capacity, 0)}</th>
                    <td>{formatCurrency(point.savingsPerYear)}</td>
                    <td>
                      {formatPercent(best > 0 ? (point.savingsPerYear / best) * 100 : 0, 0)}
                    </td>
                    <td>{formatNumber(point.offGridDaysPerYear, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
};

export default CapacityAdvisor;
