# Solar Analytics – Claude Instructions

## Projekt

Webová aplikace pro analýzu dat z chytrého elektroměru ČEZ Distribuce pro domácnost s FVE.
Importuje CSV soubory (Windows-1250, oddělovač `;`, 15minutové intervaly v kW), zobrazuje spotřebu/výrobu, umožňuje multi-year srovnání a simulaci virtuální baterie.

## Tech stack

- **Framework:** Vite + React 19 + TypeScript
- **UI:** MUI v7 (`@mui/material`) + Emotion
- **Grafy:** ECharts via `echarts-for-react`
- **State:** Zustand (`src/store/energyStore.ts`)
- **Testy:** Vitest + Testing Library
- **Fonty:** IBM Plex Sans (body), Fraunces (display), IBM Plex Mono (mono)

## Příkazy

```bash
npm run dev          # dev server (http://localhost:5173)
npm run build        # tsc -b && vite build
npm run lint         # ESLint
npm run test:run     # testy jednou
npm run test         # testy ve watch módu
npm run test:coverage
```

Po každé změně spusť `npm run lint && npm run build && npm run test:run`.

## Struktura projektu

```
src/
├── components/
│   ├── Chart/           # hlavní graf spotřeby/výroby
│   ├── Configuration/   # nastavení baterie, den/noc, lokalita
│   ├── DataImport/      # upload + parsování CSV
│   ├── Layout/          # hlavní layout aplikace
│   └── Statistics/      # statistiky, analýza baterie
├── hooks/
├── store/
│   └── energyStore.ts   # Zustand store
├── types/
│   └── energy.ts        # všechny TS typy
├── utils/
│   ├── batteryAlgorithm.ts
│   ├── csvParser.ts
│   ├── dataAggregation.ts
│   ├── dateUtils.ts     # date helpers – vždy lokální čas, NE UTC
│   └── sunCalculations.ts
└── __tests__/
```

## KRITICKÉ: Práce s datumy

**Nikdy nepoužívej `Date.prototype.toISOString()` pro generování klíčů skupin podle dne.**
Tato metoda převádí na UTC, v CET/CEST může půlnoční interval skončit v předchozím dni.

Vždy používej helpery z `src/utils/dateUtils.ts`:

```ts
import { formatLocalDateKey, formatLocalMonthKey, parseLocalDateKey } from './utils/dateUtils';
formatLocalDateKey(new Date(2023, 0, 1, 0, 15)); // "2023-01-01"
```

## Design systém

Vždy dodržuj pravidla z `@DESIGN.md`. Projekt používá dark-first "solar observatory" vizuální styl.

- Používej CSS custom properties (`--color-*`) a utility třídy (`.paper-card`, `.glass-panel`, `.blueprint-surface`, `.observatory-bg`)
- Nepoužívej hardcoded barvy – vždy přes CSS tokeny nebo MUI téma
- Výchozí motiv je **dark**; přepínání přes `data-theme` atribut na `<html>`
- ECharts vždy obaluj v `.blueprint-surface` a používej `theme="observatory"`

## Pravidla pro práci

### Odpovědi
- Stručně a k věci, pokud uživatel nevyžaduje jinak

### Plánování
- Vždy se zeptej na upřesňující otázky před implementací
- Nikdy nepředpokládej design, tech stack ani funkce

### Implementace
- Pokud možno deleguj na sub-agenty, sám vystupuj jako koordinátor
- Paralelizuj nezávislé změny
- Po dokončení vždy spusť: `npm run lint && npm run build && npm run test:run`

### Testování
- Vždy testuj změny – nikdy nepředpokládej, že kód prostě funguje
- Testy jsou v `src/__tests__/`, framework Vitest
