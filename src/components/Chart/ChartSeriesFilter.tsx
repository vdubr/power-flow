import React, { useMemo } from 'react';
import {
  Box,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import { useEnergyStore } from '../../store/energyStore';
import { ConsumptionSplit } from '../../types/energy';
import {
  buildSeriesFilterChips,
  seriesFilterRows,
  QUANTITY_LABEL,
  SeriesQuantity,
} from '../../utils/chartSeriesBuilder';

/** Accent of a row: the semantic color of the quantity it draws. */
const ROW_COLOR: Record<SeriesQuantity, 'error' | 'success' | 'primary'> = {
  consumption: 'error',
  production: 'success',
  net: 'primary',
};

/** What the chip's greyed-out state means, for the tooltip and the a11y name. */
const OFF_HINT = {
  hidden: 'skryto ve filtru, kliknutím zobrazíte',
  'quantity-off': 'celá veličina je vypnutá přepínačem vlevo',
  'year-not-selected': 'rok není vybraný v „Import dat“',
} as const;

/** The four states of the day/night switch, ordered from whole day to half. */
const SPLIT_OPTIONS: Array<{ value: ConsumptionSplit; label: string }> = [
  { value: 'sum', label: 'Suma' },
  { value: 'both', label: 'Den i noc' },
  { value: 'day', label: 'Jen den' },
  { value: 'night', label: 'Jen noc' },
];

/**
 * The labels alone do not say which of the four change the chart, and reading
 * a clipped chart as the whole day is the one mistake this control can cause.
 */
const SPLIT_HELP =
  'Platí pro spotřebovanou energii; výroba se nedělí, po západu slunce panely nic nevyrobí. ' +
  '„Suma“ a „Den i noc“ kreslí stejný graf – „Den i noc“ jen přidá rozpad na den a noc ' +
  'do popisku u kurzoru. „Jen den“ a „Jen noc“ naopak data ořežou: graf i popisek pak ' +
  'ukazují jen tu polovinu dne.';

/**
 * Rows the day/night switch clips: the consumed side of the meter. Production
 * has no night half, and the net series contains the consumption.
 */
function hasSplitSwitch(quantity: SeriesQuantity): boolean {
  return quantity === 'consumption' || quantity === 'net';
}

/** Same pill as `RangeControl`, so the chart's controls read as one family. */
const SPLIT_GROUP_SX: SxProps<Theme> = {
  borderRadius: 999,
  backgroundColor: 'color-mix(in oklab, var(--color-muted) 60%, transparent)',
  border: '1px solid var(--color-border)',
  p: 0.25,
  '& .MuiToggleButton-root': {
    border: 0,
    borderRadius: 999,
    px: 1.25,
    py: 0.25,
    textTransform: 'none',
    fontSize: '0.75rem',
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
};

/**
 * The data filter under the chart: one row per quantity the current view
 * draws — spotřeba and výroba in the balance view, a single "Dokoupená
 * energie" row in the net view, where switching a quantity off would leave
 * nothing on screen.
 *
 * A balance row starts with the switch for the whole quantity (moved here from
 * "Nastavení grafu", where it sat far from the chart it controlled) and
 * continues with one chip per year. The chips replace the legend ECharts drew
 * inside the canvas: with several years that single scrolling row mixed both
 * quantities, and a canvas legend is invisible to a screen reader.
 *
 * A chip is greyed out whether the user clicked it off, switched the whole row
 * off, or unticked the year in "Import dat" — the chart shows the same thing in
 * all three cases, so the filter must not pretend they are different. Only the
 * first is clickable; for the other two the control that caused it is the way
 * back, and clicking the chip would have to guess which one the user meant.
 *
 * Pointing at a chip highlights that one series in the chart, pointing at a row
 * highlights everything the row draws: with four years the chips are the only
 * place where a series can be told apart from its neighbours, so they are also
 * where the chart can be asked which line is which.
 */
const ChartSeriesFilter: React.FC = () => {
  const availableYears = useEnergyStore((s) => s.availableYears);
  const selectedYears = useEnergyStore((s) => s.chartConfig.selectedYears);
  const showConsumption = useEnergyStore((s) => s.chartConfig.showConsumption);
  const showProduction = useEnergyStore((s) => s.chartConfig.showProduction);
  const chartMode = useEnergyStore((s) => s.chartConfig.chartMode);
  const consumptionSplit = useEnergyStore((s) => s.chartConfig.consumptionSplit);
  const hiddenSeries = useEnergyStore((s) => s.chartConfig.hiddenSeries);
  const toggleConsumption = useEnergyStore((s) => s.toggleConsumption);
  const toggleProduction = useEnergyStore((s) => s.toggleProduction);
  const toggleSeriesVisibility = useEnergyStore((s) => s.toggleSeriesVisibility);
  const setConsumptionSplit = useEnergyStore((s) => s.setConsumptionSplit);
  const setHighlightedSeries = useEnergyStore((s) => s.setHighlightedSeries);

  const hasData = availableYears.length > 0;

  const chips = useMemo(
    () =>
      buildSeriesFilterChips({
        availableYears,
        selectedYears,
        showConsumption,
        showProduction,
        chartMode,
        hiddenSeries,
      }),
    [availableYears, selectedYears, showConsumption, showProduction, chartMode, hiddenSeries]
  );

  const rows = useMemo(() => seriesFilterRows(chartMode), [chartMode]);

  /** The whole-quantity switch of a row, `null` where the row has none. */
  const rowSwitchOf = (quantity: SeriesQuantity) => {
    if (quantity === 'consumption') return { on: showConsumption, toggle: toggleConsumption };
    if (quantity === 'production') return { on: showProduction, toggle: toggleProduction };
    return null;
  };

  /**
   * Highlights the given series in the chart while the pointer or the keyboard
   * focus rests on the control. Keyboard included on purpose: tabbing through
   * the chips is the only way to ask "which line is this" without a mouse.
   */
  const highlightWhileOn = (names: string[]) => {
    const on = () => setHighlightedSeries(names);
    const off = () => setHighlightedSeries([]);
    return { onMouseEnter: on, onFocus: on, onMouseLeave: off, onBlur: off };
  };

  const handleSplitChange = (
    _event: React.MouseEvent<HTMLElement>,
    value: ConsumptionSplit | null
  ) => {
    // `exclusive` reports null when the selected button is clicked again, but
    // one of the four always applies — that click is a no-op.
    if (value !== null) setConsumptionSplit(value);
  };

  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="overline" className="micro-label" display="block">
        Filtr dat
      </Typography>

      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {rows.map((row) => {
          const label = QUANTITY_LABEL[row];
          const color = ROW_COLOR[row];
          const rowSwitch = rowSwitchOf(row);
          const rowOn = rowSwitch?.on ?? true;
          // Only what the chart actually draws: a greyed-out chip has nothing
          // to light up.
          const rowHighlight = highlightWhileOn(
            chips.filter((c) => c.quantity === row && c.active).map((c) => c.seriesName)
          );

          return (
            <Stack
              key={row}
              direction="row"
              alignItems="flex-start"
              gap={1}
              // Nowrap keeps the chips aligned under their own column instead
              // of under the switch; on a phone the day/night switch would not
              // fit next to them, so there it is allowed to drop below.
              flexWrap={{ xs: 'wrap', sm: 'nowrap' }}
              useFlexGap
              role="group"
              aria-label={`Filtr grafu – ${label}`}
            >
              {rowSwitch ? (
                <FormControlLabel
                  // The switch keeps its own column: with the chips wrapping
                  // under it on a phone the two rows ran into each other and it
                  // stopped being clear which quantity a chip belonged to.
                  sx={{ mr: 0.5, width: 132, flexShrink: 0 }}
                  {...rowHighlight}
                  control={
                    <Switch
                      checked={rowOn}
                      onChange={rowSwitch.toggle}
                      color={color}
                      disabled={!hasData}
                    />
                  }
                  label={
                    <Typography
                      variant="body2"
                      color={rowOn ? `${color}.main` : 'text.secondary'}
                    >
                      {label}
                    </Typography>
                  }
                />
              ) : (
                // No switch in the net view, but the row still has to name the
                // quantity its chips belong to.
                <Typography
                  variant="body2"
                  color={`${color}.main`}
                  sx={{ mr: 0.5, width: 132, flexShrink: 0, py: 1.25 }}
                  {...rowHighlight}
                >
                  {label}
                </Typography>
              )}

              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                  minWidth: 0,
                  py: 0.75,
                }}
              >
                {chips
                  .filter((chip) => chip.quantity === row)
                  .map((chip) => {
                    // Off because the row switch or the year badge says so?
                    // Then that control is the way back, not this chip.
                    const interactive = chip.active || chip.offReason === 'hidden';
                    const title = chip.active
                      ? `${label} ${chip.label} – kliknutím skryjete`
                      : `${label} ${chip.label} – ${OFF_HINT[chip.offReason!]}`;
                    return (
                      <Chip
                        key={chip.key}
                        size="small"
                        // Always clickable so the chip stays a button for the
                        // keyboard and the screen reader; `disabled` is what
                        // makes MUI mark it aria-disabled and dim it.
                        clickable
                        disabled={!interactive}
                        aria-pressed={chip.active}
                        aria-label={`${label} ${chip.label}`}
                        title={title}
                        variant={chip.active ? 'filled' : 'outlined'}
                        onClick={
                          interactive ? () => toggleSeriesVisibility(chip.seriesName) : undefined
                        }
                        // A series the chart does not draw cannot be
                        // highlighted, and the empty highlight would only stay
                        // stuck after the pointer left.
                        {...(chip.active ? highlightWhileOn([chip.seriesName]) : {})}
                        icon={
                          <Box
                            aria-hidden
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              backgroundColor: chip.color,
                              opacity: chip.active ? 1 : 0.35,
                            }}
                          />
                        }
                        label={chip.label}
                        sx={{ opacity: chip.active ? 1 : 0.6 }}
                      />
                    );
                  })}
              </Box>

              {hasSplitSwitch(row) && (
                // After the year chips, not before them: the years are what the
                // user reaches for, and the day/night switch applies to all of
                // them at once.
                <Box
                  // Pushed to the far end of the row where it fits; on a phone
                  // it wraps onto its own line, where `auto` would leave it
                  // dangling on the right.
                  sx={{ ml: { xs: 0, sm: 'auto' }, flexShrink: 0, py: 0.75 }}
                  {...rowHighlight}
                >
                  {/* `describeChild`: the group keeps its own name, and the
                      explanation is read as its description instead of
                      replacing it. */}
                  <Tooltip title={SPLIT_HELP} arrow describeChild>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={consumptionSplit}
                      onChange={handleSplitChange}
                      disabled={!hasData}
                      aria-label="Rozpad spotřeby na den a noc"
                      sx={SPLIT_GROUP_SX}
                    >
                      {SPLIT_OPTIONS.map((option) => (
                        <ToggleButton key={option.value} value={option.value} color="primary">
                          {option.label}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Tooltip>
                </Box>
              )}
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
};

export default ChartSeriesFilter;
