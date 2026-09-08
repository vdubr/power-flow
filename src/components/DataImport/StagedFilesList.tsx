import React from 'react';
import {
  Box,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import type { DataQuality, RawDataPoint } from '../../types/energy';
import { formatCount } from '../../utils/format';
import { parseCSVFile } from '../../utils/csvParser';
import { emptyQuality, mergeQuality } from './DataQualityNote';

/**
 * One file the user dropped/picked, waiting for "Načíst data do aplikace".
 * Local to the DataImport UI, not part of the shared data model.
 */
export interface StagedFile {
  id: string;
  fileName: string;
  data: RawDataPoint[];
  type: 'consumption' | 'production' | null;
  year: number | null;
  recordCount: number;
  error: string | null;
  quality: DataQuality;
}

export interface StagedFilesListProps {
  files: StagedFile[];
  onRemove: (fileId: string) => void;
}

/** Which year most of a file's rows fall into (a file can only carry one). */
function dominantYear(data: RawDataPoint[]): number | null {
  if (data.length === 0) return null;
  const counts = new Map<number, number>();
  for (const point of data) {
    const year = point.timestamp.getFullYear();
    counts.set(year, (counts.get(year) || 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [year, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = year;
    }
  }
  return best;
}

/** Parses one uploaded `File` into a {@link StagedFile}, never throwing. */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with the StagedFile shape it produces
export async function parseFileToStagedFile(file: File): Promise<StagedFile> {
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
        error: result.errors.join(', ') || 'Soubor se nepodařilo zpracovat',
        quality: result.quality,
      };
    }

    const error =
      result.errors.length > 0
        ? `Některé řádky obsahovaly chyby: ${result.errors.slice(0, 3).join(', ')}${
            result.errors.length > 3 ? '...' : ''
          }`
        : null;

    return {
      id: crypto.randomUUID(),
      fileName: file.name,
      data: result.data,
      type: result.type,
      year: dominantYear(result.data),
      recordCount: result.recordCount,
      error,
      quality: result.quality,
    };
  } catch (err) {
    return {
      id: crypto.randomUUID(),
      fileName: file.name,
      data: [],
      type: null,
      year: null,
      recordCount: 0,
      error: `Nepodařilo se zpracovat soubor: ${err instanceof Error ? err.message : String(err)}`,
      quality: emptyQuality(),
    };
  }
}

/** Sums the quality of the files that actually contributed rows (i.e. were committed). */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with StagedFile
export function sumCommittedQuality(files: StagedFile[]): DataQuality {
  return files
    .filter((f) => f.data.length > 0)
    .reduce((acc, f) => mergeQuality(acc, f.quality), emptyQuality());
}

/** List of files staged for import, with a per-file remove action. */
const StagedFilesList: React.FC<StagedFilesListProps> = ({ files, onRemove }) => {
  if (files.length === 0) return null;

  return (
    <Box mt={2}>
      <Typography variant="subtitle2" gutterBottom>
        Připravené soubory
      </Typography>
      <List dense sx={{ bgcolor: 'background.default', borderRadius: 1, mb: 2 }}>
        {files.map((file) => {
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
                <ErrorOutlineIcon sx={{ mr: 1, fontSize: 18, color: iconColor }} />
              ) : (
                <CheckCircleIcon sx={{ mr: 1, fontSize: 18, color: iconColor }} />
              )}
              <ListItemText
                primary={
                  <Typography variant="body2" noWrap>
                    {file.fileName}
                  </Typography>
                }
                secondaryTypographyProps={{ component: 'span' }}
                secondary={
                  <Stack component="span" direction="row" spacing={1} flexWrap="wrap" mt={0.5}>
                    {file.type && (
                      <Chip
                        size="small"
                        label={file.type === 'consumption' ? 'spotřeba' : 'výroba'}
                        sx={{
                          height: 20,
                          fontSize: '0.7rem',
                          bgcolor:
                            file.type === 'consumption'
                              ? 'var(--color-destructive)'
                              : 'var(--chart-5)',
                          color:
                            file.type === 'consumption'
                              ? 'var(--color-destructive-foreground)'
                              : 'var(--color-primary-foreground)',
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
                        label={`${formatCount(file.recordCount)} záznamů`}
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
                  aria-label={`Odebrat soubor ${file.fileName}`}
                  onClick={() => onRemove(file.id)}
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
  );
};

export default StagedFilesList;
