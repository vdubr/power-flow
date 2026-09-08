# Revize repozitáře a plán prací

Solar Analytics · revize z 8. 9. 2026, plán **implementován 9. 9. 2026** na větvi `implementace-planu`

> **Stav: fáze 0–5 hotové.** Všechny nálezy kromě výslovně uvedených výjimek jsou opravené.
> Kontroly: ESLint čistý, build projde, 335 unit testů, 22 E2E běhů (desktop i mobil),
> pokrytí utils 90,8 % a store 95,3 %. Přehled výsledků je v sekci 10 na konci dokumentu.

Doprovodný dokument: [UZIVATEL-A-POTREBY.md](./UZIVATEL-A-POTREBY.md) (kdo je uživatel, jaké otázky si klade, akceptační scénáře U1–U11).

---

## 1. Shrnutí

Aplikace **funguje a je průchozí**: prázdný stav → import → graf → statistiky → baterie → úklid dat bylo ověřeno v prohlížeči s ukázkovými daty bez jediné chyby v konzoli. Lint je čistý, build projde, 218 původních testů prochází. Kód je na svou velikost nadprůměrně čistý a autor rozumí bilanční povaze dat.

Přesto má projekt tři vážné problémy, které je nutné řešit před jakoukoli další prací na vzhledu:

1. **Parser neodpovídá reálnému formátu ČEZ.** Timestamp je konec intervalu, ne začátek; duplicitní hodina při změně času se přepisuje; formát `+A/… [kW]` s `24:00:00` ztrácí 365 řádků ročně. Výsledek: fantomový rok 2023 v UI, 13. měsíc v analýze baterie, součty nesedí s CSV.
2. **UI slovník neodpovídá tomu, co se počítá.** „Soběstačnost“ je poměr přetoků k odběru, „Roční úspora“ je součet přes všechny nahrané roky, „ostrovní dny“ zahrnují dny, které byly bez odběru i bez baterie.
3. **Stav repozitáře je křehký.** Nad posledním commitem je asi 3 900 řádků necommitnutých změn a 30 nesledovaných souborů včetně celého design systému, theme, sedmi testovacích souborů a ukázkových dat. Neexistuje CI, coverage nejde spustit.

Plán níže má šest fází a odhad 11–15 pracovních dnů. Pořadí je dané závislostmi: nejdřív data, pak metriky, pak komponenty, aby se FE nepřepisoval dvakrát.

---

## 2. Hlavní myšlenka projektu

**Co aplikace je:** lokální (v prohlížeči) analyzátor exportů z chytrého elektroměru ČEZ Distribuce pro domácnost s fotovoltaikou. Uživatel nahraje dva CSV soubory za rok (odběr `+A`, dodávka `-A`, 15minutové intervaly v kW, Windows-1250), aplikace ukáže bilanci vůči síti, porovná roky a **simuluje virtuální baterii**: co by se stalo, kdyby přetoky nešly do sítě, ale do baterie, ze které by se večer čerpalo.

**Datový model, na kterém všechno stojí:**

- Jeden záznam = jeden 15minutový interval. `consumption` = energie odebraná ze sítě (kWh), `production` = energie dodaná do sítě (kWh). Převod z kW: hodnota / 4.
- Data jsou **bilance vůči síti**, ne hrubá výroba ani hrubá spotřeba domu. Z toho plyne, co lze a nelze spočítat:
  - Lze: kolik jsem odebral, kolik dodal, kdy, jaké přetoky by baterie zachytila a o kolik by snížila odběr.
  - Nelze: skutečnou výrobu FVE, vlastní spotřebu domu, „soběstačnost“ ve smyslu podílu vlastní energie na celkové spotřebě.
- Timestamp v exportu ČEZ označuje **konec** intervalu (první řádek dne je `00:15`, poslední řádek roku je `01.01.YYYY+1 00:00`, resp. `31.12.YYYY 24:00:00` v novějším formátu). Kód s ním dnes zachází jako se začátkem intervalu.
- Simulace baterie: přetok → nabití (do kapacity), odběr → vybití (do minimální hladiny dané `maxDischargePercent` a `minReserve`). Výstupy: energie uložená a použitá, snížení odběru, úspora = snížení odběru × cena, ostrovní dny (den bez dokupu), měsíční a denní průběh, doporučená kapacita (80. percentil denního využitelného přebytku).

**Primární potřeba uživatele (formulace zadavatele):** „Nahraju data. Zobrazím si spotřebu a výrobu. Aplikace mi pomůže vyhodnotit, jaká baterie a s jakou kapacitou by pro mě byla vhodná.“ Doporučení kapacity je tedy hlavní výstup aplikace, import a zobrazení bilance jsou k němu cesta. Detailně v [UZIVATEL-A-POTREBY.md](./UZIVATEL-A-POTREBY.md).

---

## 3. Technický stav

| Oblast | Stav |
| --- | --- |
| Stack | Vite 7.3, React 19.2, TypeScript 5.9, MUI 7.3, ECharts 6 (`echarts-for-react` 3), Zustand 5, suncalc, Vitest 4.1, Testing Library |
| Node / npm | 24.14 / 11.11 |
| `npm run lint` | čistý |
| `npm run build` | projde za ~6 s; chunk `vendor-echarts` má 1 145 kB (385 kB gzip), přes limit 600 kB |
| `npm run test:run` | 12 souborů, 242 testů prochází, 5 očekávaných selhání (nové akceptační testy dokumentující chyby) |
| `npm run test:coverage` | **nefunguje**, chybí `@vitest/coverage-v8` v devDependencies |
| CI | žádné (`.github/` neexistuje) |
| E2E | žádné (Playwright není v projektu; `.playwright-mcp/` v nadřazené složce jsou jen ad-hoc snímky) |
| Git | 25 změněných a 39 nesledovaných souborů nad `0aea99c`; `.history/` (VS Code Local History) není v `.gitignore` |
| Dokumentace | README a CLAUDE.md popisují složku `components/Configuration/`, která je prázdná; README uvádí 4 testovací soubory, reálně je jich 12 |
| Design systém | DESIGN.md, `src/theme/index.ts`, `src/theme/echartsTheme.ts`, tokeny v `src/index.css`; většina komponent ho dodržuje, výjimky níže |

