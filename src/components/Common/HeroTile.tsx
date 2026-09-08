import React from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';

export interface HeroTileProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle?: string;
  color: string;
}

/**
 * Large KPI tile used for the headline metrics of a panel (battery
 * recommendation, savings, etc.). Shared between BatteryAnalysis and any
 * other panel that needs the same "big number" treatment.
 *
 * Uses `.paper-card` for the surface (DESIGN.md), so it always gets the
 * same translucent background, border and shadow as every other card in
 * the app instead of a one-off flat override.
 */
const HeroTile: React.FC<HeroTileProps> = ({ icon, title, value, subtitle, color }) => (
  <Card className="paper-card" sx={{ height: '100%' }}>
    <CardContent>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={1.5}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color,
            bgcolor: `color-mix(in oklab, ${color} 18%, transparent)`,
          }}
        >
          {icon}
        </Box>
        <Typography variant="overline" className="micro-label">
          {title}
        </Typography>
      </Stack>
      <Typography
        variant="h4"
        fontWeight={600}
        sx={{
          color,
          fontFamily: 'var(--font-display)',
          mb: 0.5,
        }}
      >
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </CardContent>
  </Card>
);

export default HeroTile;
