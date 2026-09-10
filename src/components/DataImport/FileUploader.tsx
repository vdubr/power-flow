import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Alert,
  AlertTitle,
  Snackbar,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useEnergyStore } from '../../store/energyStore';
import { DataQuality, ImportSummary } from '../../types/energy';
import { formatCount } from '../../utils/format';
import DropZone from './DropZone';
import { parseFileToStagedFile, sumCommittedQuality } from './parsedFile';
import { describeImport } from './importSummaryText';
import { useGlobalDropGuard } from '../../hooks/useGlobalDropGuard';
import YearBadge from './YearBadge';
import LocationChip from './LocationChip';
import DataQualityNote, { emptyQuality, mergeQuality } from './DataQualityNote';

/** ČEZ exports are .csv; some browsers report the MIME type instead. */
function isCsvFile(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv';
}

const FileUploader: React.FC = () => {
  const availableYears = useEnergyStore((s) => s.availableYears);
  const yearlyData = useEnergyStore((s) => s.yearlyData);
  const totalRecords = useEnergyStore((s) => s.allRecords.length);
  const selectedYears = useEnergyStore((s) => s.chartConfig.selectedYears);
  const addData = useEnergyStore((s) => s.addData);
  const clearData = useEnergyStore((s) => s.clearData);
  const removeYear = useEnergyStore((s) => s.removeYear);
  const setSelectedYears = useEnergyStore((s) => s.setSelectedYears);

  const hasLoadedData = availableYears.length > 0;

  const [expanded, setExpanded] = useState<boolean>(!hasLoadedData);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseErrors, setParseErrors] = useState<Array<{ fileName: string; error: string }>>([]);
  /** Confirmation of the last import, shown briefly so it cannot be missed. */
  const [importNotice, setImportNotice] = useState<ImportSummary | null>(null);
  /** A drop landing mid-parse would interleave two batches. */
  const processingRef = useRef(false);
  // Aggregate quality of every batch committed to the store so far, for
  // DataQualityNote. Deliberately local state, not a store field: resets on
  // "Vymazat všechna data", does not try to survive a per-year removal.
  const [importedQuality, setImportedQuality] = useState<DataQuality>(emptyQuality());
  const prevHasLoadedDataRef = useRef(hasLoadedData);

  // Auto-collapse the import bar when transitioning from empty to loaded state
  // (covers SampleDataButton path which bypasses handleLoadData)
  useEffect(() => {
    if (!prevHasLoadedDataRef.current && hasLoadedData) {
      setExpanded(false);
    }
    prevHasLoadedDataRef.current = hasLoadedData;
  }, [hasLoadedData]);

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || processingRef.current) return;

      processingRef.current = true;
      setIsProcessing(true);
      try {
        // Anything that is not a CSV used to be dropped without a word, so a
        // dragged folder looked exactly like a broken app.
        const csvFiles = files.filter(isCsvFile);
        const rejected = files
          .filter((file) => !isCsvFile(file))
          .map((file) => ({
            fileName: file.name,
            error: 'Není soubor CSV. Složky ani jiné formáty načíst nelze.',
          }));

        const parsed = await Promise.all(csvFiles.map(parseFileToStagedFile));
        const successful = parsed.filter((f) => f.data.length > 0);
        const failed = parsed
          .filter((f) => !!f.error && f.data.length === 0)
          .map((f) => ({
            fileName: f.fileName,
            error: f.error || 'Soubor se nepodařilo zpracovat',
          }));

        const consumptionData = successful
          .filter((f) => f.type === 'consumption')
          .flatMap((f) => f.data);
        const productionData = successful
          .filter((f) => f.type === 'production')
          .flatMap((f) => f.data);

        // One path for both states. The old confirmation step in the loaded
        // state sat below the fold, so selecting files appeared to do nothing;
        // addData merges field by field and is idempotent, so there is nothing
        // to protect the user from.
        if (consumptionData.length > 0 || productionData.length > 0) {
          const summary = addData(consumptionData, productionData);
          setImportedQuality((prev) => mergeQuality(prev, sumCommittedQuality(successful)));
          setImportNotice(summary);
          setExpanded(false);
        }

        setParseErrors([...rejected, ...failed]);
      } finally {
        // Without this a thrown parse left the spinner running and the button
        // disabled, with no way back except a reload.
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
    [addData]
  );

  const handleClearAll = useCallback(() => {
    setParseErrors([]);
    clearData();
    setImportedQuality(emptyQuality());
    setImportNotice(null);
    setExpanded(true);
  }, [clearData]);

  // A drop outside the zone — or while the bar is collapsed and the zone is
  // unmounted — would otherwise make the browser open the CSV and discard the
  // in-memory store.
  useGlobalDropGuard(processFiles);

  const handleSampleDataLoaded = useCallback(
    (quality: DataQuality, summary: ImportSummary) => {
      setImportedQuality((prev) => mergeQuality(prev, quality));
      setImportNotice(summary);
    },
    []
  );

  const toggleYear = useCallback(
    (year: number) => {
      const next = selectedYears.includes(year)
        ? selectedYears.filter((y) => y !== year)
        : [...selectedYears, year].sort();
      setSelectedYears(next);
    },
    [selectedYears, setSelectedYears]
  );

  const dropZone = (
    <DropZone
      isProcessing={isProcessing}
      showSampleDataButton={!hasLoadedData}
      onFilesSelected={processFiles}
      onSampleDataLoaded={handleSampleDataLoaded}
    />
  );

  const parseErrorsAlert = parseErrors.length > 0 && (
    <Alert severity="error" role="alert" onClose={() => setParseErrors([])}>
      <AlertTitle>Některé soubory se nepodařilo zpracovat</AlertTitle>
      <List dense disablePadding>
        {parseErrors.map((e, i) => (
          <ListItem key={i} disableGutters sx={{ py: 0 }}>
            <ListItemText
              primary={e.fileName}
              secondary={e.error}
              secondaryTypographyProps={{
                variant: 'caption',
                color: 'text.secondary',
              }}
            />
          </ListItem>
        ))}
      </List>
    </Alert>
  );

  const qualityNote = hasLoadedData && <DataQualityNote quality={importedQuality} />;

  // Empty state
  if (!hasLoadedData) {
    return (
      <Paper className="paper-card fade-up" sx={{ p: 3 }}>
        <Stack spacing={2}>
          {dropZone}
          {parseErrorsAlert}
        </Stack>
      </Paper>
    );
  }

  // Loaded state — compact bar with optional expanded section
  return (
    <Stack spacing={1.5}>
      {parseErrorsAlert}
      <Paper className="paper-card" sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
          <Button
            startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            size="small"
            variant="text"
            onClick={() => setExpanded((v) => !v)}
          >
            Import dat
          </Button>
          <Typography variant="caption" color="text.secondary">
            roky:
          </Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {availableYears.map((year) => {
              const yd = yearlyData.get(year);
              const hasProd = yd?.hasProduction ?? false;
              const hasCons = yd?.hasConsumption ?? false;
              const isActive = selectedYears.includes(year);
              return (
                <YearBadge
                  key={year}
                  year={year}
                  isActive={isActive}
                  hasProd={hasProd}
                  hasCons={hasCons}
                  onToggle={toggleYear}
                  onRemove={removeYear}
                />
              );
            })}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {formatCount(totalRecords)} záznamů
          </Typography>
          {isProcessing && (
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <CircularProgress size={14} aria-hidden />
              <Typography variant="caption" color="text.secondary">
                Zpracovávám soubory…
              </Typography>
            </Stack>
          )}
          <LocationChip />
          <Box sx={{ flex: 1 }} />
          <Button
            startIcon={<AddIcon />}
            variant="outlined"
            size="small"
            onClick={() => setExpanded(true)}
          >
            Nahrát další
          </Button>
        </Stack>
        {qualityNote}
      </Paper>

      <Collapse in={expanded} unmountOnExit>
        <Paper className="paper-card fade-up" sx={{ p: 3 }}>
          {dropZone}

          <Stack direction="row" spacing={2} justifyContent="flex-end" mt={2} flexWrap="wrap">
            <Button
              variant="outlined"
              color="error"
              onClick={handleClearAll}
              startIcon={<DeleteIcon />}
            >
              Vymazat všechna data
            </Button>
          </Stack>
        </Paper>
      </Collapse>

      <Snackbar
        open={importNotice !== null}
        autoHideDuration={8000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setImportNotice(null);
        }}
      >
        <Alert severity="success" role="status" onClose={() => setImportNotice(null)}>
          {importNotice ? describeImport(importNotice) : ''}
        </Alert>
      </Snackbar>
    </Stack>
  );
};

export default FileUploader;
