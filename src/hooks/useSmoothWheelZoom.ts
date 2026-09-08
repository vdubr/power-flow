import { useEffect, useRef, RefObject } from 'react';
import type ReactECharts from 'echarts-for-react';
import { computeWheelZoomRange, computeWheelPanRange } from '../utils/zoomMath';

/**
 * Minimal subset of the ECharts instance API that we actually use.
 * echarts-for-react exposes `getEchartsInstance()` which returns the raw
 * ECharts instance typed as `echarts.ECharts`.  We avoid importing echarts
 * types directly to keep the dependency surface small, so we describe only
 * what we need here.
 */
interface EChartsInstanceLike {
  isDisposed(): boolean;
  containPixel(finder: { gridIndex: number }, pixel: [number, number]): boolean;
  getOption(): Record<string, unknown>;
  dispatchAction(payload: {
    type: string;
    dataZoomIndex: number;
    start: number;
    end: number;
  }): void;
  getModel(): unknown;
}

/**
 * Shape of the private coordinate system rect that ECharts exposes via the
 * component model.  We obtain this through an internal path that may not be
 * present in all builds, so every access is wrapped in try/catch.
 */
interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Type-narrowing helper for the dataZoom option array entry. */
interface DataZoomItem {
  start?: number;
  end?: number;
}

/** Extract current dataZoom start/end from the raw option object. */
function readDataZoomRange(
  instance: EChartsInstanceLike,
): { start: number; end: number } | null {
  const option = instance.getOption();
  const dzArray = option['dataZoom'];
  if (!Array.isArray(dzArray) || dzArray.length === 0) return null;

  const first = dzArray[0] as DataZoomItem;
  const start = typeof first.start === 'number' ? first.start : 0;
  const end = typeof first.end === 'number' ? first.end : 100;
  return { start, end };
}

/**
 * Try to read the pixel width of the ECharts grid area so we can map the
 * cursor's x offset to a data-axis percent.  Falls back to the container's
 * bounding rect if the internal API is unavailable.
 */
function readGridRect(
  instance: EChartsInstanceLike,
  container: HTMLElement,
): GridRect {
  try {
    // Internal (unsupported) path: instance.getModel().getComponent(...)
    const model = instance.getModel() as {
      getComponent?: (
        name: string,
        index: number,
      ) => {
        coordinateSystem?: {
          getRect?: () => GridRect;
        };
      };
    };

    const gridComponent = model.getComponent?.('grid', 0);
    const rect = gridComponent?.coordinateSystem?.getRect?.();
    if (
      rect &&
      typeof rect.x === 'number' &&
      typeof rect.width === 'number' &&
      rect.width > 0
    ) {
      return rect;
    }
  } catch {
    // Internal API unavailable — use fallback below.
  }

  const bbox = container.getBoundingClientRect();
  return { x: 0, y: 0, width: bbox.width, height: bbox.height };
}

/**
 * useSmoothWheelZoom
 *
 * Attaches a non-passive wheel listener to the returned container ref so that
 * the browser's default scroll is suppressed only when the cursor is over the
 * ECharts grid area.  Zoom step is ~10 % per notch, anchored on the cursor
 * position.  Shift+wheel pans instead of zooming.
 *
 * Usage:
 *   const chartRef = useRef<ReactECharts>(null);
 *   const boxRef = useSmoothWheelZoom(chartRef);
 *   return <Box ref={boxRef}><ReactECharts ref={chartRef} ... /></Box>;
 */
export function useSmoothWheelZoom(
  chartRef: RefObject<ReactECharts | null>,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleWheel(e: WheelEvent): void {
      // Read the ECharts instance fresh on every event to avoid stale closures.
      const instance = chartRef.current?.getEchartsInstance() as
        | EChartsInstanceLike
        | undefined;
      if (!instance || instance.isDisposed()) return;

      const { offsetX } = e;

      // Only intercept events where the cursor is actually over the data grid.
      if (!instance.containPixel({ gridIndex: 0 }, [offsetX, e.offsetY])) {
        return; // Let the page scroll normally.
      }

      e.preventDefault();
      e.stopPropagation();

      const current = readDataZoomRange(instance);
      if (!current) return;

      if (e.shiftKey) {
        // Shift+wheel → pan
        const next = computeWheelPanRange(current, e.deltaY);
        if (next) {
          instance.dispatchAction({
            type: 'dataZoom',
            dataZoomIndex: 0,
            start: next.start,
            end: next.end,
          });
        }
      } else {
        // Plain wheel → zoom anchored on cursor
        const gridRect = container ? readGridRect(instance, container) : null;

        let anchorPercent: number;
        if (gridRect && gridRect.width > 0) {
          const relX = offsetX - gridRect.x;
          anchorPercent =
            current.start +
            (relX / gridRect.width) * (current.end - current.start);
        } else {
          // Fallback: anchor at viewport center of the current range.
          anchorPercent = (current.start + current.end) / 2;
        }

        const next = computeWheelZoomRange(current, anchorPercent, e.deltaY);
        if (next) {
          instance.dispatchAction({
            type: 'dataZoom',
            dataZoomIndex: 0,
            start: next.start,
            end: next.end,
          });
        }
      }
    }

    container.addEventListener('wheel', handleWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
    };
    // chartRef is a stable ref object — no value dependency needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return containerRef;
}
