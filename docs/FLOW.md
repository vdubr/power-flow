# Tok aplikace

Co se stane od nahrání souborů po doporučení baterie, které komponenty a akce storu se toho účastní a kde to hlídají testy.

Doprovodné dokumenty: [UZIVATEL-A-POTREBY.md](./UZIVATEL-A-POTREBY.md) (proč to uživatel dělá), [REVIZE-A-PLAN.md](./REVIZE-A-PLAN.md) (stav a plán), [README.md](../README.md) (datový model).

---

## Přehled

```
prázdný stav ──► import ──► store ──► aktivní rozsah ──► panely
     │                                      ▲                │
     │                                      └── výseč = zoom ─┘
     └── ukázková data (přibalené roky 2022–2025, jedna dávka)
```

Den a noc je **přepínač**, ne zobrazení: `ChartConfig.consumptionSplit` má čtyři stavy (`sum` / `both` / `day` / `night`), platí pro kteroukoli agregaci a rozhodnutí „byl den?" dělá jediná funkce `createIsDayPredicate` (`src/utils/dayNight.ts`), kterou volají agregace, noční pásy i statistiky.

Jádrem je **aktivní rozsah**: jedno pravidlo (`selectActiveRecords` v `src/store/energyStore.ts`), které určuje, se kterými záznamy pracuje graf, statistiky i simulace baterie. Dřív si každý panel vybíral sám a po výběru v grafu ukazovaly tři různé podmnožiny.

---

## 1. Prázdný stav

| Prvek | Komponenta |
| --- | --- |
| Drop zóna, výběr souborů | `DataImport/DropZone` |
| Ukázková data | `DataImport/SampleDataButton` |
| Návod na stažení z ČEZ | `DataImport/CezGuide` |

Podmínka zobrazení: `availableYears.length === 0`. `App.tsx` v tomto stavu místo panelů vykreslí návod.

---

## 2. Import

```
soubor ──► parseCSVFile ──► decodeWindows1250 ──► parseCSV
                                                    │
                        detectDataType (+A / a+ / -A / a-)
                        parseDate (včetně 24:00)
                        intervalStart (posun na začátek intervalu)
                        parseValue (null pro prázdnou/zápornou/nejednoznačnou)
                        Status → quality.invalidStatusRows
                                                    ▼
                                          CSVParseResult
```

