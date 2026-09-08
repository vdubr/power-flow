import React from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import SolarPowerIcon from '@mui/icons-material/SolarPower';

const Header: React.FC = () => {
  return (
    <AppBar 
      position="static" 
      className="glass-panel"
      sx={{ 
        backgroundColor: 'var(--color-card)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <Toolbar>
        <SolarPowerIcon sx={{ mr: 2, fontSize: 32, color: 'var(--color-primary)' }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Solar Analytics
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="overline" className="micro-label" sx={{ color: 'var(--color-muted-foreground)' }}>
          Analýza spotřeby a výroby elektřiny z FVE
        </Typography>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
