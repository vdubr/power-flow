# Uživatel Solar Analytics a jeho potřeby

Specifikace toho, kdo aplikaci používá, jak se v ní chová a jaké otázky si přichází zodpovědět. Každá potřeba má přiřazený akceptační scénář (U1–U11), který je spustitelný v `src/__tests__/userScenarios.test.ts` nad reálnými exporty z `public/sample-data/`.

Stav k 10. 9. 2026: všech 47 scénářů prochází. Chování ověřené v prohlížeči pokrývá E2E sada v `e2e/` (21 scénářů × desktop i mobil).

## 0. Primární potřeba

> **Nahraju data. Zobrazím si spotřebu a výrobu. Aplikace mi pomůže vyhodnotit, jaká baterie a s jakou kapacitou by pro mě byla vhodná.**

Všechno ostatní (porovnání let, den/noc, TOP dny, výběr období) je podpůrné. Hlavní výstup aplikace je **doporučení kapacity baterie a odhad, co mi přinese**; hlavní vstup je dvojice CSV z ČEZ. Z toho plyne priorita: import musí být bezchybný (U1, U3), zobrazení spotřeby a výroby srozumitelné (U2), a doporučení kapacity (U5) musí být podložené a obhajitelné, včetně toho, jak se mění s parametry (U7) a co znamená v čase (U6, U8).

---

## 1. Kdo je uživatel

**Persona: majitel domu s fotovoltaikou bez baterie.**

- Bydlí v rodinném domě, má FVE na střeše, přetoky prodává do sítě za nízkou výkupní cenu.
- Je zákazník ČEZ Distribuce a má přístup do portálu, kde si stáhne 15minutová měření.
- Technicky zdatný laik: umí stáhnout CSV a přetáhnout ho do prohlížeče, nechce instalovat nic ani programovat.
- Rozhoduje se, **zda a jakou baterii koupit**, a chce to podložit vlastními daty, ne obecnými kalkulačkami dodavatelů.

**Kontext použití**

| Aspekt | Hodnota |
| --- | --- |
| Frekvence | několikrát ročně (po stažení nového exportu, před nákupním rozhodnutím) |
| Délka sezení | 10–20 minut |
| Zařízení | primárně desktop nebo notebook, občas tablet; mobil jen pro rychlý pohled |
| Data | 1–3 roky, každý rok dva soubory (odběr `+A`, dodávka `-A`), 35 040 řádků na soubor |
| Soukromí | data nikam neodesílá, vše běží v prohlížeči |

**Co uživatel ví a neví**

- Ví, kolik platí za kWh a jaké baterie jsou na trhu (5–15 kWh).
- Neví, že export ČEZ je **bilance vůči síti**, ne celková výroba a spotřeba domu. Aplikace mu to musí říct a nesmí předstírat, že zná jeho vlastní spotřebu.
- Nezná pojmy DoD, C-rate, round-trip účinnost. Rozumí „kolik ušetřím“ a „kolik dní bych byl bez sítě“.

---

## 2. Cíle a ne-cíle

**Cíle**

1. Pochopit svou roční bilanci: kolik odebral, kolik dodal, kdy nejvíc.
2. Zjistit, kolik energie mu „propadá“ do sítě a dalo by se uložit.
3. Dostat doporučení kapacity baterie a odhad roční úspory ve vlastních podmínkách.
4. Ověřit si citlivost: co se stane při jiné kapacitě nebo ceně elektřiny.
5. Porovnat roky mezi sebou (po přidání spotřebičů, tepelného čerpadla, změně chování).

**Ne-cíle (aplikace to neřeší a nemá to předstírat)**

- Výpočet skutečné výroby FVE a vlastní spotřeby domu (z bilančních dat nelze).
- Návratnost investice, financování, dotace.
- Řízení baterie v reálném čase, integrace se střídačem.
- Ukládání dat na server, sdílení, účty.

---

## 3. Otázky uživatele a kde na ně aplikace odpovídá

