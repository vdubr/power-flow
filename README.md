# Solar Analytics

Webová aplikace pro analýzu dat z chytrého elektroměru ČEZ Distribuce pro domácnost s fotovoltaickou elektrárnou. Umožňuje vizualizaci spotřeby/výroby, srovnání více let a simulaci virtuální baterie různých kapacit.

## Funkce

- **Import CSV** z portálu ČEZ Distribuce (kódování Windows-1250, oddělovač `;`, 15minutové intervaly v kW)
  - Hlavičky `+A/XXXXXXXX [kW]` (odběr ze sítě) nebo `-A/XXXXXXXX [kW]` (přetoky do sítě)
  - Alternativní formát `a+` / `a-`
  - Podpora více souborů pro různé roky
- **Agregace dat**: raw / denní / týdenní / měsíční / den-noc (podle solárního výpočtu nebo manuálního rozpětí)
- **Multi-year comparison** – data z různých let se normalizují na stejnou časovou osu
- **Statistiky** – celková spotřeba/výroba, průměry, maxima, poměr dostupnosti přebytků
- **Simulace virtuální baterie**
  - Konfigurovatelná kapacita, maximální hloubka vybití, minimální rezerva
  - Výpočet redukce dokupu ze sítě, roční úspory, cyklování baterie
  - Detekce „ostrovních“ dnů (den bez potřeby dokupu ze sítě)
  - Měsíční analýza uložené a spotřebované energie z baterie
- **Tmavý motiv** (primární barva oranžová #ff9800)

## Datový model

ČEZ data reprezentují **bilanci vůči síti**, ne celkovou výrobu/spotřebu domácnosti:
- `consumption` = energie odebraná ze sítě
- `production` = přetoky do sítě (přebytek FVE)

V jednom 15minutovém intervalu je typicky nenulová jen jedna z těchto hodnot. Simulace baterie tuto bilanci používá pro rozhodnutí o (vir­tuálním) nabíjení/vybíjení: přetoky → nabití, odběr → vybití.

Hodnoty v kW se při importu převádějí na kWh vynásobením 0,25 (15 minut).

## Technologie

- [Vite](https://vite.dev) + React 19 + TypeScript
- [Material UI v7](https://mui.com) – UI, tmavé téma
- [Apache ECharts](https://echarts.apache.org) – grafy (přes `echarts-for-react`)
- [Zustand](https://github.com/pmndrs/zustand) – state management
- [suncalc](https://github.com/mourner/suncalc) – výpočet svítání/západu pro agregaci den/noc
- [Vitest](https://vitest.dev) – testy

## Vývoj

```bash
npm install
npm run dev          # dev server
npm run build        # produkční build
npm run test         # testy v watch módu
npm run test:run     # testy jednou
npm run lint         # ESLint
```

Dev server běží na `http://localhost:5173/` (Vite si při obsazeném portu vybere jiný).

### Struktura projektu

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
│   └── energyStore.ts   # Zustand store (data + simulace baterie)
├── types/
│   └── energy.ts        # všechny TS typy
├── utils/
│   ├── batteryAlgorithm.ts
│   ├── csvParser.ts
│   ├── dataAggregation.ts
│   ├── dateUtils.ts     # date helpers (lokální čas, NE UTC)
│   └── sunCalculations.ts
└── __tests__/           # unit testy (Vitest)
```

### Poznámka k práci s datumy

**Nikdy nepoužívej `Date.prototype.toISOString()` pro generování klíčů skupin podle dne.** Tato metoda převádí na UTC a v lokální časové zóně s kladným offsetem (CET/CEST) může půlnoční interval skončit v předchozím dni (či dokonce předchozím roce).

Vždy používej helpery z `src/utils/dateUtils.ts`:

```ts
import { formatLocalDateKey, formatLocalMonthKey, parseLocalDateKey } from './utils/dateUtils';

formatLocalDateKey(new Date(2023, 0, 1, 0, 15)); // "2023-01-01" (ne "2022-12-31"!)
```

## Testy

Spouštění:

```bash
npm run test:run
```

Aktuálně pokrytí:
- `csvParser.test.ts` – dekódování Windows-1250, detekce typu dat, parsování čísel/datumů
- `batteryAlgorithm.test.ts` – simulace, edge cases (prázdná data, plná baterie, off-grid dny)
- `dataAggregation.test.ts` – agregace po dnech/týdnech/měsících, den/noc
- `dateUtils.test.ts` – správné lokální formátování klíčů

## Deployment

Projekt je připravený pro Vercel (propojit GitHub repo `vdubr/power-flow`, automaticky detekuje Vite).