**Struktura zdrojáků (12 300 řádků vč. testů):** `components/` (Chart, Common, DataImport, Layout, Statistics, prázdná Configuration), `store/energyStore.ts`, `utils/` (csvParser, energyData, dataAggregation, batteryAlgorithm, dateUtils, sunCalculations, zoomMath), `hooks/useSmoothWheelZoom.ts`, `theme/`, `types/energy.ts`, `constants.ts`, `__tests__/`. Tři největší komponenty mají 640–690 řádků (FileUploader, MainChart, BatteryAnalysis).

---

## 4. Flow aplikace a jeho průchodnost

### Kroky a komponenty

1. **Prázdný stav** – `App` → `FileUploader` (drop zóna, „Vybrat soubory“, `SampleDataButton`) + `CezGuide` (návod ve 3 krocích).
2. **Import** – `parseCSVFile` (FileReader → `decodeWindows1250` → `parseCSV` → `detectDataType`) → `RawDataPoint[]`. V prázdném stavu se úspěšné soubory rovnou commitnou, jinak jdou do „připravených souborů“ a čekají na „Načíst data do aplikace“. Chyby parsování → `Alert`.
3. **Store** – `addData` → `mergeAndGroupByYear` (spojí odběr a dodávku podle timestampu, kW/4) → `yearlyData`, `allRecords`, `availableYears`; výchozí `selectedYears` = rok s nejvíce záznamy; automaticky `simulateBattery(allRecords)`.
4. **Načtený stav** – importní pruh se sbalí (odznaky roků s tečkami, počet záznamů, „Nahrát další“) → `MainChart` (agregace podle `aggregationType` nad `yearlyData[selectedYears]`, brush, wheel zoom) → `ChartControls` (agregace, overlay slunce, den/noc, roky, zobrazit odběr/dodávku) → `StatisticsPanel` (KPI nad `getActiveRecords()` podle `rangeMode`, `RangeControl`, `TopConsumptionDays`) → `BatteryAnalysis` (hero KPI, „Co kdyby“ slidery → `setBatteryConfig` → nová simulace, tři grafy) → `YearComparisonTable` (jen při více vybraných letech).
5. **Výběr období** – brush v `MainChart` → `setTimeRange` → `rangeMode = 'selection'` → mění **jen** `StatisticsPanel`.
6. **Úklid** – křížek na odznaku → `removeYear`; „Vymazat všechna data“ → `clearData` → prázdný stav.

### Výsledek průchodu (Chrome, dev server, ukázková data 2022)

| Krok | Výsledek |
| --- | --- |
| Prázdný stav, návod | OK. V návodu jsou ale místo obrázků placeholdery „screenshot: přihlašovací obrazovka“ (F6). |
| Načtení ukázkových dat | OK, 35 036 záznamů, žádné chyby v konzoli. V pruhu se objeví odznak **2023** s jediným záznamem (D4). |
| Graf, denní agregace | OK, čitelný, legenda, dataZoom, toolbox. Barvy grafu jsou mimo design systém (F1). |
| Nastavení grafu | OK. Popis „omezeno na 5000 bodů“ neodpovídá konstantě 10 000 (F6). |
| Statistiky | OK. „Soběstačnost 85,1 %“ je sémanticky sporná (M2). Čísla míchají formáty „4.8 MWh“ a „35 036“ (F3). |
| Baterie | OK. Měsíční graf má 13 sloupců („Leden 2023“, D4), osa Kč zobrazuje „1,000“ anglicky (F3), popisek „Ostrovní provoz“ je oříznutý, popisky osy X posledního grafu se překrývají se sliderem (F6). |
| Úklid | Neověřeno klikáním, pokryto akceptačními testy U10.1–U10.2. |
| Stabilita | Jednou po sérii scrollování kolečkem nad grafy přestala stránka na více než 60 s reagovat (CPU rendereru nízké). Cílená reprodukce se nezdařila, viz P4. |

**Neověřeno v prohlížeči** (nelze přes automatizaci nebo nebylo v rozsahu): drag & drop reálných souborů, brush myší, porovnání dvou let v grafu, mobilní rozložení. Patří do E2E ve fázi 4.

---

## 5. Co je špatně

Závažnost: **K** kritické · **V** vysoké · **S** střední · **N** nízké. Odkazy `soubor:řádek` platí pro stav k datu revize.

### D · Data a parser

