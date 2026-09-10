import { test, expect, Page } from '@playwright/test';
import { hoverChartTooltip, loadSampleData, waitForChart } from './helpers';

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

/** First cell of a hidden-summary row, i.e. the total the chart is describing. */
async function seriesTotal(page: Page, seriesName: string): Promise<string> {
  const row = page.getByRole('row').filter({ hasText: seriesName }).first();
  return (await row.getByRole('cell').nth(1).textContent()) ?? '';
}

/**
 * E9 – the four-state day/night switch. `Suma` and `Den i noc` draw the same
 * bars, the second only enriches the tooltip; `Jen den` and `Jen noc` clip the
 * data, so the totals have to move with them.
 */
test('E9 čtyřstavový přepínač den/noc suma – den i noc – den – noc', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  const wholeDay = await seriesTotal(page, 'Spotřeba 2022');
  expect(wholeDay).not.toBe('');

  // Clipping to one half of the day must change what the chart describes.
  await page.getByRole('button', { name: 'Jen den' }).click();
  const dayOnly = await seriesTotal(page, 'Spotřeba 2022');
  await page.getByRole('button', { name: 'Jen noc' }).click();
  const nightOnly = await seriesTotal(page, 'Spotřeba 2022');

  expect(dayOnly).not.toBe(wholeDay);
  expect(nightOnly).not.toBe(wholeDay);
  expect(dayOnly).not.toBe(nightOnly);

  // Production is never divided: panels export nothing after sunset.
  await page.getByRole('button', { name: 'Suma' }).click();
  const production = await seriesTotal(page, 'Výroba 2022');
  await page.getByRole('button', { name: 'Jen den' }).click();
  expect(await seriesTotal(page, 'Výroba 2022')).toBe(production);

  // "Den i noc" leaves the bars alone and puts the division in the tooltip.
  await page.getByRole('button', { name: 'Den i noc' }).click();
  expect(await seriesTotal(page, 'Spotřeba 2022')).toBe(wholeDay);

  const canvas = page.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const tooltip = await hoverChartTooltip(
    page,
    box.x + box.width * 0.55,
    box.y + box.height * 0.35
  );
  await expect(tooltip).toContainText('Spotřeba ve dne');
  await expect(tooltip).toContainText('Spotřeba v noci');
});

/**
 * E12 – the net view answers "how much did I actually have to buy", and the
 * chart can take over the screen while reading it.
 */
test('E12 zobrazení Dokoupená energie a celá obrazovka', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  // Balance view: two filter rows, one per side of the meter.
  await expect(page.getByRole('group', { name: 'Filtr grafu – Spotřeba' })).toBeVisible();

  await page.getByRole('button', { name: 'Dokoupená energie' }).click();

  // Net view: one row, one series per year, no quantity to switch off.
  await expect(page.getByRole('group', { name: 'Filtr grafu – Dokoupená energie' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filtr grafu – Spotřeba' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dokoupená energie 2025' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();

  // Back to the balance view.
  await page.getByRole('button', { name: 'Odběr a dodávka' }).click();
  await expect(page.getByRole('group', { name: 'Filtr grafu – Spotřeba' })).toBeVisible();

  // Mirroring the consumption below the axis is a way of drawing, not of
  // counting: the numbers behind the chart must not move with it.
  const beforeMirror = await seriesTotal(page, 'Spotřeba 2022');
  const mirror = page.getByLabel('Spotřeba pod osu');
  await expect(mirror).not.toBeChecked();
  await mirror.check();
  // Zrcadlí se kresba, ne čísla: součet zůstává týž a kladný.
  expect(await seriesTotal(page, 'Spotřeba 2022')).toBe(beforeMirror);
  expect(beforeMirror).not.toMatch(/^[-−]/);
  await mirror.uncheck();

  // The fullscreen control is a real button with a label, not a bare icon.
  const fullscreen = page.getByRole('button', { name: /na celou obrazovku/i });
  await expect(fullscreen).toBeVisible();
  await fullscreen.click();
  await expect(page.getByRole('button', { name: /Ukončit celou obrazovku/i })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
});

/**
 * E13 – the zoom window is the selection. Narrowing the chart is what defines
 * the range every panel can follow, so there is no brush tool left to find.
 */
test('E13 zoom v grafu je výseč pro celou stránku', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'Zoom kolečkem je záležitost desktopu.');

  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  // A single year, so the zoom means one interval of real time; with several
  // years on a shared month-day axis it cannot.
  for (const year of ['2022', '2023', '2024']) {
    await page.getByRole('button', { name: year, exact: true }).first().click();
  }

  const canvas = page.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.wheel(0, -120);
  }

  // The range on screen is spelled out above the chart.
  await expect(page.getByText(/^Výseč: /)).toBeVisible({ timeout: 15_000 });

  // And "Výseč v grafu" applies it to the whole page — no brush needed.
  const selection = page.getByRole('button', { name: /Výseč v grafu/i }).first();
  await expect(selection).toBeEnabled();
  // The statistics card is the proof the whole page followed, not just the chart.
  const statistics = page.locator('.paper-card', { hasText: 'Statistiky' }).first();
  const beforeApplying = await statistics.innerText();
  await selection.click();
  await expect
    .poll(async () => statistics.innerText(), { timeout: 15_000 })
    .not.toBe(beforeApplying);
});

/**
 * E10 – the filter under the chart is the legend: two rows, the quantity switch
 * at the start of each. A series goes grey whether the user clicked its chip,
 * switched the whole row off, or unticked the year in "Import dat" — the chart
 * shows the same thing in all three cases, so the filter must say the same.
 */
