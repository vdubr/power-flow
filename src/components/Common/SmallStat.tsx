import React from 'react';
import { Box, Stack, Typography } from '@mui/material';

export interface SmallStatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

/**
 * Compact label/value row used for secondary metrics next to a HeroTile
 * (e.g. "Reálné využití při této konfiguraci" in BatteryAnalysis).
 *
 * `theme.shape.borderRadius` and `--color-muted` keep this on the same
 * token system as the rest of the app instead of one-off hex/rgba values.
 */
const SmallStat: React.FC<SmallStatProps> = ({ icon, label, value }) => (
  <Stack
    direction="row"
    alignItems="center"
    justifyContent="space-between"
    sx={(theme) => ({
      px: 2,
      py: 1.25,
      borderRadius: `${theme.shape.borderRadius}px`,
      border: '1px solid var(--color-border)',
      backgroundColor: 'color-mix(in oklab, var(--color-muted) 45%, transparent)',
    })}
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

export default SmallStat;
