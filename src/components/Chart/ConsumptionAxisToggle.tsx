import React from 'react';
import { FormControlLabel, Switch, Tooltip, Typography } from '@mui/material';
import { useEnergyStore } from '../../store/energyStore';

const HELP =
  'Zrcadlí odebranou energii pod nulu, aby šly obě strany elektroměru číst proti sobě ' +
  'místo porovnávání dvou sloupců vedle sebe. Mění jen kresbu – čísla zůstávají kladná.';

/**
 * Mirrors what was bought below the zero line.
 *
 * A way of looking at the same numbers, so it sits with the aggregation and
 * the chart mode above the chart rather than in the filter, which is about
 * which data is drawn at all.
 */
const ConsumptionAxisToggle: React.FC = () => {
  const availableYears = useEnergyStore((s) => s.availableYears);
  const consumptionBelowAxis = useEnergyStore((s) => s.chartConfig.consumptionBelowAxis);
  const setConsumptionBelowAxis = useEnergyStore((s) => s.setConsumptionBelowAxis);

  return (
    <Tooltip title={HELP} arrow>
      <FormControlLabel
        sx={{ mr: 0 }}
        control={
          <Switch
            checked={consumptionBelowAxis}
            onChange={(event) => setConsumptionBelowAxis(event.target.checked)}
            disabled={availableYears.length === 0}
            size="small"
            slotProps={{ input: { 'aria-label': 'Spotřeba pod osu' } }}
          />
        }
        label={
          <Typography variant="body2" color="text.secondary">
            Spotřeba pod osu
          </Typography>
        }
      />
    </Tooltip>
  );
};

export default ConsumptionAxisToggle;
