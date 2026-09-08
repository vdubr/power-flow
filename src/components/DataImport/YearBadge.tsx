import React from 'react';
import { Box, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export interface YearBadgeProps {
  year: number;
  isActive: boolean;
  hasProd: boolean;
  hasCons: boolean;
  onToggle: (year: number) => void;
  onRemove: (year: number) => void;
}

/**
 * One year in the collapsed import bar: toggles that year in/out of the
 * active selection on click, and removes it from the store entirely via the
 * delete affordance. See design/design_handoff/README.md for the original
 * wireframe this was built from.
 */
const YearBadge: React.FC<YearBadgeProps> = ({
  year,
  isActive,
  hasProd,
  hasCons,
  onToggle,
  onRemove,
}) => {
  return (
    <Chip
      label={
        <Box
          component="span"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            {year}
          </Box>
          <Box component="span" sx={{ display: 'inline-flex', gap: 0.5 }}>
            <Box
              component="span"
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: hasProd
                  ? 'var(--chart-5)'
                  : 'var(--color-muted-foreground)',
                opacity: hasProd ? 1 : 0.25,
              }}
            />
            <Box
              component="span"
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: hasCons
                  ? 'var(--color-destructive)'
                  : 'var(--color-muted-foreground)',
                opacity: hasCons ? 1 : 0.25,
              }}
            />
          </Box>
        </Box>
      }
      onClick={() => onToggle(year)}
      onDelete={() => onRemove(year)}
      deleteIcon={<CloseIcon aria-label={`Smazat data roku ${year}`} />}
      variant={isActive ? 'filled' : 'outlined'}
      color={isActive ? 'primary' : 'default'}
      size="small"
      sx={{
        opacity: isActive ? 1 : 0.4,
        transition: 'opacity .15s',
        cursor: 'pointer',
        '& .MuiChip-deleteIcon': {
          // Visible at a reduced opacity by default (not just on hover) so the
          // remove action is discoverable without a mouse, per DESIGN.md
          // ("Controls must remain usable on mobile, especially add/remove
          // actions"). Hover on desktop still brings it to full strength.
          opacity: 0.45,
          transition: 'opacity .15s',
        },
        '&:hover': { opacity: 1 },
        '&:hover .MuiChip-deleteIcon': { opacity: 1 },
        // Touch/coarse-pointer devices have no hover state at all, so the
        // delete icon must default to fully visible there.
        '@media (hover: none), (pointer: coarse)': {
          '& .MuiChip-deleteIcon': { opacity: 1 },
        },
      }}
    />
  );
};

export default YearBadge;
