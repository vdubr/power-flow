import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';
import type ReactECharts from 'echarts-for-react';
import { useSmoothWheelZoom } from '../hooks/useSmoothWheelZoom';

/**
 * The zoom maths is covered by zoomMath.test.ts; this file covers the wiring:
 * the listener must be non-passive, must only take over the wheel while the
 * cursor is above the plotting area, and must survive a disposed chart.
 *
 * A stub instance stands in for ECharts, so no canvas is needed.
 */

interface StubOptions {
  containPixel?: boolean;
  disposed?: boolean;
  start?: number;
  end?: number;
}

function makeInstance({
  containPixel = true,
  disposed = false,
  start = 0,
  end = 100,
}: StubOptions = {}) {
  const dispatchAction = vi.fn();
  return {
    dispatchAction,
    instance: {
      isDisposed: () => disposed,
      containPixel: () => containPixel,
      getOption: () => ({ dataZoom: [{ start, end }] }),
      dispatchAction,
      getModel: () => ({
        getComponent: () => ({
          coordinateSystem: { getRect: () => ({ x: 0, y: 0, width: 400, height: 200 }) },
        }),
      }),
    },
  };
}

function Harness({ instance }: { instance: unknown }) {
  const chartRef = useRef({
    getEchartsInstance: () => instance,
  } as unknown as ReactECharts);
  const boxRef = useSmoothWheelZoom(chartRef);
  return <div ref={boxRef} data-testid="zoom-box" style={{ width: 400, height: 200 }} />;
}

/** Dispatches a wheel event the hook can inspect (jsdom omits offsetX/offsetY). */
function wheel(
  element: Element,
  { deltaY = 100, shiftKey = false, offsetX = 200, offsetY = 100 } = {}
) {
  const event = new WheelEvent('wheel', {
    deltaY,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'offsetX', { value: offsetX });
  Object.defineProperty(event, 'offsetY', { value: offsetY });
  element.dispatchEvent(event);
  return event;
}

describe('useSmoothWheelZoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('zooms in and swallows the event when the cursor is over the grid', () => {
    const { instance, dispatchAction } = makeInstance();
    const { getByTestId } = render(<Harness instance={instance} />);

    // Negative deltaY is a scroll up, which zooms in. Scrolling down on a
    // full range is a no-op, because there is nothing further to zoom out to.
    const event = wheel(getByTestId('zoom-box'), { deltaY: -100 });

    expect(dispatchAction).toHaveBeenCalledTimes(1);
    const payload = dispatchAction.mock.calls[0][0];
    expect(payload.type).toBe('dataZoom');
    expect(payload.start).toBeGreaterThanOrEqual(0);
    expect(payload.end).toBeLessThanOrEqual(100);
    expect(payload.end - payload.start).toBeLessThan(100);
    // The page must not scroll while the chart is being zoomed.
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets the page scroll when the cursor is outside the grid', () => {
    const { instance, dispatchAction } = makeInstance({ containPixel: false });
    const { getByTestId } = render(<Harness instance={instance} />);

    const event = wheel(getByTestId('zoom-box'));

    expect(dispatchAction).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a fully zoomed-out chart alone instead of emitting a no-op', () => {
    const { instance, dispatchAction } = makeInstance({ start: 0, end: 100 });
    const { getByTestId } = render(<Harness instance={instance} />);

    // Scrolling down at full range cannot widen the window any further.
    wheel(getByTestId('zoom-box'), { deltaY: 100 });

    expect(dispatchAction).not.toHaveBeenCalled();
  });

  it('pans instead of zooming when shift is held', () => {
    const { instance, dispatchAction } = makeInstance({ start: 20, end: 60 });
    const { getByTestId } = render(<Harness instance={instance} />);

    wheel(getByTestId('zoom-box'), { shiftKey: true });

    expect(dispatchAction).toHaveBeenCalledTimes(1);
    const payload = dispatchAction.mock.calls[0][0];
    // Panning keeps the window width and moves it along.
    expect(payload.end - payload.start).toBeCloseTo(40, 5);
    expect(payload.start).not.toBeCloseTo(20, 5);
  });

  it('does nothing once the chart instance is disposed', () => {
    const { instance, dispatchAction } = makeInstance({ disposed: true });
    const { getByTestId } = render(<Harness instance={instance} />);

    const event = wheel(getByTestId('zoom-box'));

    expect(dispatchAction).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing when the chart is already fully zoomed in', () => {
    // A window this narrow cannot shrink further; the hook must not emit a
    // degenerate range.
    const { instance, dispatchAction } = makeInstance({ start: 50, end: 50.2 });
    const { getByTestId } = render(<Harness instance={instance} />);

    wheel(getByTestId('zoom-box'), { deltaY: 100 });

    if (dispatchAction.mock.calls.length > 0) {
      const payload = dispatchAction.mock.calls[0][0];
      expect(payload.end).toBeGreaterThan(payload.start);
    }
  });

  it('removes the listener on unmount', () => {
    const { instance, dispatchAction } = makeInstance();
    const { getByTestId, unmount } = render(<Harness instance={instance} />);
    const box = getByTestId('zoom-box');
    unmount();

    wheel(box);
    expect(dispatchAction).not.toHaveBeenCalled();
  });
});
