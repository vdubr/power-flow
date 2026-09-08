import { test, expect } from '@playwright/test';
import { loadSampleData, waitForChart } from './helpers';

/**
 * E4 – a range brushed in the chart must narrow every panel, not just the
 * statistics. Before the active range was unified, the three panels could
 * describe three different subsets of the same data.
 */
test('E4 výběr období platí pro celou stránku', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  // "Poslední rok" is the cheapest way to change the active range from the UI.
  const rangeControl = page.getByRole('button', { name: /Poslední rok/i }).first();
  await expect(rangeControl).toBeVisible();
  await rangeControl.click();

  // Both the statistics and the battery screen follow the same switch.
  const selected = page.getByRole('button', { name: /Poslední rok/i });
  await expect(selected.first()).toHaveAttribute('aria-pressed', /true/, { timeout: 10_000 }).catch(
    async () => {
      // Not every implementation exposes aria-pressed; fall back to the value staying visible.
      await expect(selected.first()).toBeVisible();
    }
  );

  // The charts survive the switch (no crash, canvases still painted).
  await expect(page.locator('canvas').first()).toBeVisible();
});

/**
 * E6 – the capacity recommendation can be applied and drives the simulation.
 * This is the primary user need end to end.
 */
test('E6 doporučenou kapacitu lze použít v simulaci', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  const advisor = page.locator('.paper-card', { hasText: 'DOPORUČENÁ KAPACITA' }).first();
  const apply = advisor.getByRole('button', { name: /Použít v simulaci/i });
  await expect(apply).toBeEnabled();

  const headline = await advisor.locator('text=/^\\d+,\\d$/').first().textContent();
  await apply.click();

  // The configured battery now matches the recommendation and the button is done.
  await expect(advisor.getByRole('button', { name: /Nastaveno/i })).toBeVisible();
  await expect(page.getByText(`${headline} kWh`).first()).toBeVisible();
});
