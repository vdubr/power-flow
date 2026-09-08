import { Page, expect } from '@playwright/test';
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

/** Loads the bundled sample year through the button on the empty state. */
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