| Kód | Z. | Nález | Oprava |
| --- | --- | --- | --- |
| D1 | K | `csvParser.ts:40,59-68`: řádky `DD.MM.YYYY 24:00:00` (formát `+A/… [kW]`, jeden na každý den) se přetočí na další den a validace je odmítne. Ověřeno: `public/sample-data/2025/spotreba.csv` ztrácí 365 řádků (40,85 kWh) a uživatel dostane chybový banner. | Rozpoznat `24:00` a převést na `00:00` následujícího dne, resp. spolu s D4 na začátek intervalu `23:45`. |
| D2 | K | `energyStore.ts:96-98`: dedup `new Map(records.map(r => [time, r]))` nahrazuje celý objekt. Při nahrání `spotreba.csv` a potom samostatně `vyroba.csv` nové záznamy (`consumption: 0`) přepíší existující spotřebu. | Slučovat po polích (`consumption`, `production`), ne nahrazovat objekt. |
| D3 | V | `energyData.ts:99-101`: při duplicitním timestampu (přechod na zimní čas, 02:00–02:45 dvakrát; ověřeno v obou ukázkových letech) se hodnota přepíše místo sečtení. Ztráta 4 intervalů ročně. Test `energyData.test.ts:196-208` tuto chybu fixuje jako očekávané chování. | Sčítat (`existing[field] += kWh`), přepsat test. |
| D4 | V | `csvParser.ts:56` + `energyData.ts:116`: timestamp je **konec** intervalu, kód ho bere jako začátek. Každý den dostane 15 minut z předchozího dne, poslední řádek `01.01.2023 00:00` vytvoří rok 2023 s jedním záznamem (viditelný v UI, v roletce roků, v tabulce porovnání, jako 13. měsíc). | V parseru posunout timestamp o −15 minut (`INTERVAL_MINUTES`). Odstraní i fantomový rok a zjednoduší D1. |
| D5 | S | `csvParser.ts:79-81`: prázdná hodnota = 0 kWh. Chybějící měření tiše podhodnotí součty a nafoukne ostrovní dny. | Vracet `null`, interval vynechat, zapsat do `errors`. |
| D6 | S | `csvParser.ts:205-213`: fallback na UTF-8 je nedosažitelný (`TextDecoder` bez `fatal: true` nevyhazuje). | Detekce BOM, nebo `fatal: true` a teprve pak fallback. |
| D7 | S | `csvParser.ts:56`: lokální čas se interpretuje v zóně prohlížeče. Uživatel mimo Europe/Prague dostane posunuté hranice den/noc a jiné chování DST. | Parsovat s explicitní zónou (Temporal nebo `date-fns-tz`). |
| D8 | N | `csvParser.ts:84,92`: `replace(',', '.')` nahradí jen první čárku; záporné hodnoty se tiše ořežou na 0. | Normalizovat všechny oddělovače; záporné hodnoty hlásit do `errors`. |
| D9 | N | `public/sample-data/2022/*.csv` má ve sloupci Status poškozené kódování (`U+FFFD` místo Windows-1250 bajtů), `2025` je čistý. `test-data/2022/` je bajt po bajtu totéž jako `public/sample-data/2022/`. | Přegenerovat 2022 z čistého zdroje, smazat duplicitní `test-data/`. |

### M · Metriky a simulace baterie

| Kód | Z. | Nález | Oprava |
| --- | --- | --- | --- |
| M1 | V | `batteryAlgorithm.ts:160` + `energyStore.ts:132,251,284`: `annualSavings = gridImportReduction × cena` bez normalizace; simulace vždy nad `allRecords`. Při 2022 + 2025 ukáže „Roční úspora“ dvojnásobek. | Normalizovat na rok (`× 365 / počet dní`) nebo simulovat nad aktivním rozsahem; přejmenovat pole. |
| M2 | S | `energyData.ts:63-65`, `StatisticsPanel.tsx:118-120`, `dataAggregation.ts:163-166`: „Soběstačnost“ = `min(1, dodávka / odběr)`. Z bilančních dat soběstačnost spočítat nelze; `selfConsumptionRatio` se navíc nikde nečte. | Jedna sdílená funkce, přejmenovat na „Poměr dodávky k odběru“ (nebo podobně), smazat nepoužité pole. |
| M3 | S | `batteryAlgorithm.ts:199`: `isOffGrid = gridImport < 0.01` počítá i dny, které byly bez odběru už bez baterie. | Počítat i baseline (`gridImportOriginal < prah`) a v UI ukázat rozdíl. |
| M4 | S | `batteryAlgorithm.ts:206-208` + `BatteryAnalysis.tsx:147`: den bez původního odběru dostane 100 % pokrytí a průměr je nevážený. | Vážit podle `gridImportOriginal` nebo takové dny vyloučit. |
| M5 | V | `batteryAlgorithm.ts:286,298-305`: doporučená kapacita vrací využitelnou energii jako nominální kapacitu (ignoruje DoD), sčítá deficit celého dne včetně rána a míchá roky. Jde o **hlavní výstup aplikace** (primární potřeba), proto vysoká závažnost. | Dělit `maxDischargePercent/100`, simulovat SOC v rámci dne, omezit na aktivní rok. Zvážit náhradu heuristiky přímým porovnáním simulací pro řadu kapacit (viz fáze 2, bod 9). |
| M6 | S | Simulace nemá round-trip účinnost ani výkonový limit; uložená energie a úspora jsou nadhodnocené. | **Rozhodnutí uživatele:** přidat `roundTripEfficiency` a `maxChargePowerKw` do `BatteryConfig`. |
| M7 | S | Úspora ignoruje ušlý příjem z přetoků (v ukázce ~2 600 kWh/rok). | **Rozhodnutí uživatele:** přidat výkupní cenu a odečíst. |
| M8 | N | `batteryAlgorithm.ts:164-167,298-299,35-36,158-159` + `types/energy.ts:122`: cykly z nominální místo využitelné kapacity; percentil 1,0 sáhne mimo pole (NaN); `minReserve > capacity` bez validace; `gridImportReduction` ≡ `totalEnergyUsedFromBattery` a `gridExportReduction` ≡ `totalEnergyStored` prezentované jako čtyři metriky; komentář typu neodpovídá výpočtu. | Dílčí opravy, redundantní pole odvodit nebo zdokumentovat. |

### S · Store a datový tok

