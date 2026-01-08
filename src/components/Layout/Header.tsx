import React from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import SolarPowerIcon from '@mui/icons-material/SolarPower';

const Header: React.FC = () => {
  return (
    <AppBar 
      position="static" 
      sx={{ 
        backgroundColor: '#1a1a1a',
        borderBottom: '1px solid #2d2d2d',
      }}
    >
      <Toolbar>
        <SolarPowerIcon sx={{ mr: 2, fontSize: 32, color: '#ff9800' }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600, color: '#ffffff' }}>
          Solar Analytics
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" sx={{ color: '#b0b0b0' }}>
          Analýza spotřeby a výroby elektřiny z FVE
        </Typography>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
