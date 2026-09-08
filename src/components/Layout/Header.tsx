import React from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import SolarPowerIcon from '@mui/icons-material/SolarPower';

const Header: React.FC = () => {
  return (
    <AppBar
      position="static"
      color="transparent"
      elevation={0}
      className="glass-panel"
    >
      <Toolbar sx={{ gap: 2 }}>
        <SolarPowerIcon sx={{ fontSize: 32, color: 'var(--color-primary)' }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Solar Analytics
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {/* Hidden below `sm`: this technical eyebrow overflowed the toolbar on narrow screens (A3). */}
        <Typography
          variant="overline"
          className="micro-label"
          sx={{
            color: 'var(--color-muted-foreground)',
            display: { xs: 'none', sm: 'block' },
            textAlign: 'right',
          }}
        >
          Analýza spotřeby a výroby elektřiny z FVE
        </Typography>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
