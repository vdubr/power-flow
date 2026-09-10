/**
 * Chip s lokalitou v importním pruhu. Lokalita se vybírá tady, protože
 * rozhoduje o východu a západu slunce, tedy o rozdělení den/noc — testy jejího
 * chování jsou proto u chipu, ne v `ChartControls.test.tsx`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { useEnergyStore } from '../store/energyStore';
import { CZECH_LOCATIONS, getDefaultLocation } from '../utils/sunCalculations';
import theme from '../theme';
import LocationChip from '../components/DataImport/LocationChip';

const BRNO = CZECH_LOCATIONS.find((l) => l.name === 'Brno')!;

function renderChip() {
  return render(
    <ThemeProvider theme={theme}>
      <LocationChip />
    </ThemeProvider>
  );
}

/** The trigger keeps the visible town name, so it is found by that name. */
function getTrigger(name = getDefaultLocation().name!) {
  return screen.getByRole('button', { name: new RegExp(name) });
}

beforeEach(() => {
  useEnergyStore.getState().clearData();
});

describe('LocationChip', () => {
  it('vykreslí aktuální lokalitu ze storu', () => {
    useEnergyStore.getState().setDayNightConfig({
      ...useEnergyStore.getState().chartConfig.dayNightConfig,
      mode: 'sun',
      location: BRNO,
    });
    renderChip();

    expect(screen.getByText('Brno')).toBeInTheDocument();
  });

  it('bez nastavené lokality padá na výchozí Prahu', () => {
    useEnergyStore.getState().setDayNightConfig({
      ...useEnergyStore.getState().chartConfig.dayNightConfig,
      location: undefined,
    });
    renderChip();

    expect(screen.getByText('Praha')).toBeInTheDocument();
  });

  it('spouštěč je tlačítko a jeho přístupné jméno obsahuje lokalitu', () => {
    renderChip();

    const trigger = getTrigger();
    // WCAG 2.5.3 — viditelný text je součástí přístupného jména, takže hlasové
    // ovládání „klikni na Praha“ funguje.
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAccessibleName(/Praha/);
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  });

  it('kliknutí otevře seznam všech lokalit s vyznačeným výběrem', () => {
    const { baseElement } = renderChip();

    fireEvent.click(getTrigger());

    // MUI renderuje menu v portálu, proto se hledá nad baseElement.
    const options = within(baseElement).getAllByRole('option');
    expect(options).toHaveLength(CZECH_LOCATIONS.length);
    expect(within(baseElement).getByRole('option', { name: 'Praha' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(within(baseElement).getByRole('option', { name: 'Brno' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('výběr města zapíše lokalitu do storu a přepne na režim slunce', () => {
    const { baseElement } = renderChip();
    expect(useEnergyStore.getState().chartConfig.dayNightConfig.location?.name).toBe('Praha');

    fireEvent.click(getTrigger());
    fireEvent.click(within(baseElement).getByRole('option', { name: 'Brno' }));

    const config = useEnergyStore.getState().chartConfig.dayNightConfig;
    expect(config.location).toEqual(BRNO);
    expect(config.mode).toBe('sun');
    // Po výběru se seznam zavírá, jinak by zůstal přes importní pruh.
    expect(getTrigger('Brno')).toHaveAttribute('aria-expanded', 'false');
  });

  it('po výběru nese chip novou lokalitu', () => {
    const { baseElement } = renderChip();

    fireEvent.click(getTrigger());
    fireEvent.click(within(baseElement).getByRole('option', { name: 'Ostrava' }));

    expect(getTrigger('Ostrava')).toHaveAccessibleName(/Ostrava/);
  });

  it('seznam se otevře i z klávesnice, bez myši', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderChip();

    // Chip je jediný fokusovatelný prvek, takže jeden Tab stačí.
    await user.tab();
    expect(getTrigger()).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(within(baseElement).getAllByRole('option')).toHaveLength(CZECH_LOCATIONS.length);
  });
});
