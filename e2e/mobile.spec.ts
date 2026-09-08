import { test, expect } from '@playwright/test';
import { loadSampleData, waitForChart } from './helpers';

/**
 * The delete control on a year badge used to appear on hover only, which makes
 * it unreachable on a touch screen. DESIGN.md requires add/remove/edit actions
 * to stay usable on mobile.
 */
test('E6m mazání roku je dosažitelné na dotykovém displeji', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  const deleteIcon = page.locator('.MuiChip-deleteIcon').first();
  await expect(deleteIcon).toBeVisible();

  // Visible means non-zero opacity here, not merely present in the DOM.
  const opacity = await deleteIcon.evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBeGreaterThan(0.3);
});

test('E6m stránka se na úzkém displeji nescrolluje do stran', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(2);
});
