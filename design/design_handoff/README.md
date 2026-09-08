# Handoff: Year Badges v Import Baru

## Přehled

Tato změna přidává **odznáčky (badges) načtených roků** přímo do sbaleného importního pruhu.
Po nahrání dat se zobrazí přehled importovaných roků s barevnými tečkami signalizujícími,
která data (výroba / spotřeba) jsou pro daný rok k dispozici.

---

## Důležité

Soubor `Solar Analytics Wireframes.html` v tomto balíčku je **designová reference**
vytvořená jako low-fi wireframe (záměrně skicovitý vizuál). Nevkládej ho do produkce.
Tvým úkolem je **přenést popsané chování do existujícího React + MUI projektu**
a zachovat jeho stávající tmavý theme (dark mode, amber primary, MUI komponenty).

---

## Fidelita

**Low-fidelity wireframe** — zachycuje strukturu, chování a logiku. Vizuální styl
(barvy, zaoblení, typografie) přizpůsob existujícímu MUI dark theme projektu.

---

## Co se mění: `FileUploader` → sbalitelný pruh s year badges

### Stávající stav
`FileUploader.tsx` je vždy plně rozbalený `<Paper>` s drop zónami pro spotřebu a výrobu.
Po načtení dat stav `availableYears` v `energyStore` obsahuje seznam let.

### Nové chování

#### 1. Sbalení po načtení dat
Pokud `availableYears.length > 0` (data jsou načtena do store), komponenta se zobrazí
jako **kompaktní jednořádkový pruh** místo plného formuláře.

```
[ ▸ Import dat ]  roky: [ 2024 ●● ] [ 2023 ●● ] [ 2022 ◌● ]  105 120 záznamů  📍 Praha  [ + Nahrát další ]
```

Kliknutím na `▸ Import dat` (toggle) se pruh rozbalí zpět do původního formuláře.

#### 2. Year Badge — anatomie

Každý odznak = jeden `<Chip>` s těmito prvky zleva doprava:

```
[ 2024  ●  ●  × ]
        ↑  ↑  ↑
    prod  cons  delete (jen při hoveru)
```

| Prvek | Popis |
|---|---|
| Rok (text) | `year` z `availableYears` |
| Zelená tečka | výroba dostupná pro daný rok (`hasProduction`) — zelená `var(--chart-5)` / `#34d399` |
| Červená tečka | spotřeba dostupná pro daný rok (`hasConsumption`) — červená `var(--color-destructive)` / `#ef4444` |
| Chybějící data | tečka se zobrazí šedá + průhledná (opacity 0.25) |
| `×` tlačítko | viditelné jen při `hover` na badge — smaže data daného roku ze store |

#### 3. Aktivní vs. ghost stav

Badge funguje jako globální přepínač roku pro **celou aplikaci** (graf + statistiky + baterie).

- **Aktivní** (rok je v `chartConfig.selectedYears`): Chip plně viditelný, `variant="filled"`, barva primary
- **Ghost** (rok není ve `selectedYears`): `opacity: 0.35`, `variant="outlined"`

Klik na badge toggleuje rok v `selectedYears` přes `setSelectedYears()` ze store.

#### 4. Smazání roku (`×`)

Při kliknutí na `×`:
- Odstraní data daného roku z `yearlyData` mapy ve store
- Odstraní rok z `availableYears`
- Odstraní rok z `selectedYears`
- Spustí znovu `batterySimulation` přes `setBatteryConfig({})` (to stávající logika dělá automaticky)

> Tuto akci je třeba přidat do `energyStore` jako novou akci `removeYear(year: number)`.

---

## Nová akce v `energyStore.ts`

```typescript
removeYear: (year: number) => void;
```

Implementace:

```typescript
removeYear: (year: number) => {
  const { yearlyData, allRecords, batteryConfig, chartConfig } = get();

  const newYearlyData = new Map(yearlyData);
  newYearlyData.delete(year);

  const newAllRecords = allRecords.filter(
    r => r.timestamp.getFullYear() !== year
  );
  const newAvailableYears = Array.from(newYearlyData.keys()).sort();
  const newSelectedYears = chartConfig.selectedYears.filter(y => y !== year);

  let batterySimulation = null;
  if (newAllRecords.length > 0) {
    try {
      batterySimulation = simulateBattery(newAllRecords, batteryConfig);
    } catch (e) {
      console.error('Battery simulation error:', e);
    }
  }

  set({
    yearlyData: newYearlyData,
    allRecords: newAllRecords,
    availableYears: newAvailableYears,
    batterySimulation,
    chartConfig: { ...chartConfig, selectedYears: newSelectedYears },
  });
},
```

