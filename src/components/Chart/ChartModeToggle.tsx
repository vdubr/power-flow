import React from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useEnergyStore } from '../../store/energyStore';
import { ChartMode } from '../../types/energy';

const MODES: Array<{ value: ChartMode; label: string }> = [
  { value: 'balance', label: 'Odběr a dodávka' },
  { value: 'net', label: 'Dokoupená energie' },
];

const MODE_HELP =
  '„Odběr a dodávka" kreslí obě strany elektroměru proti sobě – odběr pod nulou, dodávku nad ní. ' +
  '„Dokoupená energie" je rozdíl obou: kolik zbylo dokoupit, když se od odběru odečte dodávka. ' +
  'Pod nulou tedy dodávka převážila odběr.';

/**
 * Which quantities the chart draws.
 *
 * Sits next to the aggregation — both answer "co se kreslí", so they belong
 * together above the chart rather than in a settings panel further down.
 */
const ChartModeToggle: React.FC = () => {
  const availableYears = useEnergyStore((s) => s.availableYears);
  const chartMode = useEnergyStore((s) => s.chartConfig.chartMode);
  const setChartMode = useEnergyStore((s) => s.setChartMode);

  const hasData = availableYears.length > 0;

  return (
    <Tooltip title={MODE_HELP} arrow>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={chartMode}
        onChange={(_event, value: ChartMode | null) => {
          // ECharts-style groups report null when the active button is clicked
          // again; keeping the current mode is better than an empty chart.
          if (value !== null) setChartMode(value);
        }}
        aria-label="Co graf kreslí"
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
          },
        }}
      >
        {MODES.map((mode) => (
          <ToggleButton key={mode.value} value={mode.value} disabled={!hasData}>
            {mode.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Tooltip>
  );
};

export default ChartModeToggle;