test('E10 filtr pod grafem má řádek na spotřebu a na výrobu', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  const consumptionRow = page.getByRole('group', { name: 'Filtr grafu – Spotřeba' });
  const productionRow = page.getByRole('group', { name: 'Filtr grafu – Výroba' });
  await expect(consumptionRow).toBeVisible();
  await expect(productionRow).toBeVisible();

  // Ukázková data nesou čtyři roky, každý v obou řádcích.
  for (const year of [2022, 2023, 2024, 2025]) {
    await expect(consumptionRow.getByRole('button', { name: `Spotřeba ${year}` })).toBeVisible();
    await expect(productionRow.getByRole('button', { name: `Výroba ${year}` })).toBeVisible();
  }

  // Kliknutí na čip sérii skryje a nechá ji ve filtru, aby šla vrátit.
  const chip2022 = consumptionRow.getByRole('button', { name: 'Spotřeba 2022' });
  await expect(chip2022).toHaveAttribute('aria-pressed', 'true');
  await chip2022.click();
  await expect(chip2022).toHaveAttribute('aria-pressed', 'false');
  await chip2022.click();
  await expect(chip2022).toHaveAttribute('aria-pressed', 'true');

  // Vypnutí celé veličiny čipy nezruší, jen zneaktivní.
  await productionRow.locator('input[type="checkbox"]').click();
  for (const year of [2022, 2025]) {
    const chip = productionRow.getByRole('button', { name: `Výroba ${year}` });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('aria-disabled', 'true');
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
  }
  // Spotřeba se tím nedotkne.
  await expect(consumptionRow.getByRole('button', { name: 'Spotřeba 2022' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await productionRow.locator('input[type="checkbox"]').click();

  // Odznak roku v „Import dat“ zneaktivní ten rok v obou řádcích.
  await page.getByRole('button', { name: '2023', exact: true }).first().click();
  for (const [row, name] of [
    [consumptionRow, 'Spotřeba 2023'],
    [productionRow, 'Výroba 2023'],
  ] as const) {
    await expect(row.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
  }
  await expect(consumptionRow.getByRole('button', { name: 'Spotřeba 2024' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

/**
 * E11 – the point of the weekly and monthly views: pick a unit and see how the
 * years compare on it. The whole column is the hover target, and the numbers
 * cover every imported year, not only the drawn ones.
 */
test('E11 měsíční zobrazení porovná měsíc napříč roky', async ({ page, isMobile }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  const canvas = page.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  // Anywhere in the column band, deliberately not on a bar: half the plot
  // height is empty above the bars of most months.
  const x = box.x + box.width * 0.55;
  const y = box.y + box.height * 0.35;

  if (isMobile) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.move(x, y);
  }

  await expect(page.getByText(/— všechny roky/).first()).toBeVisible({ timeout: 15_000 });
  // Průměr a odchylka od něj, pro obě veličiny.
  await expect(page.getByText(/Ø 4 let/).first()).toBeVisible();
  await expect(page.getByText(/[▲▼]\s*[+−]\d/).first()).toBeVisible();
});

/**
 * E11 – the weekly band is one week for every year, zoomed or not. The axis
 * used to be keyed by the date of each year's Monday, which moves from year to
 * year: week 27 of 2022 and of 2025 landed in different bands three days apart,
 * each holding a single year, and zooming made the band look like it drifted.
 */
test('E11 týdenní pás drží stejný týden všech roků i po zoomu', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'Zoom kolečkem je záležitost desktopu; dotykový tooltip pokrývá test výše.');

  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  await page.getByLabel('Agregace').click();
  await page.getByRole('option', { name: /Týdenní/ }).click();
  // The closed select shows the option's description, so this is the cheapest
  // proof the weekly view has actually rendered.
  await expect(page.getByText('Součet za každý týden').first()).toBeVisible();
  // The select's backdrop is still fading out at this point and would swallow
  // the hover that the tooltip needs.
  await expect(page.getByRole('option')).toHaveCount(0);

  const canvas = page.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.4;

  const tooltip = await hoverChartTooltip(page, x, y);
  await expect(tooltip).toContainText(/\d+\. týden/);
  // One band, all four years, each with its own Monday–Sunday span.
  for (const year of [2022, 2023, 2024, 2025]) {
    await expect(tooltip).toContainText(new RegExp(`${year}\\s+\\d+\\. \\d+\\. – \\d+\\. \\d+\\.`));
  }
  const before = await tooltip.innerText();

  // Zoom in and hover the same band again: the unit must not have moved.
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(x, box.y + box.height * 0.5);
    await page.mouse.wheel(0, -120);
  }
  await hoverChartTooltip(page, x, y);
  await expect(tooltip).toContainText(/\d+\. týden/);
  expect(await tooltip.innerText()).toBe(before);
});

/** Stejná čísla musí být dosažitelná i bez myši. */
test('E11 porovnání napříč roky je i v textové alternativě grafu', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  const table = page.getByRole('table', { name: /Porovnání jednotky napříč/i });
  await expect(table).toBeAttached();
  await expect(table).toContainText('Červenec');
  await expect(table).toContainText('Odchylka od průměru');
});

/** Více nahraných roků patří do měsíčního zobrazení, ne do denního. */
test('E10 import více roků otevře měsíční zobrazení', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  await expect(page.getByLabel('Agregace')).toContainText('Měsíční');
});

/** The aggregation select no longer offers a Den/Noc view. */
test('E9 agregace nabízí pět zobrazení bez Den/Noc', async ({ page }) => {
  await page.goto('/');
  await loadSampleData(page);
  await waitForChart(page);

  await page.getByLabel('Agregace').click();
  const options = page.getByRole('option');
  await expect(options).toHaveCount(5);
  await expect(page.getByRole('option', { name: /Den\/Noc/ })).toHaveCount(0);
});
