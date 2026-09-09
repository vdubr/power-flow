# Tok aplikace

Co se stane od nahrání souborů po doporučení baterie, které komponenty a akce storu se toho účastní a kde to hlídají testy.

Doprovodné dokumenty: [UZIVATEL-A-POTREBY.md](./UZIVATEL-A-POTREBY.md) (proč to uživatel dělá), [REVIZE-A-PLAN.md](./REVIZE-A-PLAN.md) (stav a plán), [README.md](../README.md) (datový model).

---

## Přehled

```
prázdný stav ──► import ──► store ──► aktivní rozsah ──► panely
     │                                      ▲                │
     │                                      └── výběr v grafu ┘
     └── ukázková data
```

Den a noc je **přepínač**, ne zobrazení: `ChartConfig.showDayNight` platí pro kteroukoli agregaci a rozhodnutí „byl den?" dělá jediná funkce `createIsDayPredicate` (`src/utils/dayNight.ts`), kterou volají agregace, noční pásy i statistiky.

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

Testy: `csvParser.test.ts`, scénáře U1.0, U3.3, U11.1, U11.2.

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

Akce, které mění aktivní rozsah a tedy spouští `recompute`: `addData`, `removeYear`, `setSelectedYears`, `setTimeRange`, `setRangeMode`, `setBatteryConfig`.

Testy: `storeExtensions.test.ts`, scénáře U1.1–U1.4, U3.1, U3.2, U10.1, U10.2, U7.3.

---

## 4. Aktivní rozsah

`selectActiveRecords(allRecords, availableYears, chartConfig)`:

| `rangeMode` | Vrací | Ovládá |
| --- | --- | --- |
| `years` | záznamy zaškrtnutých roků | odznaky roků, `RangeControl` |
| `last` | jen nejnovější z nich | `RangeControl` |
| `selection` | výseč vybranou v grafu | tažení v grafu (brush) |

Výběr v grafu automaticky přepne režim na `selection`; jeho zrušení se vrací na `years`. Smazání roku, do kterého výběr mířil, výběr zahodí.

Testy: scénáře U9.1, U9.2.

---

## 5. Panely

| Pořadí | Komponenta | Co odpovídá uživateli | Scénáře |
| --- | --- | --- | --- |
| 1 | `Chart/MainChart` + `ChartControls` | Kolik odebírám a dodávám, kdy; přepínač Den / noc | U2 |
| 2 | `Statistics/StatisticsPanel` + `TopConsumptionDays` | Souhrn a nejnáročnější dny | U1, U2 |
| 3 | `Statistics/CapacityAdvisor` | **Jakou baterii koupit** | U5 |
| 4 | `Statistics/BatteryAnalysis` + `Configuration/BatteryConfigForm` | Co kdyby, sezónnost, ostrovní dny | U4, U6, U7, U8 |
| 5 | `Statistics/YearComparisonTable` | Rozdíl mezi roky (jen při více vybraných) | U3 |

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
