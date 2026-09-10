import React, { useCallback, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { parseCSVFile } from '../../utils/csvParser';
import { useEnergyStore } from '../../store/energyStore';
import { SAMPLE_DATA_YEARS } from '../../constants';
import { DataQuality, ImportSummary, RawDataPoint } from '../../types/energy';
import { emptyQuality, mergeQuality } from './DataQualityNote';

interface SampleDataButtonProps {
  /** Called after a successful load with the combined quality and what changed. */
  onLoaded?: (quality: DataQuality, summary: ImportSummary) => void;
  variant?: 'outlined' | 'text';
  size?: 'small' | 'medium';
  sx?: SxProps<Theme>;
}

async function fetchAsFile(url: string, fileName: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} při načítání ${fileName}`);
  }
  const blob = await response.blob();
  return new File([blob], fileName, { type: 'text/csv' });
}

/**
 * Loads one bundled year and returns its data points.
 *
 * Both files of a year are fetched and parsed together; a failure names the
 * year, because "spotreba.csv se nepodařilo zpracovat" alone would not say
 * which of the bundled years is broken.
 */
async function loadSampleYear(year: number): Promise<{
  consumption: RawDataPoint[];
  production: RawDataPoint[];
  quality: DataQuality;
}> {
  const [consumptionFile, productionFile] = await Promise.all([
    fetchAsFile(`/sample-data/${year}/spotreba.csv`, 'spotreba.csv'),
    fetchAsFile(`/sample-data/${year}/vyroba.csv`, 'vyroba.csv'),
  ]);

  const [consumptionResult, productionResult] = await Promise.all([
    parseCSVFile(consumptionFile),
    parseCSVFile(productionFile),
  ]);

  if (!consumptionResult.success) {
    throw new Error(
      `Chyba při zpracování spotreba.csv (${year}): ${consumptionResult.errors.join(', ') || 'neznámá chyba'}`
    );
  }
  if (!productionResult.success) {
    throw new Error(
      `Chyba při zpracování vyroba.csv (${year}): ${productionResult.errors.join(', ') || 'neznámá chyba'}`
    );
  }

  return {
    consumption: consumptionResult.data,
    production: productionResult.data,
    quality: mergeQuality(consumptionResult.quality, productionResult.quality),
  };
}

const SampleDataButton: React.FC<SampleDataButtonProps> = ({
  onLoaded,
  variant = 'outlined',
  size = 'medium',
  sx,
}) => {
  const addData = useEnergyStore((s) => s.addData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Years are loaded one after another — the parse is CPU-bound, so
      // fetching all eight files at once would only hold ~13 MB of buffers
      // longer without finishing any sooner.
      const consumptionBatches: RawDataPoint[][] = [];
      const productionBatches: RawDataPoint[][] = [];
      let combinedQuality = emptyQuality();

      for (const year of SAMPLE_DATA_YEARS) {
        const loaded = await loadSampleYear(year);
        consumptionBatches.push(loaded.consumption);
        productionBatches.push(loaded.production);
        combinedQuality = mergeQuality(combinedQuality, loaded.quality);
      }

      // `flat()`, not `push(...batch)`: spreading 35 000 arguments per year is
      // close enough to the engine's argument limit to be a real risk.
      const consumptionData: RawDataPoint[] = consumptionBatches.flat();
      const productionData: RawDataPoint[] = productionBatches.flat();

      // A single import, so the store recomputes the simulation and the
      // capacity curve once and selects all bundled years together.
      const summary = addData(consumptionData, productionData);

      if (onLoaded) {
        onLoaded(combinedQuality, summary);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Nepodařilo se načíst ukázková data: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addData, onLoaded]);

  return (
    <Stack spacing={1} sx={sx}>
      <Box>
        <Button
          variant={variant}
          color="primary"
          size={size}
          onClick={handleClick}
          disabled={isLoading}
          startIcon={
            isLoading ? <CircularProgress size={16} /> : <PlayArrowIcon />
          }
        >
          Vyzkoušet s ukázkovými daty
        </Button>
      </Box>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Stack>
  );
};

export default SampleDataButton;
