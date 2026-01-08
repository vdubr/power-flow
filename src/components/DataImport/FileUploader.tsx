import React, { useCallback, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { parseCSVFile } from '../../utils/csvParser';
import { useEnergyStore } from '../../store/energyStore';
import { RawDataPoint } from '../../types/energy';

interface FileData {
  id: string;
  fileName: string;
  data: RawDataPoint[];
  dateRange: { start: Date; end: Date } | null;
  recordCount: number;
  year: number | null;
  error: string | null;
}

interface UploadState {
  files: FileData[];
  isLoading: boolean;
  loadingFileName: string | null;
}

const initialUploadState: UploadState = {
  files: [],
  isLoading: false,
  loadingFileName: null,
};

const FileUploader: React.FC = () => {
  const [consumptionState, setConsumptionState] = useState<UploadState>(initialUploadState);
  const [productionState, setProductionState] = useState<UploadState>(initialUploadState);
  
  const { addData, clearData, availableYears } = useEnergyStore();
  
  const getYearFromData = (data: RawDataPoint[]): number | null => {
    if (data.length === 0) return null;
    // Get the most common year in the data
    const years = data.map(d => d.timestamp.getFullYear());
    const yearCounts = years.reduce((acc, year) => {
      acc[year] = (acc[year] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    return Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0] 
      ? parseInt(Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0])
      : null;
  };
  
  const handleFileSelect = useCallback(
    async (
      event: React.ChangeEvent<HTMLInputElement>,
      expectedType: 'consumption' | 'production'
    ) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      
      const setState = expectedType === 'consumption' ? setConsumptionState : setProductionState;
      
      // Process all selected files
      for (const file of Array.from(files)) {
        setState((prev) => ({ 
          ...prev, 
          isLoading: true, 
          loadingFileName: file.name 
        }));
        
        try {
          const result = await parseCSVFile(file);
          
          if (!result.success) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              loadingFileName: null,
              files: [
                ...prev.files,
                {
                  id: crypto.randomUUID(),
                  fileName: file.name,
                  data: [],
                  dateRange: null,
                  recordCount: 0,
                  year: null,
                  error: result.errors.join(', '),
                },
              ],
            }));
            continue;
          }
          
          const year = getYearFromData(result.data);
          let error: string | null = null;
          
          // Check if detected type matches expected type
          if (result.type !== expectedType) {
            error = `Soubor obsahuje data typu "${result.type === 'consumption' ? 'spotřeba' : 'výroba'}", ale očekával se typ "${expectedType === 'consumption' ? 'spotřeba' : 'výroba'}".`;
          } else if (result.errors.length > 0) {
            error = `Některé řádky obsahovaly chyby: ${result.errors.slice(0, 3).join(', ')}${result.errors.length > 3 ? '...' : ''}`;
          }
          
          setState((prev) => ({
            ...prev,
            isLoading: false,
            loadingFileName: null,
            files: [
              ...prev.files,
              {
                id: crypto.randomUUID(),
                fileName: file.name,
                data: result.data,
                dateRange: result.dateRange,
                recordCount: result.recordCount,
                year,
                error,
              },
            ],
          }));
        } catch (err) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            loadingFileName: null,
            files: [
              ...prev.files,
              {
                id: crypto.randomUUID(),
                fileName: file.name,
                data: [],
                dateRange: null,
                recordCount: 0,
                year: null,
                error: `Nepodařilo se zpracovat soubor: ${err}`,
              },
            ],
          }));
        }
      }
      
      // Reset input
      event.target.value = '';
    },
    []
  );
  
  const handleLoadData = useCallback(() => {
    const consumptionData = consumptionState.files.flatMap(f => f.data);
    const productionData = productionState.files.flatMap(f => f.data);
    
    if (consumptionData.length === 0 && productionData.length === 0) {
      return;
    }
    
    addData(consumptionData, productionData);
    
    // Clear staged files after loading
    setConsumptionState(initialUploadState);
    setProductionState(initialUploadState);
  }, [consumptionState.files, productionState.files, addData]);
  
  const handleRemoveFile = useCallback((type: 'consumption' | 'production', fileId: string) => {
    const setState = type === 'consumption' ? setConsumptionState : setProductionState;
    setState((prev) => ({
      ...prev,
      files: prev.files.filter(f => f.id !== fileId),
    }));
  }, []);
  
  const handleClearFiles = useCallback((type: 'consumption' | 'production') => {
    const setState = type === 'consumption' ? setConsumptionState : setProductionState;
    setState(initialUploadState);
  }, []);
  
  const handleClearAll = useCallback(() => {
    setConsumptionState(initialUploadState);
    setProductionState(initialUploadState);
    clearData();
  }, [clearData]);
  
  const formatDateRange = (range: { start: Date; end: Date } | null): string => {
    if (!range) return '';
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
    return `${range.start.toLocaleDateString('cs-CZ', options)} - ${range.end.toLocaleDateString('cs-CZ', options)}`;
  };
  
  const getTotalRecords = (files: FileData[]): number => {
    return files.reduce((sum, f) => sum + f.recordCount, 0);
  };
  
  const getYears = (files: FileData[]): number[] => {
    const years = files.map(f => f.year).filter((y): y is number => y !== null);
    return [...new Set(years)].sort();
  };
  
  const renderFileSection = (
    type: 'consumption' | 'production',
    state: UploadState,
    label: string,
    color: string
  ) => (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        flex: 1,
        minWidth: 280,
        borderTop: `4px solid ${color}`,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle1" fontWeight={600}>
          {label}
        </Typography>
        {state.files.length > 0 && (
          <Button
            size="small"
            color="error"
            onClick={() => handleClearFiles(type)}
            startIcon={<DeleteIcon />}
          >
            Vymazat vše
          </Button>
        )}
      </Stack>
      
      {/* File list */}
      {state.files.length > 0 && (
        <List dense sx={{ mb: 1, bgcolor: 'background.default', borderRadius: 1 }}>
          {state.files.map((file) => (
            <ListItem
              key={file.id}
              sx={{
                borderLeft: file.error && file.data.length === 0 
                  ? '3px solid #f44336' 
                  : file.error 
                    ? '3px solid #ff9800'
                    : '3px solid #4caf50',
                mb: 0.5,
                bgcolor: 'background.paper',
                borderRadius: '0 4px 4px 0',
              }}
            >
              <CheckCircleIcon 
                sx={{ 
                  mr: 1, 
                  fontSize: 18,
                  color: file.error && file.data.length === 0 
                    ? '#f44336' 
                    : file.error 
                      ? '#ff9800'
                      : '#4caf50',
                }} 
              />
              <ListItemText
                primary={
                  <Typography variant="body2" noWrap>
                    {file.fileName}
                  </Typography>
                }
                secondary={
                  <Stack direction="row" spacing={1} flexWrap="wrap" mt={0.5}>
                    {file.year && (
                      <Chip size="small" label={file.year} color="primary" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                    <Chip 
                      size="small" 
                      label={`${file.recordCount.toLocaleString('cs-CZ')} záznamů`} 
                      variant="outlined" 
                      sx={{ height: 20, fontSize: '0.7rem' }} 
                    />
                    {file.error && (
                      <Typography variant="caption" color="warning.main" sx={{ fontSize: '0.65rem' }}>
                        {file.error.length > 50 ? file.error.substring(0, 50) + '...' : file.error}
                      </Typography>
                    )}
                  </Stack>
                }
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => handleRemoveFile(type, file.id)}
                  sx={{ color: 'text.secondary' }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}
      
      {/* Summary */}
      {state.files.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
          <Chip
            size="small"
            label={`Celkem: ${getTotalRecords(state.files).toLocaleString('cs-CZ')} záznamů`}
            color="primary"
          />
          {getYears(state.files).length > 0 && (
            <Chip
              size="small"
              label={`Roky: ${getYears(state.files).join(', ')}`}
              variant="outlined"
            />
          )}
        </Stack>
      )}
      
      {/* Loading indicator */}
      {state.isLoading && (
        <Box display="flex" alignItems="center" py={1} mb={1}>
          <CircularProgress size={20} sx={{ mr: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Načítám {state.loadingFileName}...
          </Typography>
        </Box>
      )}
      
      {/* Upload button */}
      <Box>
        <input
          type="file"
          accept=".csv"
          id={`file-input-${type}`}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e, type)}
        />
        <label htmlFor={`file-input-${type}`}>
          <Button
            variant="outlined"
            component="span"
            fullWidth
            startIcon={state.files.length > 0 ? <AddIcon /> : <CloudUploadIcon />}
            sx={{ py: 1.5 }}
            disabled={state.isLoading}
          >
            {state.files.length > 0 ? 'Přidat další soubory' : 'Vybrat CSV soubory'}
          </Button>
        </label>
        <Typography variant="caption" color="text.secondary" display="block" mt={1}>
          Formát: ČEZ Distribuce - Portál měřených dat. Můžete vybrat více souborů najednou.
        </Typography>
      </Box>
    </Paper>
  );
  
  const hasData = consumptionState.files.some(f => f.data.length > 0) || 
                  productionState.files.some(f => f.data.length > 0);
  const hasLoadedData = availableYears.length > 0;
  const totalNewRecords = getTotalRecords(consumptionState.files) + getTotalRecords(productionState.files);
  
  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Import dat
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Nahrajte CSV soubory ze serveru ČEZ Distribuce (Portál měřených dat).
        Můžete nahrát více souborů pro různé roky - aplikace je automaticky spojí.
      </Typography>
      
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
        {renderFileSection('consumption', consumptionState, 'Spotřeba (+A)', '#ff6b6b')}
        {renderFileSection('production', productionState, 'Výroba (-A)', '#69db7c')}
      </Stack>
      
      <Divider sx={{ my: 2 }} />
      
      <Stack direction="row" spacing={2} justifyContent="flex-end" alignItems="center">
        {hasLoadedData && (
          <Button
            variant="outlined"
            color="error"
            onClick={handleClearAll}
            startIcon={<DeleteIcon />}
          >
            Vymazat všechna data
          </Button>
        )}
        <Button
          variant="contained"
          color="primary"
          onClick={handleLoadData}
          disabled={!hasData}
        >
          Načíst data do aplikace
          {totalNewRecords > 0 && ` (${totalNewRecords.toLocaleString('cs-CZ')} záznamů)`}
        </Button>
      </Stack>
      
      {hasLoadedData && (
        <Alert severity="success" sx={{ mt: 2 }}>
          V aplikaci jsou načtena data pro roky: {availableYears.join(', ')}
        </Alert>
      )}
    </Paper>
  );
};

export default FileUploader;
