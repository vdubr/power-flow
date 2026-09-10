import React, { useCallback, useState } from 'react';
import { Chip, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { useEnergyStore } from '../../store/energyStore';
import { LocationConfig } from '../../types/energy';
import { CZECH_LOCATIONS, getDefaultLocation } from '../../utils/sunCalculations';

const LISTBOX_ID = 'location-chip-listbox';
/** Says why a location belongs in the import bar at all. */
const LOCATION_HINT = 'Lokalita pro výpočet východu a západu slunce';

/** Identity is the spot, not the object — `name` is optional in LocationConfig. */
function isSameLocation(a: LocationConfig, b: LocationConfig): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

/**
 * The location chip in the import bar is where the location gets picked. It
 * belongs next to the imported data because it decides one thing only: where
 * sunrise and sunset fall, and therefore how every day/night split is drawn.
 * Reads and writes the store itself, so the import bar stays a layout.
 */
const LocationChip: React.FC = () => {
  const dayNightConfig = useEnergyStore((s) => s.chartConfig.dayNightConfig);
  const setDayNightConfig = useEnergyStore((s) => s.setDayNightConfig);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const open = anchorEl !== null;
  const location = dayNightConfig.location ?? getDefaultLocation();
  const locationName = location.name ?? getDefaultLocation().name;

  const handleSelect = useCallback(
    (next: LocationConfig) => {
      // Choosing a town is a statement about the sun, so it arms sun mode too:
      // under manual day times the pick would change nothing and the chip would
      // look broken.
      setDayNightConfig({ ...dayNightConfig, mode: 'sun', location: next });
      setAnchorEl(null);
    },
    [dayNightConfig, setDayNightConfig]
  );

  return (
    <>
      <Tooltip title={LOCATION_HINT} arrow describeChild>
        <Chip
          component="button"
          type="button"
          icon={<LocationOnIcon fontSize="small" />}
          label={locationName}
          variant="outlined"
          size="small"
          onClick={(event) => setAnchorEl(event.currentTarget)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? LISTBOX_ID : undefined}
          // WCAG 2.5.3: the visible town name has to be part of the accessible
          // name, so the hint is appended to it, never substituted for it.
          aria-label={`Lokalita: ${locationName} – změnit`}
        />
      </Tooltip>

      <Menu
        id={LISTBOX_ID}
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        slotProps={{ list: { role: 'listbox', 'aria-label': 'Lokalita', dense: true } }}
      >
        {CZECH_LOCATIONS.map((option) => {
          const selected = isSameLocation(option, location);
          return (
            <MenuItem
              key={option.name}
              role="option"
              selected={selected}
              // MUI marks `selected` with a class only; option semantics need
              // the state spelled out for screen readers as well.
              aria-selected={selected}
              onClick={() => handleSelect(option)}
            >
              <ListItemIcon>
                {/* The slot stays mounted for unselected towns so the labels
                    keep one left edge instead of jumping by the check mark. */}
                {selected && <CheckIcon fontSize="small" sx={{ color: 'var(--color-primary)' }} />}
              </ListItemIcon>
              <ListItemText>{option.name}</ListItemText>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
};

export default LocationChip;
