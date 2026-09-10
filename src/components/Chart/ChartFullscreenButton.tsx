import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { useFullscreen } from '../../hooks/useFullscreen';

interface ChartFullscreenButtonProps {
  targetRef: React.RefObject<HTMLElement | null>;
}

/**
 * Blows up the chart section to the whole screen.
 *
 * Takes only the element to expand, so it stays indifferent to what the
 * section is made of — the chart library, the store and the series filter are
 * none of its business. Where the browser has no Fullscreen API it renders
 * nothing: a control that provably cannot work only costs the user a click.
 */
const ChartFullscreenButton: React.FC<ChartFullscreenButtonProps> = ({ targetRef }) => {
  const { isFullscreen, supported, toggle } = useFullscreen(targetRef);

  if (!supported) return null;

  // The icon alone does not say which way the switch goes, so the same wording
  // serves the tooltip and the accessible name.
  const label = isFullscreen ? 'Ukončit celou obrazovku' : 'Zobrazit graf na celou obrazovku';

  return (
    <Tooltip title={label} arrow>
      <IconButton
        size="small"
        onClick={toggle}
        aria-label={label}
        sx={{ color: 'var(--color-muted-foreground)' }}
      >
        {isFullscreen ? (
          <FullscreenExitIcon sx={{ fontSize: 20 }} />
        ) : (
          <FullscreenIcon sx={{ fontSize: 20 }} />
        )}
      </IconButton>
    </Tooltip>
  );
};

export default ChartFullscreenButton;
