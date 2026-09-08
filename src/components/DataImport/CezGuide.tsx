import React from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';

interface GuideStep {
  number: number;
  title: string;
  subtitle: string;
  placeholder: string;
}

const STEPS: GuideStep[] = [
  {
    number: 1,
    title: 'Přihlášení',
    subtitle: 'portál ČEZ Distribuce → přihlášení',
    placeholder: 'screenshot: přihlašovací obrazovka',
  },
  {
    number: 2,
    title: 'Export měření',
    subtitle: 'Měření → Export → období + CSV',
    placeholder: 'screenshot: dialog exportu měření',
  },
  {
    number: 3,
    title: 'Dva soubory',
    subtitle: 'Spotřeba (+A) a Výroba (−A) zvlášť',
    placeholder: 'screenshot: dva stažené CSV soubory',
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
                sx={{
                  height: 120,
                  borderStyle: 'dashed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 2,
                  textAlign: 'center',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-muted-foreground)',
                  }}
                >
                  {step.placeholder}
                </Typography>
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