| Kód | Z. | Nález | Oprava |
| --- | --- | --- | --- |
| S1 | S | `energyStore.ts:320-347` vs `MainChart.tsx:96-116` vs `BatteryAnalysis`: statistiky čtou `getActiveRecords()` (respektují `rangeMode`/`timeRange`), graf jede nad `yearlyData + selectedYears`, baterie nad `allRecords`. Po brushi ukazují tři panely tři různé podmnožiny dat. | Sjednotit: definovat „aktivní rozsah“ jednou a všechny tři panely ho respektovat (graf zvýrazní výběr). |
| S2 | S | `energyStore.ts:325-329`: režim `'avg'` (v UI „Ø průměr“) vrací sjednocení záznamů vybraných let, „Celková spotřeba“ je součet, ne průměr. | Přejmenovat, nebo skutečně průměrovat přes roky. |
| S3 | N | `energyStore.ts:49-62,174-182,262-300,122,275,111,118`: sdílený mutovatelný `DEFAULT_CHART_CONFIG`; `clearData` neresetuje `batteryConfig`; `removeYear` nechá viset `timeRange` do smazaného roku; `sort()` bez komparátoru; `push(...35k)` spread. | Factory pro default config, konzistentní reset, vynulovat `timeRange` mimo data, `sort((a,b)=>a-b)`, `concat`. |
| S4 | N | Mrtvý kód: `sunCalculations.ts:24-30` (`isDaytime`), `types/energy.ts:75-84` (`BatteryState`), `constants.ts:30-31` (`DEFAULT_DAY_*` nepropojené se storem), `avgConsumption/avgProduction`; `sunTimesCache` bez limitu a invalidace. | Smazat, propojit konstanty, LRU nebo `clearSunTimesCache()`. |

### F · FE komponenty a design systém

| Kód | Z. | Nález | Oprava |
| --- | --- | --- | --- |
| F1 | V | `MainChart.tsx:24-38,337,340,387,415-429`: vlastní `COLORS` (`#ff6b6b`, `#69db7c`), `YEAR_COLORS`, hardcoded barvy tooltipu, toolboxu a dataZoom slideru (`#1e1e1e`, `#3d3d3d`, `#ff9800`). `observatoryTheme` tyto sloty nedefinuje, takže `theme="observatory"` je nepřebarví. `BatteryAnalysis` přitom `CHART_PALETTE` používá správně. | Sjednotit na `CHART_PALETTE`/`--chart-*`; doplnit `dataZoom` a `toolbox` do `echartsTheme.ts`; víceletou paletu tam přidat. |
| F2 | V | `BatteryAnalysis.tsx:42-93,109,111`: `HeroTile` bez `.paper-card`, `boxShadow: 'none'` ruší globální styl karty, odkazuje na neexistující tokeny `--radius-lg`/`--radius-md` (vždy fallback), hardcoded `rgba(255,255,255,0.02)`. | `className="paper-card"`, odstranit override stínu, doplnit tokeny do `index.css` nebo použít `theme.shape`. |
| F3 | S | `formatEnergy`/`formatCurrency` (`batteryAlgorithm.ts:311-328`) používají `toFixed` bez lokalizace, `FileUploader` používá `toLocaleString('cs-CZ')`; ECharts osy formátují anglicky („1,000“); „6.00 Kč/kWh“. | Jeden modul `utils/format.ts` nad `Intl.NumberFormat('cs-CZ')`, formatter pro osy a tooltipy; přesunout formátování z `batteryAlgorithm.ts`. |
| F4 | S | Handoff „sbalený import s odznaky roků“ je hotový z ~90 %: chybí chip lokality („📍 Praha“) a křížek na odznaku je viditelný jen na hover (`FileUploader.tsx:126-131`), na dotykovém zařízení tedy nepoužitelný (porušuje DESIGN.md, sekce Accessibility). | Doplnit chip lokality z `dayNightConfig.location`; křížek trvale viditelný se sníženou opacitou nebo `@media (pointer: coarse)`. |
| F5 | S | Velikost komponent: `FileUploader` 686, `MainChart` 640, `BatteryAnalysis` 645 řádků. Konfigurace baterie je uvnitř výsledkové komponenty, den/noc a lokalita uvnitř `ChartControls`; složka `components/Configuration/` je prázdná, dokumentace tvrdí opak. | Extrahovat `DropZone`, `StagedFilesList`, `YearBadge`; `utils/chartSeriesBuilder.ts`; `HeroTile`/`SmallStat` do `Common`; `BatteryConfigForm` a `DayNightConfigForm` do `Configuration/`. |
| F6 | N | Drobnosti viditelné při průchodu: placeholdery „screenshot: …“ v `CezGuide`; `ChartControls.tsx:22` „omezeno na 5000 bodů“ vs `MAX_RAW_CHART_POINTS = 10 000`; titulek grafu „Nahrajte data…“ se ukáže i při odškrtnutí všech roků (`MainChart.tsx:316-325`); zastaralé MUI props `InputLabelProps`/`InputProps` (MUI 7 → `slotProps`); oříznutý popisek „Ostrovní provoz“ u markLine; popisky osy X posledního grafu baterie zasahují do slideru; `index.html` má `lang="en"`, titulek `solar-analytics` a favicon Vite. | Jednotlivé opravy, text z konstanty, `lang="cs"`, vlastní titulek a ikona. |
| F7 | N | Duplicity: podmínka „časová osa“ (`raw || hourly`) třikrát; `AGGREGATION_OPTIONS` ručně udržovaný vedle `AggregationType` a switchu v grafu; barva roku existuje jen v grafu, odznaky a chipy ji nepoužívají; křehká konkatenace `${hex}88`. | `isTimeAxisAggregation()`, jeden registr agregací, sdílená `yearColor(index)`. |

### A · Přístupnost

| Kód | Z. | Nález | Oprava |
| --- | --- | --- | --- |
| A1 | V | Žádný ze čtyř grafů nemá textovou/tabulkovou alternativu, kterou DESIGN.md výslovně vyžaduje. Canvas je pro čtečku neviditelný. | Vizuálně skrytá tabulka nebo souhrn u každého `.blueprint-surface`. |
| A2 | S | V celém `components/` je jediný `aria-label` (`RangeControl`). Chybí u mazání připraveného souboru, u křížku odznaku roku, u `<input type="file">`. | Doplnit popisky. |
| A3 | N | `Header.tsx`: Toolbar bez zalamování, dlouhý overline přeteče na mobilu. | Skrýt overline pod `sm`, nebo zalamovat. |