- Soubory se **vždy** uloží do storu rovnou, v prázdném i načteném stavu; potvrzovací krok sedával pod přehybem a výběr souborů kvůli tomu vypadal jako by nic neudělal.
- Výsledek hlásí `Snackbar` s `role="status"` („Načteno 35 040 záznamů za rok 2025…"), chyby a odmítnuté soubory `Alert`.
- Kvalitu dat (kolik intervalů nemá platné měření) zobrazuje `DataQualityNote`.
- Přetažení kamkoli na stránku zachytí `useGlobalDropGuard`, takže drop mimo zónu neotevře CSV v prohlížeči a neztratí načtená data.

Testy: `csvParser.test.ts`, scénáře U1.0, U1.5, U3.3, U3.4, U11.1, U11.2.

---

## 3. Store

```
addData(consumptionData, productionData)
  ├─ mergeAndGroupByYear   kW/4 → kWh, duplicitní timestampy se SČÍTAJÍ
  ├─ slučování po polích   dávka přepíše jen tu stranu, kterou nese
  ├─ selectedYears     roky nesené dávkou (≥ 5 % největšího roku dávky);
  │                     jsou-li už vybrané, výběr se nemění; při změně
  │                     se zahodí výseč v grafu
  └─ recompute(...)
```

`recompute()` je jediné místo, kde vznikají odvozená data:

| Výstup | Kdy se přepočítá | Cena |
| --- | --- | --- |
| `batterySimulation` | při každé změně rozsahu nebo konfigurace | ~9 ms |
| `capacityRecommendation` | jen když se změní klíč křivky | ~280 ms |

Klíč křivky (`capacityCurveKeyOf`) záměrně **neobsahuje kapacitu**, protože křivka kapacitu sama prochází. Díky tomu tažení slideru kapacity nepřepočítává 57 simulací.

Akce, které mění aktivní rozsah a tedy spouští `recompute`: `addData`, `removeYear`, `setSelectedYears`, `setTimeRange`, `setRangeMode`, `setBatteryConfig` a `setZoomRange` — ten ale jen v režimu `selection`, jinak nový rozsah leží ve `chartConfig.timeRange` připravený a nic nepřepočítává. `setConsumptionSplit`, `setChartMode`, `toggleSeriesVisibility` ani `setHighlightedSeries` v seznamu nejsou: to jsou nastavení grafu, ne rozsahu.

Testy: `storeExtensions.test.ts`, scénáře U1.1–U1.4, U3.1, U3.2, U10.1, U10.2, U7.3.

---

## 4. Aktivní rozsah

`selectActiveRecords(allRecords, availableYears, chartConfig)`:

| `rangeMode` | Vrací | Ovládá |
| --- | --- | --- |
| `years` | záznamy zaškrtnutých roků | odznaky roků, `RangeControl` |
| `last` | jen nejnovější z nich | `RangeControl` |
| `selection` | rozsah, na který je graf přiblížený | zoom v grafu + `RangeControl` |

**Výseč je zoom.** Rozsah, na který uživatel graf přiblíží, je zároveň výsečí, kterou můžou následovat statistiky a simulace baterie — nástroj na tažení výseče (brush) je proto z grafu odstraněný a přepínač „Výseč v grafu" je dostupný vždy (bez přiblížení znamená celý rozsah). Dřív byla volba zakázaná, dokud uživatel nenašel nástroj na tažení, takže tu možnost před ním schovávala.

```
dataZoom ──► computeZoomDateRange ──► setZoomRange (debounce 400 ms)
                     │                        │
      null při porovnání více let      rangeMode === 'selection'
      (osa měsíc-den nemá jeden               │
       konkrétní časový rozsah)         ──► recompute()
```

- **Zoom sám nepřepíná režim.** `setZoomRange` jen uloží rozsah do `chartConfig.timeRange`; přepnout panely na něj je rozhodnutí uživatele v `RangeControl` (na rozdíl od `setTimeRange`, které režim přepne). Přepočítává se navíc jen v režimu `selection` — jinak rozsah leží připravený, dokud si ho někdo nevyžádá.
- **Zdržení 400 ms** (`ZOOM_COMMIT_DELAY_MS`): rozsah vstupuje do simulace baterie, takže se nesmí přepočítávat při každém otočení kolečka.
- **Je-li graf přiblížený, vypisuje se rozsah vpravo nad grafem** (`formatZoomWindowLabel`, chip „Výseč: …"). Při porovnání více let sdílí roky jednu osu měsíc-den, kde index kategorie patří všem vybraným rokům současně a žádný interval reálného času neexistuje: `computeZoomDateRange` tam vrací `null` a popisek místo dat vypíše názvy krajních kategorií („20. týden – 30. týden"). `timeRange` tím zůstane prázdný, takže režim `selection` pracuje s celým rozsahem.
- **Změna toho, co graf kreslí** (agregace, zobrazení, den/noc, výběr roků) zoom zahodí a graf se postaví znovu na celém rozsahu — okno naměřené nad jinou osou o té nové nic neříká.
- Smazání roku, do kterého výseč mířila, ji zahodí a vrátí režim na `years`.

Testy: scénáře U9.1, U9.2, e2e E13.

---

## 5. Panely

| Pořadí | Komponenta | Co odpovídá uživateli | Scénáře |
| --- | --- | --- | --- |
| 1 | `Chart/MainChart` (+ `ChartAggregationSelect`, `ChartModeToggle`, `ChartFullscreenButton`, `ChartSeriesFilter`) | Kolik odebírám a dodávám, kdy; volba agregace a zobrazení nad grafem, filtr sérií s přepínačem den/noc pod ním | U2 |
| 2 | `Statistics/StatisticsPanel` + `TopConsumptionDays` | Souhrn a nejnáročnější dny | U1, U2 |
| 3 | `Statistics/CapacityAdvisor` | **Jakou baterii koupit** | U5 |
| 4 | `Statistics/BatteryAnalysis` + `Configuration/BatteryConfigForm` | Co kdyby, sezónnost, ostrovní dny | U4, U6, U7, U8 |
| 5 | `Statistics/YearComparisonTable` | Rozdíl mezi roky (jen při více vybraných) | U3 |

Karta „Nastavení grafu" (`ChartControls`) už v aplikaci není. Každý její ovladač se přesunul k tomu, co ovládá: agregace a nové zobrazení nad graf, den/noc do filtru pod grafem, lokalita do chipu v importním pruhu (`DataImport/LocationChip`), výběr roků byl vždy v odznacích roků. **Ruční okno hodin tím přišlo o UI**: `dayNightConfig.mode: 'manual'` zůstává v typech, v `dayNight.ts` i v testech, ale uživatel se k němu nedostane — „den" je vždy od východu do západu slunce pro lokalitu z chipu.

### Co graf kreslí

```
buildChartSeries   ChartConfig.chartMode
        ├─ 'balance'   spotřeba (plotSign −1) + výroba (plotSign +1)
        └─ 'net'       jedna série na rok: spotřeba − výroba, plotSign −1
        ▼
seriesAverage      průměr vykreslených sérií → přerušovaná markLine
```

- **Překlopení je volba uživatele.** Přepínač „Spotřeba pod osu" (`consumptionBelowAxis`, výchozí vypnuto) zrcadlí odebranou stranu pod nulu, takže se dvě strany elektroměru dají srovnat pohledem; vypnutý nechá obě nad nulou. Se zapnutým je spotřeba v datech sérií negativní a `ChartSeriesDef.plotSign` (`−1` u sérií pod nulou) je cesta zpět k energii: násobí jím **každý, kdo hodnotu ukazuje** — popisek u kurzoru (`energyOf`) i textová alternativa grafu. Kde znaménko není z čeho odvodit, bere se absolutní hodnota (popisky osy Y, popisek průměru). Negativní kWh se v UI neobjeví.
- **„Dokoupená energie"** (`chartMode: 'net'`, přepínač `ChartModeToggle` u volby agregace) je jedna série na rok s hodnotou spotřeba − výroba. Kladné číslo znamená, že se energie musela dokoupit, a kreslí se pod nulou stejně jako spotřeba v bilančním zobrazení; nad nulou tedy dodávka převážila odběr. Filtr pod grafem má v tomto zobrazení jediný řádek a žádný přepínač veličiny — vypnout jedinou sérii by graf jen vyprázdnilo.
- **Průměr** je přerušovaná čára proložená grafem, jedna na veličinu (`seriesAverage`). Počítá se z **právě vykreslených** sérií, ne ze všeho postaveného: průměr, který by počítal rok skrytý ve filtru, by ležel ve výšce, jejíž důvod uživatel nevidí. Čára je jedna na veličinu, ne na sérii — se čtyřmi roky říká osm čar méně než dvě.
- **Celá obrazovka**: `ChartFullscreenButton` v hlavičce karty přes `useFullscreen` roztáhne celou kartu grafu (graf pak má 78 vh místo 500 px). Stav se čte z `document.fullscreenElement`, ne z posledního kliknutí — uživatel odchází z fullscreenu Esc stejně často jako tlačítkem. Kde prohlížeč Fullscreen API nemá (a v jsdom), tlačítko se nevykreslí vůbec.

Testy: `ChartFullscreenButton.test.tsx`, `chartSeriesBuilder.test.ts`, e2e E12.

### Filtr dat pod grafem

Legenda není v canvasu, ale pod ním jako `ChartSeriesFilter`: řádek na spotřebu, řádek na výrobu, na začátku každého přepínač celé veličiny (`showConsumption` / `showProduction`).

```
buildSeriesFilterChips   čip za každý NAHRANÝ rok
        ▼
active / offReason       'hidden' | 'quantity-off' | 'year-not-selected'
        ▼
Chip                     zšedlý ve všech třech případech; kliknutelný jen u 'hidden'
```

Jména a barvy čipů dělá `chartSeriesName` / `chartSeriesColor`, tedy tytéž funkce, které pojmenují a obarví série v grafu — proto `hiddenSeries` sedí na to, co graf kreslí (test „names and colors match the series the chart draws“). Skrytí série je zobrazení, ne filtr dat: aktivní rozsah, statistiky ani simulace se nemění (U2.6).

Roky se vybírají **jen** odznaky v „Import dat“ (`YearBadge`); filtr pod grafem svůj vlastní výběr roků nemá, byl by to druhý ovladač téhož stavu.

**Zvýraznění při ukázání.** Kurzor (i tabulátor) na čipu zvýrazní tu jednu sérii v grafu, na přepínači nebo popisce řádku všechno, co řádek kreslí — se čtyřmi roky jsou čipy jediné místo, kde se série dá odlišit od sousedních, takže jsou i místem, kde se dá grafu položit otázka „která čára je která". Zvýrazněná jména drží store v `highlightedSeries`, **záměrně mimo `chartConfig`**: každá změna v `chartConfig` přepočítává simulaci baterie a křivku kapacity, a myš přejezdem přes čtyři čipy to spustit nesmí. Klávesnice je zapojená schválně — bez myši není jiná cesta.

**Čtyřstavový přepínač den/noc** je na konci řádku spotřeby (a v zobrazení „Dokoupená energie" na konci jeho řádku — obsahuje spotřebu). Až za čipy roků, protože roky jsou to, po čem uživatel sahá, zatímco přepínač platí pro všechny naráz.

| `consumptionSplit` | Popisek | Co udělá |
| --- | --- | --- |
| `sum` | Suma | jedno číslo na sloupec, celý den |
| `both` | Den i noc | **stejné sloupce** jako `sum`, jen popisek u kurzoru přidá rozpad na den a noc |
| `day` / `night` | Jen den / Jen noc | data ořeže — v grafu, v popisku i v porovnání napříč roky je jen ta polovina dne |

- Nahradilo to dřívější dvoustavový přepínač „Rozdělit na den a noc" i stohované sloupce: rozpad na poloviny dne se teď nekreslí do sloupců vůbec, jen se čte v popisku u kurzoru.
- Že se dvojice `sum` a `both` kreslí stejně, je celý smysl `both`: rozpad se dá zapnout, aniž by uživatel obětoval sloupec, na který se dívá. Proto to popisek přepínače říká výslovně — přečíst ořezaný graf jako celý den je jediná chyba, kterou tento ovladač může způsobit.
- Na časové ose (15min, hodinové) není co v bodě dělit, takže jakýkoli stav kromě `sum` vyznačí noční hodiny pásy (`buildNightMarkArea`), a jen u jediného vybraného roku — dva roky pásů přes sebe se nedají přečíst.
- Ořezání je nastavení grafu, ne filtr dat: `setConsumptionSplit` nespouští `recompute`, takže aktivní rozsah, statistické dlaždice „Spotřeba ve dne / v noci" ani simulace baterie se jím nemění.

### Porovnání jednotky napříč roky

Týdenní a měsíční zobrazení (`isComparableUnitAggregation`) mají jednotku, která se každý rok opakuje, takže se na ní dají roky postavit vedle sebe:

```
buildUnitComparison   agreguje VŠECHNY nahrané roky, ne jen vybrané
        ▼
unitOf                měsíc = číslo měsíce, týden = ISO číslo týdne (isoWeek)
        ▼
byCategory            klíč = kategorie osy (chartCategoryKey) → tooltip
units                 kalendářní pořadí → skrytá tabulka pro čtečky
```

- **Záměrně ignoruje výběr roků.** Smyslem je porovnat s roky, které na obrazovce nejsou; ty přijdou bez barvy a tooltip je odliší prázdným kolečkem.
- **Týden se klíčuje ISO číslem týdne** (`weekUnitId`), ne datem pondělí — to se rok od roku posouvá. Dokud se klíčovalo datem, prokládaly se roky do samostatných pásů pár dnů od sebe (106 kategorií na dva roky), v každém byl jediný rok a při zoomu se pás zdánlivě pohyboval.
- **Přelom roku** má vlastní pás na každém konci osy (`W00` = lednové dny dokončující prosincový týden, `W54` = prosincové dny patřící lednovému týdnu). Alternativa — přilepit je k sousednímu týdnu — by nafoukla první nebo poslední sloupec roku o pár dnů a v porovnání by to vypadalo jako skutečný rozdíl.
- Pondělí 27. týdne padne v každém roce na jiné datum, takže **rozsah pondělí–neděle je v řádku tooltipu**, ne v hlavičce.
- **Průměr** je aritmetický průměr let, která pro tu jednotku mají data; odchylka každého roku se počítá vůči němu (`formatSignedPercent`, ▲/▼).
- `axisPointer: 'shadow'` dělá z celého svislého pásu cíl pro myš i prst, takže není potřeba trefit jeden tenký sloupec z osmi.
- Tytéž hodnoty jsou ve skryté tabulce grafu (`buildUnitComparisonRows`), protože tooltip potřebuje ukazovátko.

Testy: scénáře U3.7 a U3.8, e2e E11.

### Doporučení kapacity

```
buildCapacityCurve   simulace 2–30 kWh po 0,5 kWh (57 běhů)
        ▼
recommendCapacity    koleno křivky = bod nejdál od spojnice krajů
        ▼
CapacityAdvisor      číslo + graf + tlačítko „Použít v simulaci"
```

Koleno se hledá po normalizaci obou os na 0–1, kde se vzdálenost od tětivy zjednoduší na `y − x`. Nemá volný parametr. Na ukázkových datech vychází 8,5 kWh (2022) a 10,5 kWh (2025).

---

## 6. Úklid

- křížek na odznaku roku → `removeYear(year)`
- „Vymazat všechna data" → `clearData()` → prázdný stav včetně resetu konfigurace baterie

---

## Co pokrývají E2E testy

Scénáře, které nejdou ověřit jednotkovým testem, patří do Playwrightu (fáze 4 plánu):

| ID | Scénář |
| --- | --- |
| E1 | ukázková data → graf → statistiky → doporučení baterie |
| E2 | upload reálných CSV obou formátů přes `setInputFiles` |
| E3 | nahraný rok se zobrazí bez potvrzování, porovnání je krok navíc |
| E4 | přepnutí aktivního rozsahu platí pro celou stránku |
| E5 | odebrání roku a „Vymazat všechna data" |
| E6 | použití doporučené kapacity v simulaci |
| E6m | mobilní viewport, mazání roku na dotyk, žádný vodorovný scroll |
| E7 | axe-core sken bez vážných nálezů |
| E8 | přetažení souborů na stránku načte rok a neodnaviguje |
| E9 | přepínač den/noc rozdělí spotřebu; agregace nabízí pět zobrazení |
| E10 | filtr pod grafem: dva řádky, zšednutí čipů vypnutou veličinou i odškrtnutým rokem; import více roků otevře měsíční zobrazení |
| E11 | porovnání jednotky napříč roky v tooltipu (myší i dotykem), stabilita týdenního pásu při zoomu, textová alternativa grafu |
| E12 | tlačítko na celou obrazovku zvětší kartu grafu a vrátí ji zpět; přepnutí zobrazení na „Dokoupenou energii" nechá ve filtru jediný řádek a nikde neukáže negativní kWh |
| E13 | přiblížení grafu vypíše rozsah nad grafem, „Výseč v grafu" ho použije pro statistiky i baterii; při porovnání více let popisek místo dat vypíše názvy kategorií a nástroj na tažení výseče v grafu není |
