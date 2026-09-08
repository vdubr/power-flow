import React from 'react';
import { Stack, Typography } from '@mui/material';

export interface SectionHeaderProps {
  /** Heading text. */
  title: React.ReactNode;
  /** Optional supporting copy shown under the title. */
  description?: React.ReactNode;
  /** Optional content pinned to the right (e.g. a RangeControl, a button). */
  action?: React.ReactNode;
  /**
   * 'panel' – top-level heading for a whole card/panel (h6).
   * 'section' – smaller heading for a sub-section inside a panel (subtitle1).
   * Defaults to 'panel'.
   */
  variant?: 'panel' | 'section';
}

/**
 * "Heading + optional description + optional right-hand slot" row, shared by
 * StatisticsPanel, YearComparisonTable and any other panel that repeats this
 * layout instead of hand-rolling the same Stack every time.
 */
const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  action,
  variant = 'panel',
}) => (
  <Stack
    direction="row"
    alignItems={description ? 'flex-start' : 'center'}
    justifyContent="space-between"
    flexWrap="wrap"
    gap={2}
    sx={{ mb: variant === 'panel' ? 2 : 1 }}
  >
    <Stack spacing={0.5}>
      <Typography
        variant={variant === 'panel' ? 'h6' : 'subtitle1'}
        fontWeight={variant === 'section' ? 600 : undefined}
      >
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      )}
    </Stack>
    {action}
  </Stack>
);

export default SectionHeader;
