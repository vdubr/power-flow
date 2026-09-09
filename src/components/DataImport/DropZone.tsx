import React, { useCallback, useRef, useState } from 'react';
import { Box, Typography, Button, Stack, CircularProgress } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AddIcon from '@mui/icons-material/Add';
import type { DataQuality, ImportSummary } from '../../types/energy';
import SampleDataButton from './SampleDataButton';

const HEADING_ID = 'data-import-dropzone-heading';

export interface DropZoneProps {
  isProcessing: boolean;
  /** Only offered before any data is loaded, same as before this was extracted. */
  showSampleDataButton: boolean;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  onSampleDataLoaded?: (quality: DataQuality, summary: ImportSummary) => void;
}

/**
 * Drag & drop surface plus the "Vybrat soubory" / sample-data fallback.
 *
 * Owns the hidden file input and drag counter so `FileUploader` does not have
 * to.
 *
 * The surface itself is only a labelled group, not a button: it contains real
 * buttons, and nesting interactive elements hides them from assistive
 * technology (axe rule `nested-interactive`). Dragging is a pointer gesture,
 * and the keyboard path to the same result is the "Vybrat soubory" button
 * inside (A2).
 */
const DropZone: React.FC<DropZoneProps> = ({
  isProcessing,
  showSampleDataButton,
  onFilesSelected,
  onSampleDataLoaded,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      // Reset before awaiting: if parsing throws, the input would keep the old
      // value and picking the same files again would fire no change event.
      event.target.value = '';
      if (files.length === 0) return;
      await onFilesSelected(files);
    },
    [onFilesSelected]
  );

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current += 1;
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      // Everything is handed over, including non-CSV files: silently dropping
      // them looked exactly like a broken app, so the importer reports them.
      const droppedFiles = Array.from(event.dataTransfer.files);
      if (droppedFiles.length === 0) return;
      await onFilesSelected(droppedFiles);
    },
    [onFilesSelected]
  );

  return (
    <Box
      role="group"
      aria-label="Nahrání CSV souborů z ČEZ Distribuce"
      onClick={openFileDialog}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        border: '2px dashed',
        borderColor: isDragging ? 'var(--color-primary)' : 'var(--color-border)',
        borderRadius: 3,
        p: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 2,
        cursor: 'pointer',
        bgcolor: isDragging ? 'color-mix(in oklab, var(--color-primary) 8%, transparent)' : 'transparent',
        transition: 'all .2s ease',
        '&:focus-visible': {
          outline: '3px solid var(--color-ring)',
          outlineOffset: 2,
        },
      }}
    >
      <CloudUploadIcon
        sx={{
          fontSize: 56,
          color: isDragging ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
          transition: 'color .2s ease',
        }}
      />
      <Typography
        id={HEADING_ID}
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
        Více souborů (různé roky) najednou — automaticky se spojí · Spotřeba (+A) i Výroba
        (−A)
      </Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        mt={1}
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={openFileDialog}
          disabled={isProcessing}
        >
          Vybrat soubory
        </Button>
        {showSampleDataButton && (
          <SampleDataButton variant="outlined" onLoaded={onSampleDataLoaded} />
        )}
      </Stack>
      {isProcessing && (
        <Box
          display="flex"
          alignItems="center"
          gap={1}
          mt={1}
          onClick={(event) => event.stopPropagation()}
        >
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
        aria-labelledby={HEADING_ID}
        aria-label="Vybrat CSV soubory z ČEZ Distribuce"
        style={{ display: 'none' }}
        onClick={(event) => event.stopPropagation()}
        onChange={handleFileInputChange}
      />
    </Box>
  );
};

export default DropZone;
