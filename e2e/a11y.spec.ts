import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loadSampleData, waitForChart } from './helpers';

/**
 * E7 – no critical or serious accessibility violations.
 *
 * Canvas charts are invisible to a screen reader, so every chart must carry a
 * text alternative; DESIGN.md requires it and axe checks the rest.
 */
test('E7 prázdný stav nemá vážné bariéry', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const serious = results.violations.filter((v) =>
    ['critical', 'serious'].includes(v.impact ?? '')
  );
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});

test('E7 načtený stav nemá vážné bariéry a grafy mají popis', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  // Every chart surface is described for assistive technology.
  const charts = page.locator('.blueprint-surface[role="img"]');
  expect(await charts.count()).toBeGreaterThan(0);
  for (const chart of await charts.all()) {
    await expect(chart).toHaveAttribute('aria-label', /.+/);
  }

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const serious = results.violations.filter((v) =>
    ['critical', 'serious'].includes(v.impact ?? '')
  );
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});
