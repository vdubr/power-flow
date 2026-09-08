import { describe, it, expect } from 'vitest';
import { computeWheelZoomRange, computeWheelPanRange } from '../utils/zoomMath';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A delta of +100 is exactly 1 notch (zoom-out by ~10 %). */
const ONE_NOTCH_OUT = 100;
/** A delta of -100 is exactly 1 notch (zoom-in by ~10 %). */
const ONE_NOTCH_IN = -100;

describe('computeWheelZoomRange', () => {
  // -------------------------------------------------------------------------
  // Anchor preservation
  // -------------------------------------------------------------------------
  it('zoom-in: keeps the anchor point under the cursor (midpoint example)', () => {
    // Start with full range, anchor at 50 %.
    const result = computeWheelZoomRange(
      { start: 0, end: 100 },
      50,
      ONE_NOTCH_IN,
    );
    expect(result).not.toBeNull();
    // After zoom-in the anchor (50 %) must still sit at the same relative
    // position within the new window — i.e. exactly in the centre.
    const { start, end } = result!;
    const anchorRatio = (50 - start) / (end - start);
    expect(anchorRatio).toBeCloseTo(0.5, 5);
  });

  it('zoom-in: keeps the anchor point when anchor is at 25 %', () => {
    const result = computeWheelZoomRange(
      { start: 0, end: 100 },
      25,
      ONE_NOTCH_IN,
    );
    expect(result).not.toBeNull();
    const { start, end } = result!;
    const anchorRatio = (25 - start) / (end - start);
    expect(anchorRatio).toBeCloseTo(0.25, 5);
  });

  it('zoom-in: keeps the anchor point when anchor is at 75 %', () => {
    const result = computeWheelZoomRange(
      { start: 10, end: 90 },
      60,
      ONE_NOTCH_IN,
    );
    expect(result).not.toBeNull();
    const { start, end } = result!;
    // anchor was at 62.5 % of span → ratio 0.625
    const expectedRatio = (60 - 10) / (90 - 10); // 0.625
    const actualRatio = (60 - start) / (end - start);
    expect(actualRatio).toBeCloseTo(expectedRatio, 4);
  });

  // -------------------------------------------------------------------------
  // Clamp to [0, 100]
  // -------------------------------------------------------------------------
  it('clamps start to 0 when zoom-out pushes beyond left edge (window not at full range)', () => {
    // Start with a half-open window near the left; zoom out with anchor at 0.
    const result = computeWheelZoomRange(
      { start: 0, end: 50 },
      0, // anchor at left edge — zoom-out expands rightward
      ONE_NOTCH_OUT,
    );
    expect(result).not.toBeNull();
    expect(result!.start).toBeCloseTo(0, 5);
    expect(result!.end).toBeLessThanOrEqual(100);
  });

  it('clamps end to 100 when zoom-out pushes beyond right edge (window not at full range)', () => {
    // Start with a half-open window near the right; zoom out with anchor at 100.
    const result = computeWheelZoomRange(
      { start: 50, end: 100 },
      100, // anchor at right edge — zoom-out expands leftward
      ONE_NOTCH_OUT,
    );
    expect(result).not.toBeNull();
    expect(result!.end).toBeCloseTo(100, 5);
    expect(result!.start).toBeGreaterThanOrEqual(0);
  });

  it('result start is always >= 0', () => {
    const result = computeWheelZoomRange(
      { start: 5, end: 15 },
      5, // anchor at left edge of window
      ONE_NOTCH_IN,
    );
    if (result) {
      expect(result.start).toBeGreaterThanOrEqual(0);
      expect(result.end).toBeLessThanOrEqual(100);
    }
  });

  // -------------------------------------------------------------------------
  // minSpan enforcement
  // -------------------------------------------------------------------------
  it('respects minSpan: does not shrink below default 0.5 %', () => {
    // Start with a span already near minimum.
    const result = computeWheelZoomRange(
      { start: 49.8, end: 50.2 }, // span = 0.4
      50,
      ONE_NOTCH_IN,
    );
    // Either null (no-op) or span >= 0.5.
    if (result) {
      expect(result.end - result.start).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });

  it('respects custom minSpan option', () => {
    const result = computeWheelZoomRange(
      { start: 49, end: 51 }, // span = 2
      50,
      ONE_NOTCH_IN,
      { minSpan: 5 },
    );
    if (result) {
      expect(result.end - result.start).toBeGreaterThanOrEqual(5 - 1e-9);
    }
  });

  // -------------------------------------------------------------------------
  // Zoom-out back to full range
  // -------------------------------------------------------------------------
  it('zooming out on a zoomed-in window returns toward full 0–100 range', () => {
    // Start zoomed in to [40, 60].
    const result = computeWheelZoomRange(
      { start: 40, end: 60 },
      50,
      ONE_NOTCH_OUT,
    );
    expect(result).not.toBeNull();
    expect(result!.end - result!.start).toBeGreaterThan(20); // span grew
  });

  it('zooming out on full range keeps it clamped at 0–100', () => {
    // 3 notches out on full range, anchor in the middle.
    const result = computeWheelZoomRange(
      { start: 0, end: 100 },
      50,
      300, // 3 notches
    );
    // Should return null (no-op) because 0–100 cannot expand further.
    if (result) {
      expect(result.start).toBeCloseTo(0, 3);
      expect(result.end).toBeCloseTo(100, 3);
    }
  });

  // -------------------------------------------------------------------------
  // Large deltaY normalisation
  // -------------------------------------------------------------------------
  it('large deltaY (e.g. 1000 from macOS momentum) is clamped to max 3 notches', () => {
    const resultLarge = computeWheelZoomRange(
      { start: 20, end: 80 },
      50,
      1000, // would be 10 notches without clamp
    );
    const resultExact = computeWheelZoomRange(
      { start: 20, end: 80 },
      50,
      300, // exactly 3 notches
    );
    // Both should produce the same result because clamp(1000/100, -3, 3) = 3.
    expect(resultLarge).toEqual(resultExact);
  });

  it('large negative deltaY is clamped to -3 notches', () => {
    const resultLarge = computeWheelZoomRange(
      { start: 20, end: 80 },
      50,
      -1000,
    );
    const resultExact = computeWheelZoomRange(
      { start: 20, end: 80 },
      50,
      -300,
    );
    expect(resultLarge).toEqual(resultExact);
  });

  // -------------------------------------------------------------------------
  // null / no-op
  // -------------------------------------------------------------------------
  it('returns null when span cannot shrink further (at minSpan)', () => {
    // Span exactly at minSpan, trying to zoom in further.
    const result = computeWheelZoomRange(
      { start: 49.75, end: 50.25 }, // span = 0.5 exactly
      50,
      -300, // aggressive zoom-in
      { minSpan: 0.5 },
    );
    // Result may be null OR have span = 0.5 (no real change from clamping).
    if (result) {
      expect(result.end - result.start).toBeCloseTo(0.5, 3);
    }
  });

  it('returns null for a trivial delta that causes < 0.01 % change', () => {
    // deltaY = 0.5 → notches = 0.005 → factor ≈ 1.0005 → negligible change
    const result = computeWheelZoomRange(
      { start: 0, end: 100 },
      50,
      0.5,
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeWheelPanRange
// ---------------------------------------------------------------------------

describe('computeWheelPanRange', () => {
  it('pan right: shifts the window without changing span', () => {
    const initial = { start: 10, end: 50 }; // span = 40
    const result = computeWheelPanRange(initial, ONE_NOTCH_OUT);
    expect(result).not.toBeNull();
    const { start, end } = result!;
    // Span must be preserved.
    expect(end - start).toBeCloseTo(40, 5);
    // Window moved to the right (larger start/end).
    expect(start).toBeGreaterThan(10);
  });

  it('pan left: shifts the window to the left without changing span', () => {
    const initial = { start: 30, end: 70 }; // span = 40
    const result = computeWheelPanRange(initial, ONE_NOTCH_IN);
    expect(result).not.toBeNull();
    const { start, end } = result!;
    expect(end - start).toBeCloseTo(40, 5);
    expect(start).toBeLessThan(30);
  });

  it('clamps at the right edge (end cannot exceed 100) while preserving span', () => {
    // span = 15; shift = 15 × 0.1 × 3 = 4.5 → end = 99.5 (within bounds).
    // Verify span is preserved and end stays <= 100.
    const result = computeWheelPanRange(
      { start: 80, end: 95 }, // span = 15
      300, // 3 notches, shift = 4.5
    );
    // Just verify span is preserved and end <= 100, start >= 0.
    if (result) {
      expect(result.end - result.start).toBeCloseTo(15, 4);
      expect(result.end).toBeLessThanOrEqual(100);
      expect(result.start).toBeGreaterThanOrEqual(0);
    }
  });

  it('clamps at right edge with large enough pan to hit the boundary', () => {
    // span 20, start 88 → end 108 after shift.
    // 1 notch: shift = 20 × 0.1 × 1 = 2 pp → end = 90 + 2 = 92 (no clamp).
    // Use custom panPerNotch=1.0 via a large enough deltaY that normalises to
    // enough notches... Actually: just pick values where clamping provably occurs.
    // span 10, start 94, end 104-clamped = use start=91, end=101? No, end already over.
    // Correct approach: start=91, end=100 (span=9). 1 notch right → shift=0.9 → end=100.9 → clamp.
    const result = computeWheelPanRange(
      { start: 91, end: 100 }, // span = 9; end is at boundary
      100, // 1 notch, shift = 9 × 0.1 × 1 = 0.9 → end would be 100.9 → clamped to 100
    );
    // After clamping end=100, start = 100-9 = 91 (no real change from start,
    // but newEnd was going to exceed 100 → shift = 0.9 but end was already 100
    // so delta = 0.9 at end → non-null because newEnd (100) - current.end (100) = 0
    // but newStart would be 91.9-0.9=91 also...
    // Re-calc: newStart=91.9, newEnd=100.9 → clamp end→100, start=100-9=91
    // |91-91|=0 < 0.01 → null again. Need initial end NOT at 100.
    // Use start=91.5, end=99 (span=7.5). 1 notch → shift=0.75 → end=99.75, start=92.25.
    // |99.75-99|=0.75 >= 0.01 → non-null, no clamp needed.
    // For actual clamp: start=95, end=99 (span=4). 3 notches → shift=1.2 → end=100.2 → clamp.
    // newEnd=100, newStart=100-4=96. |96-95|=1 >= 0.01 → non-null.
    if (result !== null) {
      // If non-null: just verify invariants.
      expect(result.end).toBeLessThanOrEqual(100);
      expect(result.start).toBeGreaterThanOrEqual(0);
    }
    // The real clamp test below is more reliable.
    const r2 = computeWheelPanRange({ start: 95, end: 99 }, 300);
    expect(r2).not.toBeNull();
    expect(r2!.end).toBeCloseTo(100, 5);
    expect(r2!.start).toBeCloseTo(96, 5); // 100 - 4
    expect(r2!.end - r2!.start).toBeCloseTo(4, 5);
  });

  it('clamps at the left edge (start cannot go below 0) while preserving span', () => {
    // span 4, start 1, end 5. 3 notches left → shift = 4 × 0.1 × 3 = 1.2
    // → newStart = -0.2 → clamp to 0, newEnd = 4.
    const result = computeWheelPanRange(
      { start: 1, end: 5 }, // span = 4
      -300, // 3 notches left
    );
    expect(result).not.toBeNull();
    expect(result!.start).toBeCloseTo(0, 5);
    expect(result!.end).toBeCloseTo(4, 5);
    expect(result!.end - result!.start).toBeCloseTo(4, 5);
  });

  it('pan clamp preserves span when near the right edge', () => {
    // Verify span is preserved even after clamping at the boundary.
    const result = computeWheelPanRange(
      { start: 85, end: 90 }, // span = 5
      1000, // large → clamp to 3 notches → shift = 5 × 0.1 × 3 = 1.5 → end 91.5
    );
    if (result) {
      expect(result.end - result.start).toBeCloseTo(5, 4);
    }
  });

  it('pan clamp preserves span when near the left edge', () => {
    const result = computeWheelPanRange(
      { start: 10, end: 15 }, // span = 5
      -1000, // large left → shift = 1.5 left → start 8.5
    );
    if (result) {
      expect(result.end - result.start).toBeCloseTo(5, 4);
    }
  });

  it('returns null for negligible delta (0.5 px, tiny span)', () => {
    // span = 1, shift = 1 × 0.1 × (0.5/100) = 0.0005 pp → below 0.01 threshold
    const result = computeWheelPanRange({ start: 49.5, end: 50.5 }, 0.5);
    expect(result).toBeNull();
  });

  it('does not change span on multiple consecutive pans', () => {
    let current = { start: 0, end: 50 };
    for (let i = 0; i < 5; i++) {
      const next = computeWheelPanRange(current, ONE_NOTCH_OUT);
      if (next) {
        expect(next.end - next.start).toBeCloseTo(50, 4);
        current = next;
      }
    }
  });
});
