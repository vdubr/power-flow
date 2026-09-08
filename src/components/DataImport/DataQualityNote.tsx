import React from 'react';
import { Stack, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { DataQuality } from '../../types/energy';
import { formatCount, formatPercent } from '../../utils/format';

export interface DataQualityNoteProps {
  quality: DataQuality;
}

/** Neutral element for {@link mergeQuality} / the initial state of an accumulator. */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with DataQualityNote
export const emptyQuality = (): DataQuality => ({
  totalRows: 0,
  validRows: 0,
  invalidStatusRows: 0,
  rejectedRows: 0,
});

/** Combines the quality of two batches (e.g. two files, or a running total plus a new import). */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with DataQualityNote
export const mergeQuality = (a: DataQuality, b: DataQuality): DataQuality => ({
  totalRows: a.totalRows + b.totalRows,
  validRows: a.validRows + b.validRows,
  invalidStatusRows: a.invalidStatusRows + b.invalidStatusRows,
  rejectedRows: a.rejectedRows + b.rejectedRows,
});

/**
 * Unobtrusive note about how much of the currently loaded data is trustworthy.
 *
 * ČEZ marks some intervals as "neplatná data" / "neznámá hodnota" in the
 * Status column; those rows are kept (so the day stays time-complete) but are
 * effectively summed as zero. Rows whose date or value could not be parsed at
 * all are dropped entirely and never reach the store. Without this note the
 * user has no way to know either happened — the chart and KPIs look no
 * different from a fully clean import.
 *
 * Renders nothing when the data has no quality issues to report.
 */
const DataQualityNote: React.FC<DataQualityNoteProps> = ({ quality }) => {
  const { totalRows, invalidStatusRows, rejectedRows } = quality;

  if (invalidStatusRows <= 0 && rejectedRows <= 0) return null;

  const invalidPercent = totalRows > 0 ? (invalidStatusRows / totalRows) * 100 : 0;

  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ px: 0.5, py: 0.5 }}>
      <InfoOutlinedIcon
        aria-hidden="true"
        fontSize="small"
        sx={{ color: 'var(--color-muted-foreground)', mt: '2px', flexShrink: 0 }}
      />
      <Typography variant="caption" color="text.secondary">
        {invalidStatusRows > 0 && (
          <>
            {formatCount(invalidStatusRows)} z {formatCount(totalRows)} intervalů (
            {formatPercent(invalidPercent)}) nemá platné měření – ČEZ je označil jako
            neplatná nebo neznámá data. Součty je berou jako nulu.
          </>
        )}
        {invalidStatusRows > 0 && rejectedRows > 0 && ' '}
        {rejectedRows > 0 && (
          <>
            {formatCount(rejectedRows)} {rejectedRows === 1 ? 'řádek se' : 'řádků se'} nepodařilo
            načíst (neplatné datum nebo hodnota) a byly ze součtů vynechány.
          </>
        )}
      </Typography>
    </Stack>
  );
};

export default DataQualityNote;
