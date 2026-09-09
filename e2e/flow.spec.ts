import { test, expect } from '@playwright/test';
import { dropYear, loadSampleData, uploadYear, waitForChart } from './helpers';

/**
 * E1 – the whole point of the app: load data, see the balance, get a battery
 * recommendation. If this passes, the primary user need is reachable.
 */
test('E1 ukázková data vedou až k doporučení kapacity', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Přetáhněte sem CSV/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Jak stáhnout data z ČEZ/i })).toBeVisible();

  await loadSampleData(page);
  await waitForChart(page);

  // The balance is on screen.
  await expect(page.getByRole('heading', { name: /Graf spotřeby a výroby/i })).toBeVisible();
  await expect(page.getByText('Celková spotřeba')).toBeVisible();

  // The recommendation is the headline answer, in a plausible range.
  const advisor = page.locator('.paper-card', { hasText: 'DOPORUČENÁ KAPACITA' }).first();
  await expect(advisor).toBeVisible();
  const headline = await advisor.locator('text=/^\\d+,\\d$/').first().textContent();
  const capacity = Number((headline ?? '').replace(',', '.'));
  expect(capacity).toBeGreaterThanOrEqual(2);
  expect(capacity).toBeLessThanOrEqual(30);

  // And it is justified, not just asserted.
  await expect(advisor.getByText(/Každá další kWh přidá/i)).toBeVisible();
  await expect(advisor.getByRole('button', { name: /Použít v simulaci/i })).toBeVisible();
});

/**
 * E2 – both export formats ČEZ produces must load without errors.
 * 2022 uses "a+/a-" with minute precision, 2025 uses "+A/… [kW]" with 24:00:00.
 */
for (const year of [2022, 2025]) {
  test(`E2 upload reálného exportu ${year} projde bez chyb`, async ({ page }) => {
    await page.goto('/');
    await uploadYear(page, year);

    // The collapsed bar names the imported year exactly once as a badge.
    await expect(
      page.getByRole('button', { name: String(year), exact: true }).first()
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/nepodařilo se zpracovat/i)).toHaveCount(0);
    await waitForChart(page);
  });
}

/**
 * E3 – importing a second year shows it immediately, and comparison is one
 * click away. Previously the import kept the old selection, so the panels did
 * not change and the new year appeared only as a dimmed badge.
 */
test('E3 nahraný rok se zobrazí a porovnání je krok navíc', async ({ page }) => {
  await page.goto('/');
  await uploadYear(page, 2022);
  await waitForChart(page);

  await page.getByRole('button', { name: /Nahrát další/i }).click();
  await uploadYear(page, 2025);

  // No confirmation step: the import lands and says so.
  await expect(page.getByRole('status')).toContainText(/Načteno .* za rok 2025/, {
    timeout: 60_000,
  });

  const badge2025 = page.getByRole('button', { name: '2025', exact: true }).first();
  await expect(badge2025).toBeVisible({ timeout: 60_000 });

  // Adding the earlier year back turns the chart into a comparison.
  await page.getByRole('button', { name: '2022', exact: true }).first().click();

  // With two years selected the comparison table appears.
  await expect(page.getByRole('table', { name: /Porovnání let|porovnání/i }).first()).toBeVisible({
    timeout: 30_000,
  });
});

/** E5 – removing a year and clearing everything returns to the empty state. */
test('E5 odebrání roku a vymazání dat', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  await page.getByRole('button', { name: /Import dat/i }).click();
  await page.getByRole('button', { name: /Vymazat všechna data/i }).click();

  await expect(page.getByRole('heading', { name: /Přetáhněte sem CSV/i })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

/**
 * E8 – a drop that lands outside the drop zone (or while the import bar is
 * collapsed, when the zone is not even mounted) must import the files instead
 * of letting the browser open the CSV and discard the loaded data.
 */
test('E8 přetažení na stránku načte rok a neodnaviguje', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  const urlBefore = page.url();
  await dropYear(page, 2025, 'body');

  await expect(page.getByRole('status')).toContainText(/Načteno .* za rok 2025/, {
    timeout: 60_000,
  });
  expect(page.url()).toBe(urlBefore);
  await expect(page.locator('canvas').first()).toBeVisible();
});