| ID | Otázka uživatele | Kde v aplikaci | Metrika / výpočet | Scénář |
| --- | --- | --- | --- | --- |
| U1 | Kolik jsem za rok odebral ze sítě a kolik do ní dodal? | Statistiky: Celková spotřeba, Celková výroba; tabulka porovnání let | `YearStatistics.totalConsumption`, `totalProduction` = součet kW × 0,25 | U1.0–U1.5 |
| U2 | Kdy nejvíc odebírám? | Graf (15min, hodinová, denní, týdenní, měsíční) + čtyřstavový přepínač den/noc ve filtru pod grafem, TOP 10 dnů, Špička spotřeby | `getTopConsumptionDays`, `createIsDayPredicate`, `peakConsumption` | U2.1–U2.8 |
| U3 | Jak se to liší mezi roky? | Odznaky roků v importním pruhu, graf v režimu porovnání, porovnání jednotky v tooltipu (týdenní a měsíční), tabulka porovnání | `yearlyData` per rok, normalizace na osu měsíc-den | U3.1–U3.9 |
| U4 | Kolik přetoků by šlo uložit? | Baterie: Energie uložena do baterie, Snížení odběru ze sítě | `totalEnergyStored`, `gridImportReduction` | U4.1–U4.2 |
| **U5** | **Jakou baterii a kolik ročně ušetřím?** (primární potřeba) | Doporučená kapacita s křivkou úspor, Úspora za rok | `recommendCapacity` (koleno křivky), `savingsPerYear` | U5.1–U5.6 |
| U6 | Kolik dní bych byl bez dokupu? | Baterie: Ostrovní dny, graf Denní dokup | `offGridDays`, `dailyGridImport[].isOffGrid` | U6.1–U6.2 |
| U7 | Co kdyby (jiná kapacita, cena, rezerva)? | Sekce „Co kdyby“: slidery a pole | `setBatteryConfig` → nová simulace | U7.1–U7.2 |
| U8 | Ve kterých měsících baterie pomůže? | Graf Měsíční analýza | `monthlyAnalysis` | U8.1–U8.2 |
| U9 | Co se dělo v konkrétním období? | Výběr (brush) v grafu, přepínač Vybrané roky / Poslední rok / Výseč v grafu | `setTimeRange`, `rangeMode = 'selection'`, `getActiveRecords` | U9.1–U9.2 |
| U10 | Jak nahraná data spravuji? | Odznak roku (×), „Vymazat všechna data“, „Nahrát další“ | `removeYear`, `clearData`, `addData` | U10.1–U10.5 |
| U11 | Co se stalo, když se soubor nenačetl? | Červený Alert u importu | `CSVParseResult.errors` | U11.1–U11.2 |

---

## 4. Chování v aplikaci (journey)

1. **Příchod bez dat.** Vidí drop zónu, tlačítko „Vybrat soubory“, „Vyzkoušet s ukázkovými daty“ a návod ve třech krocích, jak data z ČEZ stáhnout. Očekává, že do minuty uvidí graf. Ukázková data načtou celou přibalenou sadu 2022–2025, takže i bez vlastního exportu vidí porovnání let (U3.4).
2. **Import.** Přetáhne oba soubory najednou (nebo více let), kamkoli na stránku, nebo je vybere tlačítkem. Aplikace pozná typ souboru z hlavičky, načte je rovnou a potvrdí, kolik záznamů a za jaký rok; při chybě uvede číslo řádku. Graf i statistiky se přepnou na nahraný rok. Nese-li import víc roků, otevře se rovnou měsíční zobrazení (U3.6).
3. **Orientace.** Importní pruh se sbalí do jednoho řádku s odznaky roků (tečky: výroba/spotřeba k dispozici). Roční graf ukáže odběr a dodávku po dnech jako sloupce. Uživatel přepíná agregace a hledá špičky. Pod grafem je **filtr dat**: řádek pro spotřebu a řádek pro výrobu, každý začíná přepínačem celé veličiny a pokračuje čipem na každý nahraný rok. Čip zšedne, ať už ho uživatel vypnul kliknutím, vypnul celý řádek, nebo odškrtl rok v „Import dat“ – graf ve všech třech případech ukazuje totéž (U2.6). V týdenním a měsíčním zobrazení se ukázáním na svislý pás jednotky (nemusí to být přesně na sloupec) vypíše ta jednotka za **všechny nahrané roky** s průměrem a odchylkou od něj – tak se pozná, jestli byl letošní červenec normální (U3.7).
4. **Den a noc.** Přepínač „Rozdělit na den a noc" platí pro kterékoli zobrazení: u sloupcových rozdělí spotřebu na denní a noční část v jednom sloupci, u 15minutového a hodinového vyznačí noční hodiny pásy. „Den" je od východu do západu slunce pro zvolenou lokalitu, alternativou je ruční okno hodin. Výroba se nerozděluje, protože po západu slunce do sítě nic nejde.
5. **Statistiky.** Přečte KPI (spotřeba, výroba, špička, den/noc), TOP 10 dnů. Čísla očekává v českém formátu (mezera jako oddělovač tisíců, čárka jako desetinná).
6. **Baterie.** Přečte doporučenou kapacitu, roční úsporu, ostrovní dny a zbytkový dokup. Posouvá slidery a sleduje, jak se čísla mění. Očekává plynulou odezvu a to, že „roční“ znamená za jeden rok i při více nahraných letech.
7. **Porovnání.** Nahraje další rok, který se hned zobrazí. Kliknutím na odznak dřívějšího roku v „Import dat“ ho přidá do porovnání – odznaky jsou jediné místo, kde se roky vybírají. V grafu vidí roky přes sebe na stejné ose, v tabulce vedle sebe.
8. **Detail.** Vybere úsek v grafu (brush). Graf, statistiky i simulace baterie se přepnou na „Výseč v grafu“ a ukáží jen vybraný úsek.
9. **Úklid.** Smaže rok křížkem na odznaku nebo vše tlačítkem „Vymazat všechna data“ a vrátí se do prázdného stavu.