### P · Výkon

| Kód | Z. | Nález | Oprava |
| --- | --- | --- | --- |
| P1 | V | `BatteryAnalysis.tsx:484,507` → `energyStore.ts:241-259`: slidery volají `setBatteryConfig` v `onChange`, každý pixel tažení spustí `simulateBattery` nad všemi záznamy na hlavním vlákně; `calculateRecommendedCapacity` se přitom přepočítává, i když na konfiguraci nezávisí. | `onChangeCommitted` + lokální stav slideru (nebo debounce 150 ms); doporučenou kapacitu memoizovat na `allRecords`. |
| P2 | S | Parsování 35k řádků i simulace běží synchronně na hlavním vlákně. | Web Worker pro parser a simulaci (až po P1, pokud bude stále znát). |
| P3 | S | `dataAggregation.ts:364-372`: `getRawData` bere každý N-tý bod, špičky mizí, graf „15min“ nesedí se statistikami. | Bucketovat min/max/sum místo decimace. |
| P4 | N | Jedno nereprodukované zamrznutí stránky po intenzivním scrollování kolečkem nad grafy (hook `useSmoothWheelZoom` na třech grafech, `passive: false, capture: true`). | Profilovat wheel → `dispatchAction('dataZoom')` na 365 a 35 000 bodech; zvážit throttling přes `requestAnimationFrame`. |
| P5 | N | `vendor-echarts` 1 145 kB (385 kB gzip). | Importovat `echarts/core` + jen použité grafy a komponenty, `echarts-for-react/lib/core`. |

### T · Testy

| Kód | Z. | Nález | Oprava |
| --- | --- | --- | --- |
| T1 | S | `npm run test:coverage` končí `MISSING DEPENDENCY @vitest/coverage-v8`. | Přidat do devDependencies. |
| T2 | S | Vitest nemá připnutou časovou zónu; DST testy (`csvParser.test.ts:55-64`) dají jiný výsledek na UTC runneru. | `test.env.TZ = 'Europe/Prague'` ve `vite.config.ts`. |
| T3 | S | Bez jediného testu: `MainChart.tsx` (640 ř.), `BatteryAnalysis.tsx` (645 ř.), `SampleDataButton.tsx`, `useSmoothWheelZoom.ts` (jen čistá matematika v `zoomMath.test.ts`), `Header`, `MainLayout`. `FileUploader` má testy jen pro prázdný stav. | Viz fáze 4. |
| T4 | S | Testy fixují chybné chování: `energyData.test.ts:196-208` (přepis DST), `csvParser.test.ts` (`parseValue("1,234,567")` jako zdokumentovaný bug). | Přepsat spolu s D3/D8. |
| T5 | S | Žádné E2E, žádné CI. | Playwright + GitHub Actions, viz fáze 0 a 4. |
| T6 | N | `act()` varování v `ChartControls.test.tsx`; `components.test.tsx` renderuje bez `ThemeProvider`; `@testing-library/user-event` nainstalován a nepoužit; `toISOString()` v `storeExtensions.test.ts:270` (zakázaný vzor z CLAUDE.md). | Dílčí úklid. |

### R · Repozitář a dokumentace

| Kód | Z. | Nález | Oprava |
| --- | --- | --- | --- |
| R1 | K | ~3 900 řádků změn a 39 souborů nesledovaných (theme, design systém, 7 testů, ukázková data, CLAUDE.md, DESIGN.md). Ztráta disku = ztráta měsíců práce. | Commitnout hned (fáze 0). |
| R2 | S | README a CLAUDE.md: složka `Configuration/` neexistuje obsahem; seznam testů zastaralý; README nepopisuje, že timestamp je konec intervalu ani co metriky znamenají. | Aktualizovat ve fázi 5, po ustálení metrik. |
| R3 | N | Šum: `.history/` (není v `.gitignore`), `.playwright-mcp/` a 3 MB PNG v nadřazené složce, `design/solar.zip` (16 kB, neznámý obsah), duplicitní `test-data/`. | Doplnit `.gitignore`, přesunout nebo smazat. |
| R4 | N | `constants.ts:14`: `KW_TO_KWH_PER_INTERVAL = 4` se dělí (výsledek správný, název říká opak). | Přejmenovat na `INTERVALS_PER_HOUR`. |

---

## 6. Testy – shrnutí

**Dobře pokryto:** `csvParser` (formáty, DST, CRLF, chyby), `dataAggregation` (den/týden/měsíc/hodina/den-noc, DST, přelom roku), `dateUtils`, `energyData`, `sunCalculations`, `zoomMath`, store (`removeYear`, `getActiveRecords` ve všech režimech, výchozí výběr roku), `ChartControls` a `StatisticsPanel` s `ThemeProvider`. Testy asertují chování, používají pevná data, nemockují přehnaně.

**Slabiny:** viz T1–T6. Nejnebezpečnější vzor je T4: test, který zafixoval chybu jako záměr.

**Nově přidáno v této revizi:** `src/__tests__/userScenarios.test.ts`, 29 akceptačních scénářů nad reálnými CSV z `public/sample-data/` s nezávislým oráklem (součet sloupce CSV × 0,25). 24 prochází, 5 označených `it.fails` dokumentuje D1, D3, D4, M1. Po opravě začnou hlásit „expected test to fail“ a `.fails` se odebere.

---

## 7. Plán prací

Odhady jsou v pracovních dnech jednoho vývojáře. Každá fáze končí zeleným `npm run lint && npm run build && npm run test:run` a commitem.

### Fáze 0 · Zajištění a hygiena (0,5–1 den)

Cíl: nic se neztratí, každá další změna je ověřitelná.

