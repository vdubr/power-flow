import React from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import LoginIcon from '@mui/icons-material/Login';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DifferenceIcon from '@mui/icons-material/Difference';

interface GuideStep {
  number: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
}

// We do not ship real screenshots of the ČEZ Distribuce portal (it changes
// layout regularly and we have no licence to redistribute it). Rather than
// leaving an empty dashed box with a caption pretending to be an image — which
// reads as a broken/missing asset — each step gets a schematic icon in the
// project's own design language (F6). It illustrates the *kind* of screen the
// user will see without claiming to reproduce it.
const STEPS: GuideStep[] = [
  {
    number: 1,
    title: 'Přihlášení',
    subtitle: 'portál ČEZ Distribuce → přihlášení',
    icon: <LoginIcon sx={{ fontSize: 44 }} />,
    accent: 'var(--color-primary)',
  },
  {
    number: 2,
    title: 'Export měření',
    subtitle: 'Měření → Export → období + CSV',
    icon: <FileDownloadIcon sx={{ fontSize: 44 }} />,
    accent: 'var(--chart-2)',
  },
  {
    number: 3,
    title: 'Dva soubory',
    subtitle: 'Spotřeba (+A) a Výroba (−A) zvlášť',
    icon: <DifferenceIcon sx={{ fontSize: 44 }} />,
    accent: 'var(--chart-3)',
  },
];

const CezGuide: React.FC = () => {
  return (
    <Paper className="paper-card" sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Jak stáhnout data z ČEZ Distribuce
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Postup pro získání měřených dat z portálu ČEZ Distribuce ve třech krocích.
        Soubory CSV pak můžete nahrát výše.
      </Typography>

      <Grid container spacing={2}>
        {STEPS.map((step) => (
          <Grid key={step.number} size={{ xs: 12, md: 4 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-primary-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.95rem',
                    flexShrink: 0,
                  }}
                >
                  {step.number}
                </Box>
                <Typography variant="h6" sx={{ fontSize: '1.05rem' }}>
                  {step.title}
                </Typography>
              </Stack>

              <Typography variant="body2" color="text.secondary">
                {step.subtitle}
              </Typography>

              <Box
                className="blueprint-surface"
                aria-hidden="true"
                sx={{
                  height: 120,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: step.accent,
                }}
              >
                {step.icon}
              </Box>
            </Stack>
          </Grid>
        ))}
      </Grid>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 3 }}
      >
        Po stažení nahrajte CSV soubory výše.
      </Typography>
    </Paper>
  );
};

export default CezGuide;