**Očekávání na důvěryhodnost**

- Každé číslo má jednotku a je jasné, za jaké období platí (rok, výběr, všechny roky).
- Pojmy odpovídají tomu, co se počítá. „Soběstačnost“ z bilančních dat spočítat nelze, proto se v UI jmenuje „Poměr dodávky k odběru“.
- Součty v aplikaci se shodují se součtem v CSV. Ztráta jediného intervalu (např. při změně času) je pro uživatele chyba, protože si to může přepočítat v tabulkovém procesoru.
- Prázdný interval nebo chybějící měření nesmí být tiše nula.

---

## 5. Akceptační scénáře

Formát Given / When / Then. Stav: ✅ prochází, ❌ známá chyba (kód nálezu z plánu), test je označen `it.fails`.

### U1 Roční bilance vůči síti

| ID | Scénář | Stav |
| --- | --- | --- |
| U1.0 | Given ukázkový export 2022 (formát `a+`/`a-`). When se soubory naparsují. Then oba se rozpoznají (spotřeba/výroba) a každý má 35 040 záznamů. | ✅ |
| U1.1 | Given export za rok 2022. When ho uživatel nahraje. Then v aplikaci je k dispozici přesně rok 2022 a je vybraný. | ❌ D4 (fantomový rok 2023) |
| U1.2 | Given export 2022. When se nahraje. Then celkový odběr i dodávka za rok odpovídají součtu druhého sloupce CSV × 0,25 na dvě desetinná místa. | ❌ D3, D4 (ztráta DST hodiny, posun posledního intervalu) |
| U1.3 | Then hodnoty jsou v řádu 1–20 MWh a dat je alespoň 365 dní. | ✅ |
| U1.4 | Then odběr a dodávka jsou dvě nezávislé veličiny, poměr je v rozsahu 0–100 %. | ✅ |
| U1.5 | Given všechny přibalené ukázkové roky 2022–2025 (obě hlavičky ČEZ, časy s sekundami i bez, desetinná tečka i čárka). When se každý načte samostatně. Then žádný řádek se neodmítne a roční součty sedí na součet sloupce v CSV. | ✅ |

### U2 Špičky odběru