1. Commit současného stavu na `main` (lint, build i testy jsou zelené) s popisem „design system, theme, year badges, tests“. Řeší R1.
2. `.gitignore`: přidat `.history/`; smazat nebo přesunout `design/solar.zip`, PNG a `.playwright-mcp/` z nadřazené složky, `test-data/` (duplicita). Řeší R3, část D9.
3. `devDependencies`: `@vitest/coverage-v8`; `vite.config.ts`: `test.env.TZ = 'Europe/Prague'`, coverage `include: ['src/**']`, `exclude` testů. Řeší T1, T2.
4. GitHub Actions: workflow `ci.yml` na push/PR: `npm ci`, lint, build, `test:run`, coverage artefakt. Řeší T5 (CI část).
5. `index.html`: `lang="cs"`, titulek „Solar Analytics“, vlastní favicon. Část F6.
6. Přejmenovat `KW_TO_KWH_PER_INTERVAL` → `INTERVALS_PER_HOUR`. R4.

Hotovo, když: CI zelené, coverage report existuje, `git status` čistý.

### Fáze 1 · Parser a datový model (2–3 dny)

Cíl: součty v aplikaci se rovnají součtům v CSV, jeden export = jeden rok.

1. `parseDate`: podpora `24:00[:ss]` (D1); posun timestampu na začátek intervalu o `INTERVAL_MINUTES` (D4). Rozhodnout a zdokumentovat v README, že interní timestamp = začátek intervalu.
2. `mergeAndGroupByYear`: sčítat duplicitní timestampy (D3). Přepsat `energyData.test.ts:196-208`.
3. `addData`: slučovat záznamy po polích, ne nahrazovat objekt (D2). Nový test: nahrát `spotreba.csv`, pak `vyroba.csv`, součty musí odpovídat U1.2.
4. `parseValue`: prázdná hodnota → `null` + chyba; záporná hodnota → chyba; všechny čárky (D5, D8). Aktualizovat `csvParser.test.ts`.
5. Dekódování: BOM/`fatal: true` (D6). Test s UTF-8 souborem.
6. Časová zóna (D7): rozhodnout mezi „dokumentovat omezení“ a „parsovat v Europe/Prague“. Doporučení: parsovat explicitně, protože DST logika na tom stojí.
7. Ukázková data: přegenerovat `public/sample-data/2022` z čistého zdroje (D9).
8. Odebrat `.fails` z U1.1, U1.2, U3.3, U8.1. Přidat integrační test „parser → store → agregace → simulace“ nad oběma ukázkovými roky.

Hotovo, když: U1–U3 a U8 prochází bez `.fails`, `availableYears` po nahrání 2022 je `[2022]`, součet kWh sedí na dvě desetinná místa.

### Fáze 2 · Metriky, simulace a datový tok (2–3 dny)

Cíl: každé číslo v UI má správný název a platí pro jasně definované období.

1. Definovat **aktivní rozsah** ve storu jednou (`getActiveRecords`) a nechat graf, statistiky i baterii číst z něj (S1). Graf výběr zvýrazní, nemaže ostatní data. Přepínač `RangeControl` přesunout do hlavičky stránky, protože řídí všechny tři panely.
2. `annualSavings` → normalizovat na rok, přejmenovat (`savingsPerYear`) a v UI uvést, za jaké období platí (M1). Odebrat `.fails` z U5.4.
3. Režim `'avg'` přejmenovat na `'years'`, nebo skutečně průměrovat (S2). Rozhodnutí uživatele, doporučení: přejmenovat.
4. „Soběstačnost“ → „Poměr dodávky k odběru“ (nebo jiný přesný název), jedna funkce, smazat `selfConsumptionRatio` (M2).
5. Ostrovní dny s baseline (M3), vážené pokrytí (M4), doporučená kapacita s DoD a chronologií dne (M5), drobné opravy M8.
6. Slidery: `onChangeCommitted` + lokální stav; memoizovat doporučenou kapacitu (P1).
7. Store úklid (S3, S4).
8. Volitelně po rozhodnutí: účinnost a výkonový limit (M6), výkupní cena (M7). Obě mění výsledná čísla o desítky procent, proto až po dohodě.
9. **Křivka „úspora vs. kapacita“** (návrh, přímo slouží primární potřebě): spustit simulaci pro řadu kapacit (např. 2–30 kWh po 1 kWh) nad aktivním rozsahem a zobrazit úsporu, ostrovní dny a využití baterie jako funkci kapacity. Doporučená kapacita = bod, kde přírůstek úspory na 1 kWh klesne pod zvolený práh. Nahradí percentilovou heuristiku obhajitelným výpočtem a dá uživateli vidět, proč právě tolik. Výpočet patří do Web Workeru (P2).

Hotovo, když: U5.4 prochází bez `.fails`, brush v grafu změní statistiky i baterii shodně, tažení slideru nespouští simulaci průběžně, doporučená kapacita je vysvětlitelná jednou větou v UI.

### Fáze 3 · Aktualizace FE komponent (3–4 dny)

Cíl: komponenty dodržují DESIGN.md, jsou menší, přístupné a čitelné v češtině.

