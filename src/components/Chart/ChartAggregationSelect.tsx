import React from 'react';
import { Box, FormControl, InputLabel, MenuItem, Select, Typography } from '@mui/material';
import { useEnergyStore } from '../../store/energyStore';
import { AggregationType } from '../../types/energy';
import { MAX_RAW_CHART_POINTS } from '../../constants';
import { formatCount } from '../../utils/format';

const AGGREGATION_OPTIONS: Array<{ value: AggregationType; label: string; description: string }> = [
  {
    value: 'raw',
    label: '15min intervaly',
    description: `Surová data (omezeno na ${formatCount(MAX_RAW_CHART_POINTS)} bodů)`,
  },
  { value: 'hourly', label: '1 hodina', description: 'Součet po hodinách' },
  { value: 'daily', label: 'Denní', description: 'Součet za každý den' },
  { value: 'weekly', label: 'Týdenní', description: 'Součet za každý týden' },
  { value: 'monthly', label: 'Měsíční', description: 'Součet za každý měsíc' },
];

/**
 * Which period one bar or point covers.
 *
 * Sits under the chart's own heading, not in "Nastavení grafu": it decides what
 * the chart is showing, so it belongs next to the chart the way the series
 * filter under it does. The remaining settings only tune that view.
 */
const ChartAggregationSelect: React.FC = () => {
  const availableYears = useEnergyStore((s) => s.availableYears);
  const aggregationType = useEnergyStore((s) => s.chartConfig.aggregationType);
  const setAggregationType = useEnergyStore((s) => s.setAggregationType);

  const hasData = availableYears.length > 0;

  return (
    <FormControl
      size="small"
      // The floating label sits at the top edge of the input, so without the
      // top margin it crowds the heading above it.
      sx={{ mt: 0.75, mb: 1.5, width: '100%', maxWidth: 320 }}
    >
      <InputLabel id="aggregation-label">Agregace</InputLabel>
      <Select
        labelId="aggregation-label"
        id="aggregation-select"
        value={aggregationType}
        label="Agregace"
        onChange={(e) => setAggregationType(e.target.value as AggregationType)}
        disabled={!hasData}
      >
        {AGGREGATION_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            <Box>
              <Typography variant="body2">{opt.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                {opt.description}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default ChartAggregationSelect;
