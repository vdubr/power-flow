import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { EnergyRecord } from '../../types/energy';
import { getTopConsumptionDays } from '../../utils/dataAggregation';
import { formatDate, formatKwh, formatPercent } from '../../utils/format';

interface TopConsumptionDaysProps {
  records: EnergyRecord[];
}

/**
 * Rendered as a native <ol>/<li> list with one accessible label per row, so a
 * screen reader gets a full sentence ("1. místo: …") instead of silently
 * skipping the colour bar, which is decorative and marked `aria-hidden`.
 */
const TopConsumptionDays: React.FC<TopConsumptionDaysProps> = ({ records }) => {
  const top = useMemo(() => getTopConsumptionDays(records, 10), [records]);

  if (top.length === 0) return null;

  const max = top[0].consumption;

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Dny s nejvyšší spotřebou
        <Typography
          component="span"
          variant="caption"
          color="text.secondary"
          sx={{ ml: 1, fontWeight: 400 }}
        >
          — TOP 10
        </Typography>
      </Typography>
      <Box
        component="ol"
        aria-label="Deset dnů s nejvyšší spotřebou, seřazeno sestupně"
        sx={{ listStyle: 'none', m: 0, p: 0 }}
      >
        {top.map((d, i) => {
          const pct = max > 0 ? (d.consumption / max) * 100 : 0;
          const dateStr = formatDate(d.date);
          const valueStr = formatKwh(d.consumption);
          return (
            <Box
              component="li"
              key={d.date.getTime()}
              aria-label={`${i + 1}. místo: ${dateStr}, spotřeba ${valueStr}, ${formatPercent(pct, 0)} maxima`}
              sx={{
                display: 'grid',
                gridTemplateColumns: '32px 110px 1fr 90px',
                alignItems: 'center',
                gap: 1.5,
                py: 0.5,
              }}
            >
              <Typography
                aria-hidden="true"
                variant="body2"
                fontWeight={700}
                sx={{ color: 'var(--color-primary)', textAlign: 'center' }}
              >
                {i + 1}
              </Typography>
              <Typography aria-hidden="true" variant="body2" color="text.secondary">
                {dateStr}
              </Typography>
              <Box
                aria-hidden="true"
                sx={{
                  height: 11,
                  borderRadius: 999,
                  bgcolor: 'color-mix(in oklab, var(--color-muted-foreground) 12%, transparent)',
                  border: '1px solid var(--color-border)',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    width: `${pct}%`,
                    height: '100%',
                    bgcolor: 'var(--color-destructive)',
                    opacity: 0.7,
                  }}
                />
              </Box>
              <Typography aria-hidden="true" variant="body2" fontWeight={700} sx={{ textAlign: 'right' }}>
                {valueStr}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default TopConsumptionDays;
