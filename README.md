# Solar Analytics

Webová aplikace pro majitele fotovoltaiky, kteří se rozhodují, **zda a jakou baterii koupit**. Nahrajete dva CSV exporty z portálu ČEZ Distribuce, aplikace ukáže spotřebu a výrobu a spočítá, jaká kapacita baterie by se vám vyplatila. Data se nikam neodesílají, vše běží v prohlížeči.

## Co aplikace dělá

1. **Import** CSV z ČEZ Distribuce (Windows-1250, oddělovač `;`, 15minutové intervaly v kW)
   - hlavičky `+A/XXXXXXXX [kW]` (odběr ze sítě) nebo `-A/XXXXXXXX [kW]` (přetoky do sítě), alternativně `a+` / `a-`
   - více souborů a více let najednou
   - hlásí, kolik řádků se nepodařilo přečíst a kolik intervalů ČEZ označil jako neplatné měření
2. **Zobrazení bilance** – graf s agregací raw / hodinovou / denní / týdenní / měsíční / den-noc, TOP dny, porovnání let, výběr období tažením v grafu
3. **Doporučení kapacity baterie** – hlavní výstup: simulace celého rozsahu 2–30 kWh a doporučení v koleni křivky úspor, včetně grafu, který volbu dokládá
4. **Simulace „co kdyby"** – kapacita, hloubka vybití, účinnost, rezerva, cena elektřiny a výkupní cena

Podrobná specifikace uživatele a jeho otázek je v [docs/UZIVATEL-A-POTREBY.md](docs/UZIVATEL-A-POTREBY.md), revize repozitáře a plán prací v [docs/REVIZE-A-PLAN.md](docs/REVIZE-A-PLAN.md).

## Datový model

Toto je nejdůležitější část k pochopení celé aplikace.

### Data jsou bilance vůči síti, ne výroba a spotřeba domu

- `consumption` = energie **odebraná ze sítě** (kWh)
- `production` = energie **dodaná do sítě**, tedy přetok fotovoltaiky (kWh)

V jednom 15minutovém intervalu je typicky nenulová jen jedna z hodnot. Z těchto dat **nelze** spočítat skutečnou výrobu fotovoltaiky ani celkovou spotřebu domácnosti, a tedy ani soběstačnost v běžném smyslu. Aplikace proto žádnou takovou metriku netvrdí.

### Timestamp označuje konec intervalu

ČEZ zapisuje čas **konce** měřicího intervalu:

| Formát | První řádek dne | Poslední řádek roku |
| --- | --- | --- |
| `a+` / `a-` | `01.01.2022 00:15` | `01.01.2023 00:00` |
| `+A/… [kW]` | `01.01.2025 00:15:00` | `31.12.2025 24:00:00` |

Aplikace si timestamp **interně posouvá na začátek intervalu** (`intervalStart()` v `src/utils/csvParser.ts`). Bez toho by každý den dostal 15 minut z předchozího dne a poslední řádek roku by vytvořil fantomový rok s jediným záznamem. Hodina `24:00` se normalizuje na půlnoc následujícího dne; v novějším formátu je to jeden řádek denně, tedy 365 řádků ročně, které se dřív zahazovaly.

### Převod na energii

Hodnota ve sloupci je průměrný výkon v kW za interval. Energie = výkon / `INTERVALS_PER_HOUR` (= 4), tedy × 0,25.

### Duplicitní hodina při změně času

Při přechodu na zimní čas exportuje ČEZ 02:00–02:45 dvakrát. JavaScript obě varianty mapuje na stejný okamžik, proto se hodnoty **sčítají**. Roční součet tak odpovídá součtu sloupce v CSV.

## Metriky a co znamenají

| Metrika v UI | Výpočet | Za jaké období |
| --- | --- | --- |
| Celková spotřeba | součet odběru ze sítě | aktivní rozsah |
| Celková výroba | součet dodávky do sítě | aktivní rozsah |
| Poměr dodávky k odběru | `min(100, dodávka / odběr × 100)` | aktivní rozsah |
| Úspora za rok | `(ušetřený nákup − ušlý výkup) × 365 / počet dnů` | přepočteno na rok |
| Doporučená kapacita | koleno křivky úspora–kapacita | aktivní rozsah |
| Dny bez dokupu | dny s nulovým odběrem, oddělené od dnů, které by takové byly i bez baterie | aktivní rozsah |
| Pokrytí odběru baterií | `snížení odběru / původní odběr`, vážené energií | aktivní rozsah |

**Aktivní rozsah** je jediná podmnožina dat, se kterou pracuje graf, statistiky i simulace baterie současně. Přepíná se v ovládacím prvku v hlavičce sekcí: vybrané roky, poslední rok, nebo výseč vybraná tažením v grafu.

**Roční úspora** odečítá ušlý příjem z přetoků: energie uložená do baterie se už neprodá za výkupní cenu. Simulace také počítá s účinností baterie (výchozí 90 %), takže z ní vyjde méně, než do ní vešlo.

