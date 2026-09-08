import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Stack,
  Collapse,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  AlertTitle,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { parseCSVFile } from '../../utils/csvParser';
import { useEnergyStore } from '../../store/energyStore';
import { RawDataPoint } from '../../types/energy';
import SampleDataButton from './SampleDataButton';

interface StagedFile {
  id: string;
  fileName: string;
  data: RawDataPoint[];
  type: 'consumption' | 'production' | null;
  year: number | null;
  recordCount: number;
  error: string | null;
}

const getYearFromData = (data: RawDataPoint[]): number | null => {
  if (data.length === 0) return null;
  const yearCounts = new Map<number, number>();
  for (const point of data) {
    const year = point.timestamp.getFullYear();
    yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
  }
  let maxYear: number | null = null;
  let maxCount = 0;
  for (const [year, count] of yearCounts) {
    if (count > maxCount) {
      maxCount = count;
      maxYear = year;
    }
  }
  return maxYear;
};

interface YearBadgeProps {
  year: number;
  isActive: boolean;
  hasProd: boolean;
  hasCons: boolean;
  onToggle: (year: number) => void;
  onRemove: (year: number) => void;
}

const YearBadge: React.FC<YearBadgeProps> = ({
  year,
  isActive,
  hasProd,
  hasCons,
  onToggle,
  onRemove,
}) => {
  return (
    <Chip
      label={
        <Box
          component="span"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>
            {year}
          </Box>
          <Box
            component="span"
            sx={{ display: 'inline-flex', gap: 0.5 }}
          >
            <Box
              component="span"
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: hasProd
                  ? 'var(--chart-5)'
                  : 'var(--color-muted-foreground)',
                opacity: hasProd ? 1 : 0.25,
              }}
            />
            <Box
              component="span"
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: hasCons
                  ? 'var(--color-destructive)'
                  : 'var(--color-muted-foreground)',
                opacity: hasCons ? 1 : 0.25,
              }}
            />
          </Box>
        </Box>
      }
      onClick={() => onToggle(year)}
      onDelete={() => onRemove(year)}
      variant={isActive ? 'filled' : 'outlined'}
      color={isActive ? 'primary' : 'default'}
      size="small"
      sx={{
        opacity: isActive ? 1 : 0.4,
        transition: 'opacity .15s',
        cursor: 'pointer',
        '& .MuiChip-deleteIcon': {
          opacity: 0,
          transition: 'opacity .15s',
        },
        '&:hover': { opacity: 1 },
        '&:hover .MuiChip-deleteIcon': { opacity: 1 },
      }}
    />
  );
};

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
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ fileName: string; error: string }>>([]);
  const dragCounter = useRef(0);
  const prevHasLoadedDataRef = useRef(hasLoadedData);

  // Auto-collapse the import bar when transitioning from empty to loaded state
  // (covers SampleDataButton path which bypasses handleLoadData)
  useEffect(() => {
    if (!prevHasLoadedDataRef.current && hasLoadedData) {
      setExpanded(false);
    }
    prevHasLoadedDataRef.current = hasLoadedData;
  }, [hasLoadedData]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalNewRecords = useMemo(
    () => stagedFiles.reduce((sum, f) => sum + f.recordCount, 0),
    [stagedFiles]
  );

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsProcessing(true);

      const newStaged: StagedFile[] = await Promise.all(
        files.map(async (file) => {
          try {
            const result = await parseCSVFile(file);

            if (!result.success) {
              return {
                id: crypto.randomUUID(),
                fileName: file.name,
                data: [],
                type: null,
                year: null,
                recordCount: 0,
                error:
                  result.errors.join(', ') || 'Soubor se nepodařilo zpracovat',
              } satisfies StagedFile;
            }

            const year = getYearFromData(result.data);
            const error =
              result.errors.length > 0
                ? `Některé řádky obsahovaly chyby: ${result.errors
                    .slice(0, 3)
                    .join(', ')}${result.errors.length > 3 ? '...' : ''}`
                : null;

            return {
              id: crypto.randomUUID(),
              fileName: file.name,
              data: result.data,
              type: result.type,
              year,
              recordCount: result.recordCount,
              error,
            } satisfies StagedFile;
          } catch (err) {
            return {
              id: crypto.randomUUID(),
              fileName: file.name,
              data: [],
              type: null,
              year: null,
              recordCount: 0,
              error: `Nepodařilo se zpracovat soubor: ${
                err instanceof Error ? err.message : String(err)
              }`,
            } satisfies StagedFile;
          }
        })
      );

      const successful = newStaged.filter((f) => f.data.length > 0);
      const failed = newStaged.filter(
        (f) => !!f.error && f.data.length === 0
      );

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

  const handleFileInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      await processFiles(Array.from(files));
      event.target.value = '';
    },
    [processFiles]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith('.csv')
      );
      if (droppedFiles.length === 0) return;
      await processFiles(droppedFiles);
    },
    [processFiles]
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
    setStagedFiles([]);
    setParseErrors([]);
    setExpanded(false);
  }, [stagedFiles, addData]);

  const handleClearAll = useCallback(() => {
    setStagedFiles([]);
    setParseErrors([]);
    clearData();
    setExpanded(true);
  }, [clearData]);

  const toggleYear = useCallback(
    (year: number) => {
      const next = selectedYears.includes(year)
        ? selectedYears.filter((y) => y !== year)
        : [...selectedYears, year].sort();
      setSelectedYears(next);
    },
    [selectedYears, setSelectedYears]
  );

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const dropZone = (
    <Box
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        border: '2px dashed',
        borderColor: isDragging
          ? 'var(--color-primary)'
          : 'var(--color-border)',
        borderRadius: 3,
        p: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 2,
        bgcolor: isDragging
          ? 'rgba(217, 138, 43, 0.08)'
          : 'transparent',
        transition: 'all .2s ease',
      }}
    >
      <CloudUploadIcon
        sx={{
          fontSize: 56,
          color: isDragging
            ? 'var(--color-primary)'
            : 'var(--color-muted-foreground)',
          transition: 'color .2s ease',
        }}
      />
      <Typography
        variant="h5"
        sx={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          letterSpacing: '-0.01em',
        }}
      >
        Přetáhněte sem CSV z ČEZ Distribuce
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
        Více souborů (různé roky) najednou — automaticky se spojí · Spotřeba
        (+A) i Výroba (−A)
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={1}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={openFileDialog}
          disabled={isProcessing}
        >
          Vybrat soubory
        </Button>
        {!hasLoadedData && <SampleDataButton variant="outlined" />}
      </Stack>
      {isProcessing && (
        <Box display="flex" alignItems="center" gap={1} mt={1}>
          <CircularProgress size={18} />
          <Typography variant="caption" color="text.secondary">
            Zpracovávám soubory...
          </Typography>
        </Box>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
    </Box>
  );

  const parseErrorsAlert = parseErrors.length > 0 && (
    <Alert severity="error" onClose={() => setParseErrors([])}>
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
        <Stack
          direction="row"
          alignItems="center"
          gap={2}
          flexWrap="wrap"
        >
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
            {totalRecords.toLocaleString('cs-CZ')} záznamů
          </Typography>
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
      </Paper>

      <Collapse in={expanded} unmountOnExit>
        <Paper className="paper-card fade-up" sx={{ p: 3 }}>
          {dropZone}

          {stagedFiles.length > 0 && (
            <Box mt={2}>
              <Typography variant="subtitle2" gutterBottom>
                Připravené soubory
              </Typography>
              <List
                dense
                sx={{
                  bgcolor: 'background.default',
                  borderRadius: 1,
                  mb: 2,
                }}
              >
                {stagedFiles.map((file) => {
                  const isError = !!file.error && file.data.length === 0;
                  const iconColor = isError
                    ? 'var(--color-destructive)'
                    : file.error
                      ? 'var(--color-primary)'
                      : 'var(--chart-5)';
                  return (
                    <ListItem
                      key={file.id}
                      sx={{
                        borderLeft: `3px solid ${iconColor}`,
                        mb: 0.5,
                        bgcolor: 'background.paper',
                        borderRadius: '0 4px 4px 0',
                      }}
                    >
                      {isError ? (
                        <ErrorOutlineIcon
                          sx={{ mr: 1, fontSize: 18, color: iconColor }}
                        />
                      ) : (
                        <CheckCircleIcon
                          sx={{ mr: 1, fontSize: 18, color: iconColor }}
                        />
                      )}
                      <ListItemText
                        primary={
                          <Typography variant="body2" noWrap>
                            {file.fileName}
                          </Typography>
                        }
                        secondaryTypographyProps={{ component: 'span' }}
                        secondary={
                          <Stack
                            component="span"
                            direction="row"
                            spacing={1}
                            flexWrap="wrap"
                            mt={0.5}
                          >
                            {file.type && (
                              <Chip
                                size="small"
                                label={
                                  file.type === 'consumption'
                                    ? 'spotřeba'
                                    : 'výroba'
                                }
                                sx={{
                                  height: 20,
                                  fontSize: '0.7rem',
                                  bgcolor:
                                    file.type === 'consumption'
                                      ? 'var(--color-destructive)'
                                      : 'var(--chart-5)',
                                  color: '#fff',
                                }}
                              />
                            )}
                            {file.year && (
                              <Chip
                                size="small"
                                label={file.year}
                                color="primary"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                            {file.recordCount > 0 && (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={`${file.recordCount.toLocaleString(
                                  'cs-CZ'
                                )} záznamů`}
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                            {file.error && (
                              <Typography
                                component="span"
                                variant="caption"
                                color={isError ? 'error.main' : 'warning.main'}
                                sx={{ fontSize: '0.65rem' }}
                              >
                                {file.error.length > 60
                                  ? file.error.substring(0, 60) + '...'
                                  : file.error}
                              </Typography>
                            )}
                          </Stack>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleRemoveStagedFile(file.id)}
                          sx={{ color: 'text.secondary' }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  );
                })}
              </List>
            </Box>
          )}

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
              disabled={
                stagedFiles.length === 0 ||
                stagedFiles.every((f) => f.data.length === 0)
              }
            >
              Načíst data do aplikace
              {totalNewRecords > 0 &&
                ` (${totalNewRecords.toLocaleString('cs-CZ')} záznamů)`}
            </Button>
          </Stack>
        </Paper>
      </Collapse>
    </Stack>
  );
};

export default FileUploader;
