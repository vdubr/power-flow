import React from 'react';
import {
  Paper,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  TextField,
  Autocomplete,
} from '@mui/material';
import { useEnergyStore } from '../../store/energyStore';
import { AggregationType, LocationConfig } from '../../types/energy';
import { CZECH_LOCATIONS, getDefaultLocation } from '../../utils/sunCalculations';

const AGGREGATION_OPTIONS: Array<{ value: AggregationType; label: string; description: string }> = [
  { value: 'raw', label: '15min intervaly', description: 'Surová data (omezeno na 5000 bodů)' },
  { value: 'hourly', label: '1 hodina', description: 'Součet po hodinách' },
  { value: 'dayNight', label: 'Den/Noc', description: 'Agregace podle denní/noční doby' },
  { value: 'daily', label: 'Denní', description: 'Součet za každý den' },
  { value: 'weekly', label: 'Týdenní', description: 'Součet za každý týden' },
  { value: 'monthly', label: 'Měsíční', description: 'Součet za každý měsíc' },
];

const ChartControls: React.FC = () => {
  const availableYears = useEnergyStore((s) => s.availableYears);
  const aggregationType = useEnergyStore((s) => s.chartConfig.aggregationType);
  const selectedYears = useEnergyStore((s) => s.chartConfig.selectedYears);
  const showConsumption = useEnergyStore((s) => s.chartConfig.showConsumption);
  const showProduction = useEnergyStore((s) => s.chartConfig.showProduction);
  const dayNightConfig = useEnergyStore((s) => s.chartConfig.dayNightConfig);
  const showSunOverlay = useEnergyStore((s) => s.chartConfig.showSunOverlay);
  const setAggregationType = useEnergyStore((s) => s.setAggregationType);
  const setSelectedYears = useEnergyStore((s) => s.setSelectedYears);
  const toggleConsumption = useEnergyStore((s) => s.toggleConsumption);
  const toggleProduction = useEnergyStore((s) => s.toggleProduction);
  const setDayNightConfig = useEnergyStore((s) => s.setDayNightConfig);
  const setShowSunOverlay = useEnergyStore((s) => s.setShowSunOverlay);
  
  const handleYearChange = (year: number) => {
    const newYears = selectedYears.includes(year)
      ? selectedYears.filter(y => y !== year)
      : [...selectedYears, year].sort();
    setSelectedYears(newYears);
  };
  
  const handleDayNightModeChange = (mode: 'manual' | 'sun') => {
    setDayNightConfig({
      ...dayNightConfig,
      mode,
      location: mode === 'sun' ? (dayNightConfig.location || getDefaultLocation()) : undefined,
    });
  };
  
  const handleTimeChange = (field: 'manualDayStart' | 'manualDayEnd', value: string) => {
    setDayNightConfig({
      ...dayNightConfig,
      [field]: value,
    });
  };
  
  const handleLocationChange = (location: LocationConfig | null) => {
    if (location) {
      setDayNightConfig({
        ...dayNightConfig,
        location,
      });
    }
  };
  
  const hasData = availableYears.length > 0;
  
  return (
    <Paper className="paper-card fade-up" sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Nastavení grafu
      </Typography>
      
      <Stack spacing={3}>
        {/* Aggregation type */}
        <FormControl fullWidth size="small">
          <InputLabel>Agregace</InputLabel>
          <Select
            value={aggregationType}
            label="Agregace"
            onChange={(e) => setAggregationType(e.target.value as AggregationType)}
            disabled={!hasData}
          >
            {AGGREGATION_OPTIONS.map(opt => (
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

        {/* Sun overlay toggle */}
        <Box>
          <Typography variant="overline" className="micro-label" gutterBottom display="block">
            Overlay
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={showSunOverlay}
                onChange={(e) => setShowSunOverlay(e.target.checked)}
                disabled={
                  !hasData ||
                  !(aggregationType === 'raw' || aggregationType === 'hourly') ||
                  selectedYears.length !== 1
                }
              />
            }
            label={<Typography variant="body2">Východ / západ slunce</Typography>}
          />
          {showSunOverlay &&
            !(aggregationType === 'raw' || aggregationType === 'hourly') && (
              <Typography variant="caption" color="text.secondary" display="block">
                Overlay je dostupný jen pro 15min a 1h zobrazení
              </Typography>
            )}
          {showSunOverlay &&
            (aggregationType === 'raw' || aggregationType === 'hourly') &&
            selectedYears.length > 1 && (
              <Typography variant="caption" color="text.secondary" display="block">
                Overlay je dostupný jen při výběru jednoho roku
              </Typography>
            )}
        </Box>
        
        {/* Day/Night settings */}
        {aggregationType === 'dayNight' && (
          <Box sx={{ pl: 2, borderLeft: '3px solid', borderColor: 'primary.main' }}>
            <Typography variant="overline" className="micro-label" gutterBottom display="block">
              Nastavení Den/Noc
            </Typography>
            
            <Stack spacing={2}>
              <FormControl component="fieldset">
                <Stack direction="row" spacing={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={dayNightConfig.mode === 'manual'}
                        onChange={() => handleDayNightModeChange('manual')}
                        size="small"
                      />
                    }
                    label="Manuální"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={dayNightConfig.mode === 'sun'}
                        onChange={() => handleDayNightModeChange('sun')}
                        size="small"
                      />
                    }
                    label="Podle slunce"
                  />
                </Stack>
              </FormControl>
              
              {dayNightConfig.mode === 'manual' ? (
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Začátek dne"
                    type="time"
                    size="small"
                    value={dayNightConfig.manualDayStart}
                    onChange={(e) => handleTimeChange('manualDayStart', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Konec dne"
                    type="time"
                    size="small"
                    value={dayNightConfig.manualDayEnd}
                    onChange={(e) => handleTimeChange('manualDayEnd', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Stack>
              ) : (
                <Autocomplete
                  size="small"
                  options={CZECH_LOCATIONS}
                  getOptionLabel={(option) => option.name || ''}
                  value={dayNightConfig.location || getDefaultLocation()}
                  onChange={(_, value) => handleLocationChange(value)}
                  renderInput={(params) => (
                    <TextField {...params} label="Lokace" />
                  )}
                  isOptionEqualToValue={(option, value) => 
                    option.latitude === value.latitude && option.longitude === value.longitude
                  }
                />
              )}
            </Stack>
          </Box>
        )}
        
        {/* Year selection */}
        <Box>
          <Typography variant="overline" className="micro-label" gutterBottom display="block">
            Roky k zobrazení
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {availableYears.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nahrajte data pro výběr roků
              </Typography>
            ) : (
              availableYears.map(year => (
                <Chip
                  key={year}
                  label={year}
                  onClick={() => handleYearChange(year)}
                  color={selectedYears.includes(year) ? 'primary' : 'default'}
                  variant={selectedYears.includes(year) ? 'filled' : 'outlined'}
                />
              ))
            )}
          </Stack>
          {selectedYears.length > 1 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Více vybraných roků = porovnání na stejné ose X
            </Typography>
          )}
        </Box>
        
        {/* Show/hide series */}
        <Box>
          <Typography variant="overline" className="micro-label" gutterBottom display="block">
            Zobrazit
          </Typography>
          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={showConsumption}
                  onChange={toggleConsumption}
                  color="error"
                  disabled={!hasData}
                />
              }
              label={
                <Typography variant="body2" color={showConsumption ? 'error.main' : 'text.secondary'}>
                  Spotřeba
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={showProduction}
                  onChange={toggleProduction}
                  color="success"
                  disabled={!hasData}
                />
              }
              label={
                <Typography variant="body2" color={showProduction ? 'success.main' : 'text.secondary'}>
                  Výroba
                </Typography>
              }
            />
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
};

export default ChartControls;
