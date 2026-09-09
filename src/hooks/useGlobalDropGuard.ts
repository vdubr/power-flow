import { useEffect, useRef } from 'react';

/**
 * Stops a stray file drop from navigating the tab away.
 *
 * The drop zone is only part of the page, and it is unmounted entirely while
 * the import bar is collapsed. A drop anywhere else hit the browser default:
 * it opened the CSV in the tab and the in-memory store was gone. Guarding at
 * the window means a drop is never destructive, and files still reach the
 * importer wherever they land.
 */
export function useGlobalDropGuard(onFiles?: (files: File[]) => void | Promise<void>): void {
  const onFilesRef = useRef(onFiles);

  // Assigning during render is not allowed; an effect keeps the ref current so
  // the window listeners are attached once and still call the latest handler.
  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) void onFilesRef.current?.(files);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);
}
