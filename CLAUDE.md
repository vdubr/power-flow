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

**Den a noc.** Rozhodnutí „byl v tomto okamžiku den?" dělá jen `createIsDayPredicate` v `src/utils/dayNight.ts`. Agregace, noční pásy v grafu i statistiky ho volají; nikdy nepiš druhou kopii podmínky. Den/noc není typ agregace, ale čtyřstavový přepínač `ChartConfig.consumptionSplit` (`sum` / `both` / `day` / `night`) na konci řádku spotřeby ve filtru pod grafem, který platí pro kterékoli zobrazení. `sum` a `both` kreslí stejné sloupce — `both` jen přidá rozpad do popisku u kurzoru; `day` a `night` data v grafu i v popisku ořežou. Ruční okno hodin (`dayNightConfig.mode: 'manual'`) zůstává v typech a v `dayNight.ts` a používají ho testy, ale **nevede k němu žádné UI** — lokalitu vybírá chip v importním pruhu a „den" je vždy od východu do západu slunce. Nepiš dokumentaci ani texty, které ruční okno nabízejí uživateli.

**Překlopení je přepínač, ne stav.** „Spotřeba pod osu" (`ChartConfig.consumptionBelowAxis`, **výchozí vypnuto**) zrcadlí odebranou stranu pod nulu; zapnutá je pak spotřeba v datech sérií negativní (`ChartSeriesDef.plotSign` je `−1` u sérií pod nulou), vypnutá stojí obě veličiny nad nulou. Kód nikde nesmí předpokládat jednu z poloh — počítej vždy přes `plotSign`. **Nikdy nenech negativní kWh dojít do UI:** každé místo, které hodnotu ukazuje, ji nejdřív vynásobí `plotSign` (popisek u kurzoru, textová alternativa grafu) nebo vezme absolutní hodnotu tam, kde znaménko není z čeho odvodit (popisky osy Y, popisek průměru). Totéž platí pro zobrazení „Dokoupená energie" (`ChartConfig.chartMode: 'net'`): hodnota je spotřeba − výroba, kladné číslo znamená dokoupeno a kreslí se na tutéž stranu nuly jako spotřeba, tedy taky podle přepínače.

**Aktivní rozsah.** `selectActiveRecords()` ve storu určuje podmnožinu dat pro graf, statistiky i simulaci baterie současně. Nikdy nenech komponentu číst `allRecords` přímo, pokud nemá dobrý důvod — panely by si přestaly odpovídat.

**Výseč se odvozuje ze zoomu.** Rozsah, na který je graf přiblížený, *je* výseč (`rangeMode: 'selection'`); nástroj na tažení výseče v grafu není a nepřidávej ho. Zoom hlásí `setZoomRange` (se zdržením, protože rozsah vstupuje do simulace baterie) a sám režim nepřepíná — to udělá uživatel v `RangeControl`. Při porovnání více let sdílí roky jednu osu měsíc-den, takže jeden konkrétní časový rozsah neexistuje: `computeZoomDateRange` tam vrací `null` a popisek nad grafem vypíše názvy krajních kategorií. Nikdy z takového okna nedopočítávej datum.

**Zvýraznění série patří mimo `chartConfig`.** Ukázání na čip ve filtru zvýrazní odpovídající série v grafu a jména drží `highlightedSeries` přímo ve storu, ne ve `chartConfig`. `chartConfig` je vstup `recompute()`, a rozsah v něm rozhoduje o simulaci baterie i o křivce kapacity — stav, který se mění při každém pohybu myši, tam nepatří. Totéž platí pro každý další stav, který je jen o vzhledu grafu.

**Jméno a barva série.** Dělá je jen `chartSeriesName()` a `chartSeriesColor()` v `src/utils/chartSeriesBuilder.ts`. Volá je graf i filtr pod ním (`buildSeriesFilterChips`), protože `ChartConfig.hiddenSeries` drží právě tato jména — druhá kopie pravidla znamená, že filtr přestane skrývat. Skrytí série je **jen zobrazení**: aktivní rozsah, statistiky ani simulace se nemění.

**Výběr roků** je jen v odznacích v „Import dat" (`YearBadge`). Nepřidávej druhý ovladač téhož stavu nikam jinam. Karta „Nastavení grafu" (`ChartControls`) už neexistuje: agregace a volba zobrazení jsou nad grafem, den/noc ve filtru pod ním, lokalita v chipu v importním pruhu (`DataImport/LocationChip`). Nové ovládání grafu patří k grafu, ne do nové karty nastavení.

**Porovnání jednotky napříč roky** (`buildUnitComparison`, týdenní a měsíční zobrazení) **záměrně ignoruje výběr roků** a počítá ze všech nahraných — smyslem je porovnat s roky, které nejsou v grafu. Rok bez barvy = graf ho nekreslí. Týden se na ose klíčuje **ISO číslem týdne** (`weekUnitId`), ne datem pondělí — to se rok od roku posouvá a roky by se proložily do samostatných pásů. Lednové a prosincové dny na přelomu roku mají vlastní pás na krajích osy (`W00`, `W54`); nepřilepuj je k sousednímu týdnu, nafoukly by krajní sloupec roku.

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
│   ├── Chart/           # graf, agregace, přepínač zobrazení, filtr sérií, celá obrazovka
│   ├── Common/          # sdílené dlaždice a přepínač rozsahu
│   ├── Configuration/   # formuláře nastavení (baterie)
│   ├── DataImport/      # import, odznaky roků, chip lokality, návod
│   ├── Layout/
│   └── Statistics/      # statistiky, doporučení kapacity, baterie
├── hooks/               # useFullscreen, useGlobalDropGuard, useSmoothWheelZoom
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