| ID | Scénář | Stav |
| --- | --- | --- |
| U2.1 | When si uživatel zobrazí TOP 10 dnů. Then je 10 položek seřazených sestupně a všechny patří do vybraného roku. | ✅ |
| U2.2 | Then nejnáročnější den je v zimním půlroce (říjen–březen). | ✅ |
| U2.3 | When zapne přepínač Den / noc. Then den + noc dává stejný součet jako bez rozdělení, a to v denní, týdenní i měsíční agregaci. | ✅ |
| U2.4 | Then bez rozdělení se den/noc vůbec nepočítá (žádná režie navíc). | ✅ |
| U2.5 | Then v noci se do sítě nedodává téměř nic (méně než 5 % roční dodávky), což ověřuje orientaci výpočtu slunce. | ✅ |
| U2.6 | When uživatel skryje sérii ve filtru pod grafem. Then z grafu zmizí, ale statistiky, doporučení kapacity ani simulace se nezmění – filtr je zobrazení, ne výběr dat. | ✅ |
| U2.7 | Given nahraný rok 2022. When přepne den/noc na „jen den“ a pak na „jen noc“. Then se obě poloviny v každém sloupci sečtou na nerozdělenou spotřebu (a za rok na `totalConsumption`), výroba se ořezáním nemění a poloha „obojí“ sloupce nechá být a rozpad dá jen do tooltipu. | ✅ |
| U2.8 | Given nahraná data. When zapne „Spotřeba pod osu“. Then se odebraná energie zrcadlí pod nulu, ale žádné číslo se nezmění a nikde se neobjeví negativní kWh; výchozí poloha je vypnuto. | ✅ |

### U3 Porovnání let

| ID | Scénář | Stav |
| --- | --- | --- |
| U3.1 | Given nahraný 2022. When nahraje 2025. Then oba roky jsou k dispozici a zobrazí se **nahraný** rok 2025; porovnání zapne kliknutím na odznak 2022. | ✅ |
| U3.2 | Then každý rok má vlastní statistiky, které se liší. | ✅ |
| U3.3 | Given export ve formátu `+A/… [kW]` s časy `HH:mm:ss` a řádky `24:00:00`. When se naparsuje. Then bez chyb a se všemi 35 040 řádky. | ❌ D1 (365 řádků/rok odmítnuto) |
| U3.4 | Given prázdný stav. When klikne na „Vyzkoušet s ukázkovými daty“. Then jsou k dispozici a vybrané všechny čtyři roky 2022–2025 a simulace jede přes 48 měsíců. | ✅ |
| U3.5 | Given celá ukázková sada. Then „úspora za rok“ nepřesáhne nejlepší jednotlivý rok o více než 5 % (čtyři roky ji nesmí zečtyřnásobit). | ✅ |
| U3.6 | Given import, který nese víc než jeden rok. When se načte. Then je aktivní měsíční zobrazení (denní sloupce za víc roků jsou nečitelné); import jednoho roku nechá denní. | ✅ |
| U3.7 | Given týdenní nebo měsíční zobrazení. When uživatel ukáže na sloupec (stačí kdekoli ve svislém pásu jednotky). Then vidí tu jednotku za **všechny nahrané roky**, jejich průměr a u každého roku odchylku od průměru se směrem; roky, které graf nekreslí, jsou odlišené. | ✅ |
| U3.8 | Given týdenní zobrazení s více roky. Then jeden svislý pás je jeden týden pro všechny roky (ne pondělí jednoho z nich), takže se pás při zoomu neposouvá; tooltip u každého roku uvede, které dny pondělí–neděle sečetl. | ✅ |
| U3.9 | Given celá ukázková sada. When přepne graf na „Dokoupená energie“. Then je v grafu jedna série na rok a její součet je přesně rozdíl ročního odběru a dodávky; kladná hodnota (dokoupeno) se kreslí na tutéž stranu nuly jako spotřeba, tedy podle přepínače „Spotřeba pod osu“. | ✅ |

### U4 Přetoky využitelné baterií

| ID | Scénář | Stav |
| --- | --- | --- |
| U4.1 | Then energie uložená do baterie je větší než 0 a nikdy nepřesáhne roční dodávku do sítě; použitá energie nepřesáhne uloženou. | ✅ |
| U4.2 | Then denní dokup s baterií je nezáporný, nikdy vyšší než bez baterie, a součet rozdílů se rovná „Snížení odběru ze sítě“. | ✅ |

### U5 Doporučení baterie a úspora