---

## Pomocný hook / logika v `FileUploader.tsx`

Pro tečky (hasProduction / hasConsumption) potřebuješ zjistit,
která data jsou pro daný rok dostupná. Využij `yearlyData` ze store:

```typescript
const { availableYears, yearlyData, chartConfig, setSelectedYears } = useEnergyStore();

// Má rok výrobu? (production = alespoň jeden záznam s production > 0)
const hasProduction = (year: number): boolean => {
  const data = yearlyData.get(year);
  if (!data) return false;
  return data.records.some(r => r.production > 0);
};

// Má rok spotřebu?
const hasConsumption = (year: number): boolean => {
  const data = yearlyData.get(year);
  if (!data) return false;
  return data.records.some(r => r.consumption > 0);
};

const isActive = (year: number): boolean =>
  chartConfig.selectedYears.includes(year);

const toggleYear = (year: number) => {
  const next = isActive(year)
    ? chartConfig.selectedYears.filter(y => y !== year)
    : [...chartConfig.selectedYears, year];
  setSelectedYears(next);
};
```

---

## Celkový počet záznamů

```typescript
const totalRecords = allRecords.length;
// zobraz jako: "105 120 záznamů" (česká lokalizace)
totalRecords.toLocaleString('cs-CZ') + ' záznamů'
```

---

## MUI komponenty k použití

| Prvek | MUI komponenta |
|---|---|
| Celý pruh (sbalený) | `<Paper sx={{ p: 1.5 }}>` + `<Stack direction="row">` |
| Toggle "Import dat" | `<Button variant="text" startIcon={<ExpandMoreIcon />}>` |
| Year badge | `<Chip>` s custom `label` (JSX s tečkami) |
| Tečky | `<Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: ... }}>` |
| Smazat rok `×` | `<IconButton size="small">` uvnitř Chip `onDelete` prop nebo vlastní overlay |
| Počet záznamů | `<Typography variant="caption">` |
| Lokalita | `<Chip icon={<LocationOnIcon />} label="Praha" variant="outlined" size="small">` |
| Nahrát další | `<Button variant="outlined" size="small" startIcon={<AddIcon />}>` |

### Chip s `onDelete` (MUI built-in)

MUI `<Chip>` má prop `onDelete` který automaticky zobrazí `×` ikonku.
Ghost state s onDelete ikonkou viditelnou jen při hoveru:

```tsx
<Chip
  label={<YearBadgeLabel year={year} hasProd={hasProduction(year)} hasCons={hasConsumption(year)} />}
  onClick={() => toggleYear(year)}
  onDelete={() => removeYear(year)}
  variant={isActive(year) ? 'filled' : 'outlined'}
  color={isActive(year) ? 'primary' : 'default'}
  size="small"
  sx={{
    opacity: isActive(year) ? 1 : 0.35,
    '& .MuiChip-deleteIcon': {
      opacity: 0,
      transition: 'opacity .15s',
    },
    '&:hover .MuiChip-deleteIcon': {
      opacity: 1,
    },
  }}
/>
```

---

## Soubory ke změně

| Soubor | Typ změny |
|---|---|
| `src/store/energyStore.ts` | Přidat akci `removeYear(year)` do interface i implementace |
| `src/components/DataImport/FileUploader.tsx` | Přidat collapsed stav s year badges; toggle zobrazení |
| `src/types/energy.ts` | Beze změny |

---

## Designová reference

Viz `Solar Analytics Wireframes.html` — přepni na libovolný přístup (A–D), stav „Načtená data".
Importní pruh je vždy nahoře, těsně pod navigací. Year badges jsou ve funkci `importCollapsed()`.

Wireframe používá skicovitý font a světlé pozadí — v implementaci zachovej tmavý MUI dark theme.

---

## Barvy (z existujícího theme)

| Účel | CSS var | Hex |
|---|---|---|
| Výroba (zelená tečka) | `--chart-5` | `#34d399` |
| Spotřeba (červená tečka) | `--color-destructive` | `#ef4444` |
| Aktivní badge | `--color-primary` (amber) | `#f5a524` |
| Chybějící data (šedá tečka) | `--color-muted-foreground` | `#c8c3b6` |
