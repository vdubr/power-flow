/**
 * Pure, testable math for custom wheel zoom/pan on ECharts dataZoom.
 *
 * All "percent" values are in the ECharts dataZoom space: 0–100.
 */

interface ZoomRange {
  start: number;
  end: number;
}

interface ZoomOpts {
  /** Zoom fraction per notch (default 0.1 = 10 %) */
  zoomPerNotch?: number;
  /** Minimum allowed span in percent (default 0.5) */
  minSpan?: number;
}

interface PanOpts {
  /** Pan fraction of current span per 100 px deltaY (default 0.1 = 10 %) */
  panPerNotch?: number;
}

/** Clamp a value between lo and hi (inclusive). */
function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Normalise deltaY from a WheelEvent to a "notch count" in [-3, 3].
 * macOS momentum scrolling can deliver deltaY values in the hundreds per
 * event; dividing by 100 and clamping keeps the step bounded.
 */
function deltaToNotches(deltaY: number): number {
  return clamp(deltaY / 100, -3, 3);
}

/**
 * Compute a new dataZoom range after a wheel zoom event.
 *
 * @param current   Current {start, end} in ECharts percent space (0–100).
 * @param anchorPercent  The data-axis position of the cursor (0–100), used as
 *                       the fixed point around which to zoom.
 * @param deltaY    Raw WheelEvent.deltaY (positive = scroll down = zoom out).
 * @param opts      Optional tuning parameters.
 * @returns New {start, end}, or null when the change is negligible (< 0.01 %).
 */
export function computeWheelZoomRange(
  current: ZoomRange,
  anchorPercent: number,
  deltaY: number,
  opts?: ZoomOpts,
): ZoomRange | null {
  const zoomPerNotch = opts?.zoomPerNotch ?? 0.1;
  const minSpan = opts?.minSpan ?? 0.5;

  const notches = deltaToNotches(deltaY);
  // factor > 1 → zoom out (larger span); factor < 1 → zoom in (smaller span)
  const factor = Math.pow(1 + zoomPerNotch, notches);

  const span = current.end - current.start;
  const newSpan = span * factor;

  // Preserve the relative position of the anchor within the current span so
  // the data point under the cursor stays fixed.
  const anchorRatio =
    span === 0 ? 0.5 : (anchorPercent - current.start) / span;

  let newStart = anchorPercent - anchorRatio * newSpan;
  let newEnd = anchorPercent + (1 - anchorRatio) * newSpan;

  // Clamp to [0, 100] while preserving span where possible.
  if (newStart < 0) {
    newEnd = Math.min(100, newEnd - newStart);
    newStart = 0;
  }
  if (newEnd > 100) {
    newStart = Math.max(0, newStart - (newEnd - 100));
    newEnd = 100;
  }

  // Enforce minimum span.
  const clampedSpan = newEnd - newStart;
  if (clampedSpan < minSpan) {
    // Keep anchor position, expand to minSpan.
    const ratio = span === 0 ? 0.5 : (anchorPercent - current.start) / span;
    newStart = anchorPercent - ratio * minSpan;
    newEnd = anchorPercent + (1 - ratio) * minSpan;

    // Re-clamp after adjustment.
    if (newStart < 0) {
      newEnd = Math.min(100, newEnd - newStart);
      newStart = 0;
    }
    if (newEnd > 100) {
      newStart = Math.max(0, newStart - (newEnd - 100));
      newEnd = 100;
    }
  }

  // No-op guard: ignore changes smaller than 0.01 %.
  if (Math.abs(newStart - current.start) < 0.01 && Math.abs(newEnd - current.end) < 0.01) {
    return null;
  }

  return { start: newStart, end: newEnd };
}

/**
 * Compute a new dataZoom range after a Shift+wheel pan event.
 *
 * The span (zoom level) is kept constant; only the window shifts.
 *
 * @param current   Current {start, end} in ECharts percent space (0–100).
 * @param deltaY    Raw WheelEvent.deltaY (positive = scroll down = pan right).
 * @param opts      Optional tuning parameters.
 * @returns New {start, end}, or null when the change is negligible (< 0.01 %).
 */
export function computeWheelPanRange(
  current: ZoomRange,
  deltaY: number,
  opts?: PanOpts,
): ZoomRange | null {
  const panPerNotch = opts?.panPerNotch ?? 0.1;

  const notches = deltaToNotches(deltaY);
  const span = current.end - current.start;
  const shift = span * panPerNotch * notches;

  let newStart = current.start + shift;
  let newEnd = current.end + shift;

  // Clamp while preserving span.
  if (newStart < 0) {
    newStart = 0;
    newEnd = span;
  }
  if (newEnd > 100) {
    newEnd = 100;
    newStart = 100 - span;
  }

  if (Math.abs(newStart - current.start) < 0.01 && Math.abs(newEnd - current.end) < 0.01) {
    return null;
  }

  return { start: newStart, end: newEnd };
}
