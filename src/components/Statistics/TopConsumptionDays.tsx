import React, { useMemo } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { EnergyRecord } from '../../types/energy';
import { getTopConsumptionDays } from '../../utils/dataAggregation';

interface TopConsumptionDaysProps {
  records: EnergyRecord[];
}

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
      <Stack spacing={0.5}>
        {top.map((d, i) => {
          const pct = max > 0 ? (d.consumption / max) * 100 : 0;
          const dateStr = d.date.toLocaleDateString('cs-CZ', {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric',
          });
          return (
            <Box
              key={d.date.toISOString()}
              sx={{
                display: 'grid',
                gridTemplateColumns: '32px 110px 1fr 90px',
                alignItems: 'center',
                gap: 1.5,
                py: 0.5,
              }}
            >
              <Typography
                variant="body2"
                fontWeight={700}
                sx={{ color: 'var(--color-primary)', textAlign: 'center' }}
              >
                {i + 1}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {dateStr}
              </Typography>
              <Box
                sx={{
                  height: 11,
                  borderRadius: 999,
                  bgcolor: 'rgba(255,255,255,0.05)',
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
              <Typography variant="body2" fontWeight={700} sx={{ textAlign: 'right' }}>
                {d.consumption.toFixed(1)} kWh
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

export default TopConsumptionDays;