**Doporučení kapacity** vzniká simulací celého rozsahu 2–30 kWh po 0,5 kWh. Úspora s kapacitou nejdřív strmě roste a pak se láme; doporučená velikost leží v tomto koleni, které se hledá jako bod nejvzdálenější od spojnice krajních bodů křivky. Nemá volný parametr a padne tam, kde další kWh baterie přestává vydělávat.

## Technologie

- [Vite](https://vite.dev) + React 19 + TypeScript
- [Material UI v7](https://mui.com) + Emotion, tmavý „solar observatory" motiv
- [Apache ECharts](https://echarts.apache.org) přes `echarts-for-react`
- [Zustand](https://github.com/pmndrs/zustand) pro stav
- [suncalc](https://github.com/mourner/suncalc) pro východ a západ slunce
- [Vitest](https://vitest.dev) + Testing Library

## Vývoj

```bash
npm install
npm run dev            # dev server na http://localhost:5173
npm run build          # tsc -b && vite build
npm run lint           # ESLint
npm run test:run       # testy jednou
npm run test           # testy ve watch módu
npm run test:coverage  # testy s reportem pokrytí
```

Po každé změně: `npm run lint && npm run build && npm run test:run`. Totéž hlídá CI (`.github/workflows/ci.yml`) na každém push a pull requestu.

### Struktura projektu

```
src/
├── components/
│   ├── Chart/           # hlavní graf a jeho ovládání
│   ├── Common/          # sdílené dlaždice, hlavičky sekcí, přepínač rozsahu
│   ├── Configuration/   # formuláře nastavení (baterie, den/noc)
│   ├── DataImport/      # drop zóna, odznaky roků, návod, ukázková data
│   ├── Layout/          # hlavička a shell aplikace
│   └── Statistics/      # statistiky, doporučení kapacity, analýza baterie
├── hooks/
│   └── useSmoothWheelZoom.ts
├── store/
│   └── energyStore.ts   # data, aktivní rozsah, simulace, doporučení
├── theme/               # MUI téma a ECharts téma „observatory"
├── types/
│   └── energy.ts        # všechny TS typy
├── utils/
│   ├── batteryAlgorithm.ts    # simulace, křivka kapacity, doporučení
│   ├── batteryChartOptions.ts # ECharts options pro obrazovku baterie
│   ├── chartSeriesBuilder.ts  # sestavení sérií hlavního grafu
│   ├── csvParser.ts           # parsování exportu ČEZ
│   ├── dataAggregation.ts     # agregace, TOP dny, filtr rozsahu
│   ├── dateUtils.ts           # klíče podle lokálního času, NE UTC
│   ├── energyData.ts          # spojení odběru a dodávky, statistiky roku
│   ├── format.ts              # veškeré formátování čísel v cs-CZ
│   ├── sunCalculations.ts
│   └── zoomMath.ts
└── __tests__/           # testy (Vitest)
```

### Pravidla pro práci s kódem

**Datumy.** Nikdy nepoužívej `Date.prototype.toISOString()` pro klíče skupin podle dne. Převádí na UTC a v CET/CEST může půlnoční interval spadnout do předchozího dne. Používej helpery z `src/utils/dateUtils.ts`:

```ts
import { formatLocalDateKey, formatLocalMonthKey, parseLocalDateKey } from './utils/dateUtils';
formatLocalDateKey(new Date(2023, 0, 1, 0, 15)); // "2023-01-01"
```

**Čísla.** Všechno, co uvidí uživatel, formátuj přes `src/utils/format.ts`. Přímé `toFixed()` ani `toLocaleString()` v komponentách nepatří, jinak vedle sebe skončí „4.8 MWh" a „35 036".

**Barvy.** Žádné hexy ani `rgba()` v komponentách. Barvy patří do CSS tokenů v `src/index.css`, do MUI tématu a do `CHART_PALETTE` v `src/theme/echartsTheme.ts`.

**Nový scénář.** Když přidáš chování, které si uživatel může všimnout, přidej řádek do `docs/UZIVATEL-A-POTREBY.md` a odpovídající test do `src/__tests__/userScenarios.test.ts`.

## Testy

```bash
npm run test:run
npx vitest run src/__tests__/userScenarios.test.ts --reporter=verbose
```

`userScenarios.test.ts` obsahuje akceptační scénáře U1–U11 nad **reálnými** ukázkovými exporty z `public/sample-data/`, včetně nezávislé kontroly, že roční součty odpovídají součtu sloupce v CSV. Ostatní soubory pokrývají parser, agregace, simulaci baterie, formátování, store a komponenty.

Časová zóna testů je připnutá na `Europe/Prague` (`vite.config.ts`), aby testy kolem přechodů letního času nezávisely na stroji, kde běží.

## Ukázková data

`public/sample-data/2022` a `2025` jsou skutečné exporty (35 040 řádků na soubor) v obou formátech, které ČEZ produkuje. Jsou verzované s `-text` v `.gitattributes`, aby zůstaly bajtově věrné, včetně CRLF a kódování Windows-1250.

## Deployment

Projekt je připravený pro Vercel: propojit GitHub repozitář, Vite se detekuje automaticky.
