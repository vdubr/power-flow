import React from 'react';
import { IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useEnergyStore } from '../../store/energyStore';
import { RangeMode } from '../../types/energy';

/**
 * Switches the "active range" every panel reads through `getActiveRecords()`:
 * the chart's year selection, the statistics KPIs and the battery simulation
 * all follow this control, not just the panel it happens to be rendered in.
 */
const SCOPE_HELP =
  'Rozsah platí pro celou stránku – graf, statistiky i simulaci baterie čtou stejná data. ' +
  '„Vybrané roky“ sečte záznamy zaškrtnutých let (nic se nezprůměruje), ' +
  '„Poslední rok“ použije jen nejnovější z vybraných let a ' +
  '„Výseč v grafu“ jen úsek, na který je hlavní graf právě přiblížený.';

const RangeControl: React.FC = () => {
  const rangeMode = useEnergyStore((s) => s.chartConfig.rangeMode);
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
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={rangeMode}
        onChange={handleChange}
        aria-label="Režim výběru rozsahu (platí pro celou stránku)"
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
        <ToggleButton value="years" color="primary">
          Vybrané roky
        </ToggleButton>
        <ToggleButton value="last" color="primary">
          Poslední rok
        </ToggleButton>
        {/* Always available: the zoom window is the selection, and without a
            zoom it is simply the whole range. Disabling it used to hide the
            option until the user found the brush tool. */}
        <ToggleButton value="selection" color="primary">
          Výseč v grafu
        </ToggleButton>
      </ToggleButtonGroup>
      <Tooltip title={SCOPE_HELP} arrow>
        <IconButton
          size="small"
          aria-label="Nápověda k rozsahu dat"
          sx={{ color: 'var(--color-muted-foreground)' }}
        >
          <InfoOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
};

export default RangeControl;
