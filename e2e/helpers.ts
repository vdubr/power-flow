import { Locator, Page, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SAMPLE_DIR = resolve(process.cwd(), 'public/sample-data');

/** Reads a sample export as raw bytes, so the browser sees real Windows-1250 CRLF data. */
export function sampleFile(year: number, kind: 'spotreba' | 'vyroba') {
  return {
    name: `${kind}.csv`,
    mimeType: 'text/csv',
    buffer: readFileSync(resolve(SAMPLE_DIR, String(year), `${kind}.csv`)),
  };
}

/** Loads every bundled sample year (2022–2025) through the button on the empty state. */
export async function loadSampleData(page: Page): Promise<void> {
  await page.getByRole('button', { name: /ukázkov/i }).click();
  await expect(page.getByText(/záznam/i).first()).toBeVisible({ timeout: 30_000 });
}

/** Uploads real CSV files through the hidden file input. */
export async function uploadYear(page: Page, year: number): Promise<void> {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([sampleFile(year, 'spotreba'), sampleFile(year, 'vyroba')]);
}

/** Waits until at least one ECharts canvas has painted. */
export async function waitForChart(page: Page): Promise<void> {
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Drops real CSV bytes on a selector, the way a user drags files from Finder.
 * Playwright cannot synthesise a DataTransfer from the Node side, so the files
 * are rebuilt inside the page from base64.
 */
export async function dropYear(
  page: Page,
  year: number,
  selector = 'body'
): Promise<void> {
  const files = (['spotreba', 'vyroba'] as const).map((kind) => {
    const file = sampleFile(year, kind);
    return { name: file.name, base64: file.buffer.toString('base64') };
  });

  const dataTransfer = await page.evaluateHandle((payload) => {
    const dt = new DataTransfer();
    for (const { name, base64 } of payload) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      dt.items.add(new File([bytes], name, { type: 'text/csv' }));
    }
    return dt;
  }, files);

  await page.dispatchEvent(selector, 'drop', { dataTransfer });
}

/**
 * Hovers a point of the chart until ECharts answers with a tooltip.
 *
 * A single mouse move can land while the canvas is still being rebuilt, when
 * zrender has not attached its handlers yet and the move is simply dropped.
 * Retrying the hover is deterministic, where waiting a fixed time is a guess.
 */
export async function hoverChartTooltip(page: Page, x: number, y: number): Promise<Locator> {
  // ECharts renders the tooltip as an absolutely positioned div; the average
  // row is the only text unique to it.
  const tooltip = page
    .locator('div[style*="position: absolute"]')
    .filter({ hasText: /Ø/ })
    .first();

  await expect
    .poll(
      async () => {
        // Two moves: the pointer may already be sitting at the target.
        await page.mouse.move(x - 60, y);
        await page.mouse.move(x, y);
        return tooltip.count();
      },
      { timeout: 20_000, intervals: [200, 400, 700, 1000] }
    )
    .toBeGreaterThan(0);

  return tooltip;
}
