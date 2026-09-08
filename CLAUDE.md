# Solar Analytics – Claude Instructions

## Projekt

Aplikace pro majitele fotovoltaiky, kteří se rozhodují, zda a jakou baterii koupit. Nahraje CSV z ČEZ Distribuce, zobrazí spotřebu a výrobu a doporučí kapacitu baterie. Vše běží v prohlížeči, data se nikam neodesílají.

**Primární potřeba uživatele:** „Nahraju data. Zobrazím si spotřebu a výrobu. Aplikace mi pomůže vyhodnotit, jaká baterie a s jakou kapacitou by pro mě byla vhodná." Doporučení kapacity je hlavní výstup, vše ostatní je podpůrné.

Kontext, na který se odkazuj před větší změnou:
- `docs/UZIVATEL-A-POTREBY.md` – kdo je uživatel, otázky U1–U11, akceptační scénáře
- `docs/REVIZE-A-PLAN.md` – revize repozitáře a plán prací
- `README.md` – datový model a význam metrik
- `DESIGN.md` – design systém

## Tech stack

- **Framework:** Vite + React 19 + TypeScript
- **UI:** MUI v7 (`@mui/material`) + Emotion
- **Grafy:** ECharts via `echarts-for-react`, téma `observatory`
- **State:** Zustand (`src/store/energyStore.ts`)
- **Testy:** Vitest + Testing Library, časová zóna připnutá na Europe/Prague
- **Fonty:** IBM Plex Sans (body), Fraunces (display), IBM Plex Mono (mono)

## Příkazy

```bash
npm run dev          # dev server (http://localhost:5173)
npm run build        # tsc -b && vite build
npm run lint         # ESLint
npm run test:run     # testy jednou
npm run test:coverage
```

Po každé změně spusť `npm run lint && npm run build && npm run test:run`.

## KRITICKÉ: datový model

**Data z ČEZ jsou bilance vůči síti, ne výroba a spotřeba domu.** `consumption` je odběr ze sítě, `production` jsou přetoky do sítě. Skutečnou výrobu fotovoltaiky ani celkovou spotřebu domácnosti z nich spočítat nelze. Nikdy nepojmenovávej metriku tak, aby tvrdila něco jiného (proto se v UI neobjevuje „soběstačnost").

**Timestamp v CSV označuje konec intervalu.** Parser ho posouvá na začátek (`intervalStart()`), jinak vzniká fantomový rok a každý den je posunutý o 15 minut. Hodina `24:00` se normalizuje na půlnoc dalšího dne.

**Aktivní rozsah.** `selectActiveRecords()` ve storu určuje podmnožinu dat pro graf, statistiky i simulaci baterie současně. Nikdy nenech komponentu číst `allRecords` přímo, pokud nemá dobrý důvod — panely by si přestaly odpovídat.

**Roční hodnoty** se normalizují počtem skutečně pokrytých dnů (`DAYS_PER_YEAR / daysSimulated`). Dva nahrané roky nesmí zdvojnásobit „roční úsporu".

## KRITICKÉ: práce s datumy

**Nikdy nepoužívej `Date.prototype.toISOString()` pro klíče skupin podle dne.** Převádí na UTC, v CET/CEST může půlnoční interval spadnout do předchozího dne.

```ts
import { formatLocalDateKey, formatLocalMonthKey, parseLocalDateKey } from './utils/dateUtils';
formatLocalDateKey(new Date(2023, 0, 1, 0, 15)); // "2023-01-01"
```

## Formátování čísel

Všechno, co uvidí uživatel, jde přes `src/utils/format.ts` (`formatEnergy`, `formatKwh`, `formatCurrency`, `formatPercent`, `formatCount`, `formatDate`, `formatDays`…). V komponentách ani v ECharts formatterech nepiš `toFixed()` ani `toLocaleString()` — jinak se v UI potkají „4.8 MWh" a „35 036".

## Design systém

Vždy dodržuj pravidla z `@DESIGN.md`. Projekt používá dark-first „solar observatory" styl.

- Používej CSS tokeny (`--color-*`, `--chart-*`) a utility třídy (`.paper-card`, `.glass-panel`, `.blueprint-surface`, `.observatory-bg`, `.micro-label`)
- **Žádné hexy ani `rgba()` v komponentách.** Barvy patří do `src/index.css`, `src/theme/index.ts` a `CHART_PALETTE` v `src/theme/echartsTheme.ts`
- ECharts obaluj v `.blueprint-surface` a používej `theme="observatory"`
- Ke každému grafu patří textová alternativa pro čtečky (skrytá tabulka nebo `aria-label`)
- Ovládací prvky musí fungovat i na dotyku — žádná akce jen na `:hover`

## Struktura projektu

```
src/
├── components/
│   ├── Chart/           # hlavní graf a ovládání
│   ├── Common/          # sdílené dlaždice a přepínač rozsahu
│   ├── Configuration/   # formuláře nastavení (baterie, den/noc)
│   ├── DataImport/      # import, odznaky roků, návod
│   ├── Layout/
│   └── Statistics/      # statistiky, doporučení kapacity, baterie
├── hooks/
├── store/energyStore.ts
├── theme/
├── types/energy.ts
├── utils/               # parser, agregace, baterie, formátování
└── __tests__/
```

## Pravidla pro práci

### Odpovědi
- Stručně a k věci, pokud uživatel nevyžaduje jinak
- Komunikace česky, komentáře v kódu anglicky

### Plánování
- Vždy se zeptej na upřesňující otázky před implementací
- Nikdy nepředpokládej design, tech stack ani funkce

### Implementace
- Pokud možno deleguj na sub-agenty, sám vystupuj jako koordinátor
- Paralelizuj nezávislé změny, ale vymez agentům disjunktní sady souborů
- Po dokončení vždy spusť: `npm run lint && npm run build && npm run test:run`

### Testování
- Vždy testuj změny, nikdy nepředpokládej, že kód prostě funguje
- Testy jsou v `src/__tests__/`, framework Vitest
- **Nikdy nefixuj chybné chování testem jako záměr.** Pokud narazíš na chybu, kterou zatím neopravuješ, napiš test, který asertuje správné chování, a označ ho `it.fails` s odkazem na nález v `docs/REVIZE-A-PLAN.md`
- Nové chování viditelné uživateli = řádek v `docs/UZIVATEL-A-POTREBY.md` + scénář v `src/__tests__/userScenarios.test.ts`
- Ukázková data v `public/sample-data/` jsou skutečné exporty; testuj nad nimi, ne jen nad vymyšlenými záznamy