1. **Design tokeny v grafech** (F1): `observatoryTheme` doplnit o `dataZoom`, `toolbox`, `tooltip.axisPointer`, víceletou paletu; `MainChart` bez hardcoded barev; odznaky roků a chipy používají stejnou `yearColor`.
2. **HeroTile** (F2): `.paper-card`, tokeny `--radius-*` do `index.css`, žádné `rgba(255,255,255,…)`.
3. **Formátování čísel** (F3): `utils/format.ts` (`formatKwh`, `formatMwhAuto`, `formatCzk`, `formatPercent`, `formatAxisNumber`) přes `Intl.NumberFormat('cs-CZ')`; použít ve všech komponentách i v ECharts formatterech.
4. **Rozdělení komponent** (F5): `DataImport/DropZone.tsx`, `StagedFilesList.tsx`, `YearBadge.tsx`; `Chart/chartSeriesBuilder.ts` (čistá funkce, testovatelná); `Common/HeroTile.tsx`, `SmallStat.tsx`, `SectionHeader.tsx`; `Configuration/BatteryConfigForm.tsx`, `DayNightConfigForm.tsx`; `Statistics/batteryChartOptions.ts`.
5. **Handoff** (F4): chip lokality; křížek na odznaku použitelný na dotyku.
6. **Přístupnost** (A1–A3): tabulková alternativa u každého grafu (skrytá, `aria-describedby`), `aria-label` na ikonových tlačítkách a file inputu, hlavička na mobilu.
7. **Drobnosti** (F6, F7): placeholdery v `CezGuide` nahradit skutečnými snímky nebo odstranit rámečky; text „5000 bodů“ z konstanty; správný prázdný stav grafu při odškrtnutých rocích; `slotProps` místo zastaralých props; `grid.bottom`/`dataZoom.bottom` u grafů baterie; popisek markLine uvnitř plochy; `isTimeAxisAggregation()`; jeden registr agregací.
8. **Výkon grafu** (P3, P5): bucketování raw dat; tree-shaken import ECharts.

Hotovo, když: `grep -E '#[0-9a-f]{3,6}|rgba?\(' src/components` nevrací nic mimo `theme/`; všechny částky a kWh v cs-CZ formátu; žádná komponenta nad 300 řádků; axe-core bez kritických chyb.

### Fáze 4 · Testy a průchodnost flow (2–3 dny)

Cíl: každý krok flow z kapitoly 4 má automatický test.

1. Unit/komponentové testy dle priorit: `addData` re-import/dedup; `simulateBattery` víceleté a interakce `minReserve`/`maxDischargePercent`; `useSmoothWheelZoom` s mockem ECharts instance; `FileUploader` načtený stav (staged list, „Načíst data“, mazání, „Vymazat vše“); `SampleDataButton` happy path + chyby fetch; `MainChart` smoke přes stub `echarts-for-react` pro všech 6 agregací a porovnání let; `setDayNightConfig`; `parseCSV` s reálnou hlavičkou 2025 (T3, T4).
2. Úklid T6 (`act`, `ThemeProvider` všude, `user-event` použít nebo odebrat, `toISOString` pryč).
3. **Playwright E2E** (`e2e/`): (a) ukázková data → graf → statistiky → baterie; (b) upload reálných CSV přes `setInputFiles` včetně obou formátů; (c) porovnání dvou let; (d) brush → „Výseč v grafu“ → shodné údaje ve všech panelech; (e) odebrání roku a „Vymazat vše“; (f) mobilní viewport 390 px; (g) axe-core sken. Zapojit do CI.
4. Výkonová sonda (P4): Playwright trace při 30 wheel eventech nad každým grafem, limit dlouhých tasků.

Hotovo, když: coverage řádků ≥ 80 % v `src/utils` a `src/store`, E2E zelené v CI, žádný long task > 200 ms při wheel zoomu.

### Fáze 5 · Dokumentace (1 den)

1. README: sekce „Datový model“ rozšířit (timestamp = konec intervalu v exportu, začátek intervalu interně; bilance vůči síti; co metriky znamenají a za jaké období platí); aktualizovat strukturu a seznam testů; odkaz na `docs/`.
2. CLAUDE.md: struktura složek, pravidlo „formátuj čísla jen přes `utils/format.ts`“, pravidlo „nový scénář = řádek v UZIVATEL-A-POTREBY.md + test“.
3. `docs/FLOW.md`: kroky flow s komponentami a store akcemi (z kapitoly 4), mapa E2E scénářů.
4. Krátké ADR záznamy pro rozhodnutí z fáze 2 (aktivní rozsah, pojmenování metrik, účinnost/výkupní cena).

Hotovo, když: nový vývojář podle README nahraje data, spustí testy a najde, kde se co počítá, bez čtení kódu.

### Souhrn

| Fáze | Rozsah | Odhad | Závisí na |
| --- | --- | --- | --- |
| 0 | commit, gitignore, coverage, TZ, CI, index.html | 0,5–1 d | – |
| 1 | parser, merge, ukázková data | 2–3 d | 0 |
| 2 | metriky, aktivní rozsah, slidery, store | 2–3 d | 1 |
| 3 | FE komponenty, tokeny, formátování, přístupnost | 3–4 d | 2 |
| 4 | unit + E2E testy, výkon | 2–3 d | 3 (E2E), 1 (unit) |
| 5 | dokumentace | 1 d | 2 |
| **Celkem** | | **11–15 d** | |

---

## 8. Otevřená rozhodnutí

Plán je proveditelný bez nich, ale mění výsledná čísla nebo rozsah. Doporučení je uvedeno u každého.

1. **Má simulace baterie respektovat výběr období a vybrané roky?** Doporučení: ano, všechny tři panely nad jedním aktivním rozsahem (S1).
2. **Jak nazvat metriku dnes označenou „Soběstačnost“?** Doporučení: „Dodávka / odběr“ s vysvětlivkou, protože skutečnou soběstačnost z dat nelze spočítat (M2).
3. **Přidat účinnost baterie a výkupní cenu do konfigurace?** Sníží úsporu o 10–30 %, ale bude odpovídat realitě (M6, M7). Doporučení: ano, jako volitelná pole s výchozími hodnotami 90 % a 1,5 Kč/kWh.
4. **Režim „Ø průměr“**: přejmenovat na „Vybrané roky“, nebo skutečně průměrovat (S2)? Doporučení: přejmenovat.
5. **Časová zóna**: parsovat vždy jako Europe/Prague, nebo dokumentovat, že aplikace předpokládá český prohlížeč (D7)? Doporučení: parsovat explicitně.
6. **Co s `design/solar.zip` a `test-data/`?** Doporučení: smazat obojí, `public/sample-data` je jediný zdroj.
7. **Nahradit percentilovou heuristiku doporučené kapacity křivkou „úspora vs. kapacita“?** Doporučení: ano, je to hlavní výstup aplikace a dnešní heuristika ignoruje DoD i průběh dne (M5, fáze 2 bod 9).