| ID | Scénář | Stav |
| --- | --- | --- |
| U5.1 | Then doporučená kapacita je 2–30 kWh, zaokrouhlená na 0,5 kWh. | ✅ |
| U5.2 | Then roční úspora = snížení dokupu × cena elektřiny. | ✅ |
| U5.3 | When porovná 5 kWh a 10 kWh. Then větší baterie neušetří méně a nemá méně ostrovních dnů. | ✅ |
| U5.4 | Given nahrané roky 2022 a 2025. Then „Roční úspora“ nepřesáhne nejlepší jednotlivý rok o více než 5 %. | ❌ M1 (součet přes roky) |

### U6 Ostrovní dny

| ID | Scénář | Stav |
| --- | --- | --- |
| U6.1 | Then počet ostrovních dnů odpovídá počtu označených dnů v denní analýze a procento je konzistentní. | ✅ |
| U6.2 | Then ostrovní den má dokup pod 0,01 kWh a neostrovní alespoň 0,01 kWh. | ✅ |

### U7 Co kdyby

| ID | Scénář | Stav |
| --- | --- | --- |
| U7.1 | When zdvojnásobí cenu elektřiny. Then úspora se přesně zdvojnásobí. | ✅ |
| U7.2 | When změní kapacitu na 15 kWh. Then simulace běží s novou konfigurací a stav baterie nikdy nepřekročí 15 kWh. | ✅ |

### U8 Sezónnost

| ID | Scénář | Stav |
| --- | --- | --- |
| U8.1 | Given jeden rok. Then měsíční analýza má přesně 12 měsíců téhož roku. | ❌ D4 („Leden 2023“ jako 13. měsíc) |
| U8.2 | Then v červnu–srpnu se uloží více než dvojnásobek toho, co v prosinci–únoru. | ✅ |

### U9 Výběr období

| ID | Scénář | Stav |
| --- | --- | --- |
| U9.1 | When vybere červenec 2022 v grafu. Then režim se přepne na „Výseč v grafu“ a aktivní záznamy jsou jen z vybraného rozsahu. | ✅ |
| U9.2 | When výběr zruší. Then statistiky jsou opět nad celými daty. | ✅ |

### U10 Správa dat

| ID | Scénář | Stav |
| --- | --- | --- |
| U10.1 | Given 2022 a 2025. When odebere 2025. Then zmizí jeho záznamy i měsíce ze simulace, která se přepočítá. | ✅ |
| U10.2 | When „Vymazat všechna data“. Then aplikace je v prázdném stavu (žádné záznamy, roky, simulace, výběr). | ✅ |

### U11 Chybové vstupy

| ID | Scénář | Stav |
| --- | --- | --- |
| U11.1 | Given soubor bez `+A`/`-A` v hlavičce. Then je odmítnut s českou hláškou, která říká, co má hlavička obsahovat. | ✅ |
| U11.2 | Given soubor s jedním vadným řádkem. Then ostatní řádky se načtou a chyba uvádí číslo řádku. | ✅ |

**Pokryto E2E testy** (`e2e/`): cesta k doporučení kapacity (E1), oba formáty exportu (E2), zobrazení nahraného roku a porovnání (E3), aktivní rozsah přes celou stránku (E4), úklid dat (E5), použití doporučení (E6), dotykové mazání a šířka na mobilu (E6m), přístupnost bez vážných bariér (E7), přetažení souborů na stránku (E8), přepínač den/noc a pět agregací (E9).

**Zbývá neautomatizované:** brush myší v grafu, přepínání lokality pro výpočet slunce.

---

## 6. Jak s testy pracovat

```bash
npx vitest run src/__tests__/userScenarios.test.ts --reporter=verbose
```

- Testy označené `it.fails` **musí selhat**. Po opravě příslušného nálezu začne Vitest hlásit „expected test to fail“. Odeberte `.fails`, test se stane regresní pojistkou.
- Nový scénář: přidejte řádek do tabulky výše a test se stejným ID. Používejte reálná data z `public/sample-data/`, ne ručně vyrobené záznamy, pokud scénář nevyžaduje přesně kontrolovaný vstup.
- Nezávislý orákl pro součty je funkce `rawKwhSum` v testu: počítá přímo z textu CSV, bez aplikačního parseru.
