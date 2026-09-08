import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useEnergyStore } from '../../store/energyStore';
import { RangeMode } from '../../types/energy';

const RangeControl: React.FC = () => {
  const rangeMode = useEnergyStore((s) => s.chartConfig.rangeMode);
  const timeRange = useEnergyStore((s) => s.chartConfig.timeRange);
  const setRangeMode = useEnergyStore((s) => s.setRangeMode);

  const handleChange = (
    _event: React.MouseEvent<HTMLElement>,
    value: RangeMode | null
  ) => {
    if (value !== null) {
      setRangeMode(value);
    }
  };

  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={rangeMode}
      onChange={handleChange}
      aria-label="Režim výběru rozsahu"
      sx={{
        borderRadius: 999,
        backgroundColor: 'color-mix(in oklab, var(--color-muted) 60%, transparent)',
        border: '1px solid var(--color-border)',
        p: 0.25,
        '& .MuiToggleButton-root': {
          border: 0,
          borderRadius: 999,
          px: 1.5,
          py: 0.5,
          textTransform: 'none',
          fontSize: '0.78rem',
          color: 'var(--color-muted-foreground)',
          '&.Mui-selected': {
            backgroundColor: 'color-mix(in oklab, var(--color-primary) 24%, transparent)',
            color: 'var(--color-primary)',
            fontWeight: 600,
            '&:hover': {
              backgroundColor: 'color-mix(in oklab, var(--color-primary) 32%, transparent)',
            },
          },
          '&.Mui-disabled': {
            color: 'color-mix(in oklab, var(--color-muted-foreground) 60%, transparent)',
          },
        },
      }}
    >
      <ToggleButton value="avg" color="primary">
        Ø průměr
      </ToggleButton>
      <ToggleButton value="last" color="primary">
        Poslední rok
      </ToggleButton>
      <ToggleButton value="selection" color="primary" disabled={timeRange == null}>
        Výseč v grafu
      </ToggleButton>
    </ToggleButtonGroup>
  );
};

export default RangeControl;