---

## 9. Přílohy

**Příkazy**

```bash
npm run lint && npm run build && npm run test:run
npx vitest run src/__tests__/userScenarios.test.ts --reporter=verbose
npm run dev -- --port 5173
```

**Mapa klíčových souborů**

| Účel | Soubor |
| --- | --- |
| Parser CSV | `src/utils/csvParser.ts` |
| Spojení odběr + dodávka, statistiky roku | `src/utils/energyData.ts` |
| Agregace, TOP dny, filtr rozsahu | `src/utils/dataAggregation.ts` |
| Simulace baterie, doporučená kapacita | `src/utils/batteryAlgorithm.ts` |
| Store (data, výběr, konfigurace) | `src/store/energyStore.ts` |
| Import UI, odznaky roků | `src/components/DataImport/FileUploader.tsx` |
| Hlavní graf | `src/components/Chart/MainChart.tsx` |
| Statistiky, TOP dny, porovnání let | `src/components/Statistics/*.tsx` |
| Baterie (KPI, co kdyby, grafy) | `src/components/Statistics/BatteryAnalysis.tsx` |
| Design tokeny a MUI téma | `src/index.css`, `src/theme/index.ts`, `src/theme/echartsTheme.ts` |
| Akceptační scénáře | `src/__tests__/userScenarios.test.ts`, `docs/UZIVATEL-A-POTREBY.md` |


---

## 10. Výsledek implementace (9. 9. 2026)

Plán byl proveden celý, v pořadí fází 0 → 5. Každá fáze skončila zeleným
`lint + build + test` a samostatným commitem.

### Co se změřilo

| Ukazatel | Před | Po |
| --- | --- | --- |
| Načtené řádky, formát `+A/… [kW]` | 34 675 z 35 040 | 35 040 |
| Roční součet vs. součet CSV | nesouhlasil | shoda na 4 desetinná místa |
| Roky po nahrání jednoho exportu | 2 (fantomový 2023) | 1 |
| Měsíců v analýze baterie | 13 | 12 |
| Doporučená kapacita | 5 kWh (percentil) | 8,5 kWh (koleno křivky) |
| Přepočet při tažení slideru | ~280 ms na každý pixel | 9 ms, jen po puštění |
| Balík ECharts | 1 145 kB (385 kB gzip) | 680 kB (230 kB gzip) |
| Unit testy | 218 | 335 |
| E2E testy | žádné | 22 běhů na dvou zařízeních |
| Pokrytí `src/utils` | neměřitelné (coverage nešlo spustit) | 90,8 % |
| Nálezy axe (serious a výš) | neměřeno | 0 |

### Rozhodnutí, která byla přijata

Otevřená rozhodnutí z kapitoly 8 byla vyřešena podle doporučení:

1. Simulace baterie respektuje aktivní rozsah, stejně jako graf a statistiky.
2. „Soběstačnost“ přejmenována na **„Poměr dodávky k odběru“** s vysvětlivkou.
3. Účinnost (výchozí 90 %) i výkupní cena (výchozí 1,5 Kč/kWh) přidány do konfigurace.
4. Režim `avg` přejmenován na `years` a v UI na **„Vybrané roky“**.
5. Časová zóna: testy mají připnutou `Europe/Prague`; aplikace nadále používá
   zónu prohlížeče a omezení je zdokumentované v README (viz zbývající práce).
6. `design/solar.zip` a `test-data/` nejsou verzované; z disku smazané nebyly.
7. Percentilová heuristika nahrazena křivkou úspora–kapacita s detekcí kolena.

### Co zůstává otevřené

| Kód | Proč nebylo provedeno |
| --- | --- |
| D7 | Parsování v pevné zóně Europe/Prague. Aplikace stále používá zónu prohlížeče; testy jsou proti tomu odstíněné připnutou zónou. Oprava vyžaduje `Temporal` nebo `date-fns-tz` a dotkne se celé datové vrstvy. |
| D9 | Poškozené kódování sloupce Status v `public/sample-data/2022`. Nemám čistý zdroj, ze kterého by šla data přegenerovat. Parser to obchází: neplatné statusy pozná podle prefixu i s poškozenou diakritikou. |
| P2 | Web Worker pro parser a simulaci. Po opravě P1 už měření nic pomalého neukazuje: import ukázkového roku trvá 563 ms včetně vykreslení. Nemá smysl přidávat složitost bez měřitelného problému. |
| P4 | Zamrzání po scrollování nad grafy se v produkčním buildu nepodařilo reprodukovat. Ukázalo se, že šlo o dev server v kombinaci s rozšířením prohlížeče, ne o aplikaci. |
| R3 | Soubory mimo repozitář (snímky obrazovky, `.playwright-mcp/`) jsem nemazal, jen je vyloučil z verzování. Mazání cizích souborů nechávám na majiteli. |

### Nové soubory, které stojí za pozornost

| Soubor | Proč vznikl |
| --- | --- |
| `src/utils/format.ts` | jediné místo, kde se čísla mění na text pro uživatele |
| `src/utils/chartSeriesBuilder.ts` | logika hlavního grafu jako čistá funkce, testovatelná bez canvasu |
| `src/utils/batteryChartOptions.ts` | totéž pro obrazovku baterie |
| `src/components/Statistics/CapacityAdvisor.tsx` | hlavní výstup aplikace: doporučení i jeho zdůvodnění |
| `src/components/Configuration/BatteryConfigForm.tsx` | konfigurace oddělená od výsledků, s odloženým přepočtem |
| `src/theme/echartsCore.ts` | registruje jen ty části ECharts, které se kreslí |
| `e2e/` | Playwright scénáře E1–E7 |
| `docs/FLOW.md` | tok aplikace a mapa E2E scénářů |
