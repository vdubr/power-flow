import React, { useState } from 'react';
import {
  Box,
  Slider,
  Stack,
  TextField,
  Typography,
  InputAdornment,
  Tooltip,
  IconButton,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { BatteryConfig } from '../../types/energy';
import {
  RECOMMENDED_CAPACITY_MIN_KWH,
  RECOMMENDED_CAPACITY_MAX_KWH,
  CAPACITY_CURVE_STEP_KWH,
} from '../../constants';
import { formatNumber } from '../../utils/format';

interface BatteryConfigFormProps {
  config: BatteryConfig;
  disabled?: boolean;
  onChange: (patch: Partial<BatteryConfig>) => void;
}

interface LabelWithHelpProps {
  label: React.ReactNode;
  help: string;
}

/** Label with a question-mark tooltip, for parameters that need a sentence of context. */
const LabelWithHelp: React.FC<LabelWithHelpProps> = ({ label, help }) => (
  <Stack direction="row" alignItems="center" spacing={0.5}>
    <Typography component="span">{label}</Typography>
    <Tooltip title={help}>
      <IconButton size="small" aria-label={help} sx={{ p: 0.25 }}>
        <InfoOutlinedIcon sx={{ fontSize: 16, color: 'var(--color-muted-foreground)' }} />
      </IconButton>
    </Tooltip>
  </Stack>
);

/**
 * The "Co kdyby" controls.
 *
 * Sliders keep their value locally while dragging and only publish it on
 * release (`onChangeCommitted`). Every published change re-runs the simulation
 * over the whole active range, so committing on every pixel of a drag used to
 * freeze the page.
 */
const BatteryConfigForm: React.FC<BatteryConfigFormProps> = ({
  config,
  disabled = false,
  onChange,
}) => {
  const [draft, setDraft] = useState({
    capacity: config.capacity,
    maxDischarge: config.maxDischargePercent,
    efficiency: config.roundTripEfficiency,
  });

  // Adjust the local slider positions when the store changes them from the
  // outside (loading data, "Vymazat všechna data", applying the recommended
  // capacity). Comparing the previous config during render is React's own
  // pattern for derived state; an effect would render twice for every change.
  const [syncedConfig, setSyncedConfig] = useState(config);
  if (config !== syncedConfig) {
    setSyncedConfig(config);
    setDraft({
      capacity: config.capacity,
      maxDischarge: config.maxDischargePercent,
      efficiency: config.roundTripEfficiency,
    });
  }

  const { capacity, maxDischarge, efficiency } = draft;

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 7 }}>
        <Box mb={2}>
          <Typography gutterBottom id="battery-capacity-label">
            Kapacita baterie: <strong>{formatNumber(capacity, 1)} kWh</strong>
          </Typography>
          <Slider
            value={capacity}
            onChange={(_, value) => setDraft((d) => ({ ...d, capacity: value as number }))}
            onChangeCommitted={(_, value) => onChange({ capacity: value as number })}
            min={RECOMMENDED_CAPACITY_MIN_KWH}
            max={RECOMMENDED_CAPACITY_MAX_KWH}
            step={CAPACITY_CURVE_STEP_KWH}
            marks={[
              { value: 5, label: '5' },
              { value: 10, label: '10' },
              { value: 15, label: '15' },
              { value: 20, label: '20' },
              { value: 25, label: '25' },
              { value: 30, label: '30' },
            ]}
            disabled={disabled}
            valueLabelDisplay="auto"
            aria-labelledby="battery-capacity-label"
          />
        </Box>

        <Box mb={2}>
          <Typography gutterBottom id="battery-dod-label" component="div">
            <LabelWithHelp
              label={
                <>
                  Max. vybití: <strong>{maxDischarge} %</strong>
                </>
              }
              help="Jak hluboko se baterie smí vybít. Výrobci obvykle doporučují 80 %, aby baterie vydržela více cyklů."
            />
          </Typography>
          <Slider
            value={maxDischarge}
            onChange={(_, value) => setDraft((d) => ({ ...d, maxDischarge: value as number }))}
            onChangeCommitted={(_, value) =>
              onChange({ maxDischargePercent: value as number })
            }
            min={50}
            max={100}
            step={5}
            marks={[
              { value: 50, label: '50 %' },
              { value: 70, label: '70 %' },
              { value: 80, label: '80 %' },
              { value: 90, label: '90 %' },
              { value: 100, label: '100 %' },
            ]}
            disabled={disabled}
            aria-labelledby="battery-dod-label"
          />
        </Box>

        <Box mb={2}>
          <Typography gutterBottom id="battery-efficiency-label" component="div">
            <LabelWithHelp
              label={
                <>
                  Účinnost: <strong>{efficiency} %</strong>
                </>
              }
              help="Kolik uložené energie se z baterie vrátí zpět. Domácí systém se střídačem má obvykle kolem 90 %; zbytek se ztratí přeměnou."
            />
          </Typography>
          <Slider
            value={efficiency}
            onChange={(_, value) => setDraft((d) => ({ ...d, efficiency: value as number }))}
            onChangeCommitted={(_, value) =>
              onChange({ roundTripEfficiency: value as number })
            }
            min={70}
            max={100}
            step={1}
            marks={[
              { value: 70, label: '70 %' },
              { value: 85, label: '85 %' },
              { value: 100, label: '100 %' },
            ]}
            disabled={disabled}
            aria-labelledby="battery-efficiency-label"
          />
        </Box>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Minimální rezerva"
              type="number"
              value={config.minReserve}
              onChange={(e) => onChange({ minReserve: parseFloat(e.target.value) || 0 })}
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">kWh</InputAdornment>,
                },
                htmlInput: { min: 0, max: config.capacity, step: 0.5 },
              }}
              size="small"
              fullWidth
              disabled={disabled}
              helperText="Nevybíjet pod"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Cena elektřiny"
              type="number"
              value={config.electricityPrice}
              onChange={(e) =>
                onChange({ electricityPrice: parseFloat(e.target.value) || 0 })
              }
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">Kč/kWh</InputAdornment>,
                },
                htmlInput: { min: 0, step: 0.1 },
              }}
              size="small"
              fullWidth
              disabled={disabled}
              helperText="Kolik platíte za odběr"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Výkupní cena"
              type="number"
              value={config.feedInPrice}
              onChange={(e) => onChange({ feedInPrice: parseFloat(e.target.value) || 0 })}
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">Kč/kWh</InputAdornment>,
                },
                htmlInput: { min: 0, step: 0.1 },
              }}
              size="small"
              fullWidth
              disabled={disabled}
              helperText="Za co prodáváte přetoky"
            />
          </Grid>
        </Grid>
      </Grid>

      <Grid size={{ xs: 12, md: 5 }}>
        <Typography
          variant="overline"
          className="micro-label"
          display="block"
          gutterBottom
        >
          Proč na tom záleží
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Uložený přetok už neprodáte, proto se od úspory odečítá výkupní cena. Část
          energie se navíc ztratí přeměnou, takže z baterie vyjde méně, než do ní vešlo.
          Obojí posouvá výsledek blíž realitě než prostý součet ušetřeného nákupu.
        </Typography>
      </Grid>
    </Grid>
  );
};

export default BatteryConfigForm;
