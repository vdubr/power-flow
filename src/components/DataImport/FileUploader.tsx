import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Stack,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Alert,
  AlertTitle,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { useEnergyStore } from '../../store/energyStore';
import { DataQuality } from '../../types/energy';
import { getDefaultLocation } from '../../utils/sunCalculations';
import { formatCount } from '../../utils/format';
import DropZone from './DropZone';
import StagedFilesList, {
  StagedFile,
  parseFileToStagedFile,
  sumCommittedQuality,
} from './StagedFilesList';
import YearBadge from './YearBadge';
import DataQualityNote, { emptyQuality, mergeQuality } from './DataQualityNote';

const FileUploader: React.FC = () => {
  const availableYears = useEnergyStore((s) => s.availableYears);
  const yearlyData = useEnergyStore((s) => s.yearlyData);
  const totalRecords = useEnergyStore((s) => s.allRecords.length);
  const selectedYears = useEnergyStore((s) => s.chartConfig.selectedYears);
  const location = useEnergyStore((s) => s.chartConfig.dayNightConfig.location);
  const addData = useEnergyStore((s) => s.addData);
  const clearData = useEnergyStore((s) => s.clearData);
  const removeYear = useEnergyStore((s) => s.removeYear);
  const setSelectedYears = useEnergyStore((s) => s.setSelectedYears);

  const hasLoadedData = availableYears.length > 0;
  const locationName = location?.name ?? getDefaultLocation().name;

  const [expanded, setExpanded] = useState<boolean>(!hasLoadedData);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ fileName: string; error: string }>>([]);
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

  const totalNewRecords = useMemo(
    () => stagedFiles.reduce((sum, f) => sum + f.recordCount, 0),
    [stagedFiles]
  );

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsProcessing(true);

      const newStaged: StagedFile[] = await Promise.all(files.map(parseFileToStagedFile));

      const successful = newStaged.filter((f) => f.data.length > 0);
      const failed = newStaged.filter((f) => !!f.error && f.data.length === 0);

      if (!hasLoadedData) {
        // Empty state: auto-commit successful files and surface failures via Alert
        const consumptionData = successful
          .filter((f) => f.type === 'consumption')
          .flatMap((f) => f.data);
        const productionData = successful
          .filter((f) => f.type === 'production')
          .flatMap((f) => f.data);

        if (consumptionData.length > 0 || productionData.length > 0) {
          addData(consumptionData, productionData);
          setImportedQuality((prev) => mergeQuality(prev, sumCommittedQuality(successful)));
        }

        setParseErrors(
          failed.map((f) => ({
            fileName: f.fileName,
            error: f.error || 'Soubor se nepodařilo zpracovat',
          }))
        );
      } else {
        // Loaded state: keep explicit "Načíst data" step
        setStagedFiles((prev) => [...prev, ...newStaged]);
      }

      setIsProcessing(false);
    },
    [hasLoadedData, addData]
  );

  const handleRemoveStagedFile = useCallback((fileId: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleLoadData = useCallback(() => {
    const consumptionData = stagedFiles
      .filter((f) => f.type === 'consumption')
      .flatMap((f) => f.data);
    const productionData = stagedFiles
      .filter((f) => f.type === 'production')
      .flatMap((f) => f.data);

    if (consumptionData.length === 0 && productionData.length === 0) {
      return;
    }

    addData(consumptionData, productionData);
    setImportedQuality((prev) => mergeQuality(prev, sumCommittedQuality(stagedFiles)));
    setStagedFiles([]);
    setParseErrors([]);
    setExpanded(false);
  }, [stagedFiles, addData]);

  const handleClearAll = useCallback(() => {
    setStagedFiles([]);
    setParseErrors([]);
    clearData();
    setImportedQuality(emptyQuality());
    setExpanded(true);
  }, [clearData]);

  const handleSampleDataLoaded = useCallback((quality: DataQuality) => {
    setImportedQuality((prev) => mergeQuality(prev, quality));
  }, []);

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
          <Chip
            icon={<LocationOnIcon fontSize="small" />}
            label={locationName}
            variant="outlined"
            size="small"
          />
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

          <StagedFilesList files={stagedFiles} onRemove={handleRemoveStagedFile} />

          <Stack
            direction="row"
            spacing={2}
            justifyContent="flex-end"
            alignItems="center"
            mt={2}
            flexWrap="wrap"
          >
            <Button
              variant="outlined"
              color="error"
              onClick={handleClearAll}
              startIcon={<DeleteIcon />}
            >
              Vymazat všechna data
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleLoadData}
              disabled={stagedFiles.length === 0 || stagedFiles.every((f) => f.data.length === 0)}
            >
              Načíst data do aplikace
              {totalNewRecords > 0 && ` (${formatCount(totalNewRecords)} záznamů)`}
            </Button>
          </Stack>
        </Paper>
      </Collapse>
    </Stack>
  );
};

export default FileUploader;
