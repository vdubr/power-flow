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
import { DataQuality, ImportSummary, RawDataPoint } from '../../types/energy';

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
      const [consumptionFile, productionFile] = await Promise.all([
        fetchAsFile('/sample-data/2022/spotreba.csv', 'spotreba.csv'),
        fetchAsFile('/sample-data/2022/vyroba.csv', 'vyroba.csv'),
      ]);

      const [consumptionResult, productionResult] = await Promise.all([
        parseCSVFile(consumptionFile),
        parseCSVFile(productionFile),
      ]);

      if (!consumptionResult.success) {
        throw new Error(
          `Chyba při zpracování spotreba.csv: ${consumptionResult.errors.join(', ') || 'neznámá chyba'}`
        );
      }
      if (!productionResult.success) {
        throw new Error(
          `Chyba při zpracování vyroba.csv: ${productionResult.errors.join(', ') || 'neznámá chyba'}`
        );
      }

      const consumptionData: RawDataPoint[] = consumptionResult.data;
      const productionData: RawDataPoint[] = productionResult.data;

      const summary = addData(consumptionData, productionData);

      if (onLoaded) {
        const combinedQuality: DataQuality = {
          totalRows: consumptionResult.quality.totalRows + productionResult.quality.totalRows,
          validRows: consumptionResult.quality.validRows + productionResult.quality.validRows,
          invalidStatusRows:
            consumptionResult.quality.invalidStatusRows + productionResult.quality.invalidStatusRows,
          rejectedRows:
            consumptionResult.quality.rejectedRows + productionResult.quality.rejectedRows,
        };
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
