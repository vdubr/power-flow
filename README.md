# Solar Analytics

Webová aplikace pro majitele fotovoltaiky, kteří se rozhodují, **zda a jakou baterii koupit**. Nahrajete dva CSV exporty z portálu ČEZ Distribuce, aplikace ukáže spotřebu a výrobu a spočítá, jaká kapacita baterie by se vám vyplatila. Data se nikam neodesílají, vše běží v prohlížeči.

## Co aplikace dělá

1. **Import** CSV z ČEZ Distribuce (Windows-1250, oddělovač `;`, 15minutové intervaly v kW)
   - hlavičky `+A/XXXXXXXX [kW]` (odběr ze sítě) nebo `-A/XXXXXXXX [kW]` (přetoky do sítě), alternativně `a+` / `a-`
   - více souborů a více let najednou
   - hlásí, kolik řádků se nepodařilo přečíst a kolik intervalů ČEZ označil jako neplatné měření
   - po importu potvrdí, co se načetlo, a přepne graf i statistiky na nahraný rok
2. **Zobrazení bilance** – graf s agregací 15min / hodinovou / denní / týdenní / měsíční, filtr sérií pod grafem, TOP dny, porovnání let, přiblížení grafu, které zároveň slouží jako výseč pro celou stránku
   - přepínačem **„Spotřeba pod osu"** (výchozí vypnuto) se dá graf překlopit: odebraná energie se pak zrcadlí pod nulu a dvě strany elektroměru se dají srovnat pohledem, místo aby se porovnávaly dva sloupce vedle sebe. Osa ani žádné číslo v UI přitom neukazuje negativní kWh — pod nulou je zrcadlená geometrie, ne negativní energie
   - dvě zobrazení, přepínač u volby agregace: **„Odběr a dodávka"** kreslí obě veličiny proti sobě, **„Dokoupená energie"** jednu sérii na rok — spotřeba minus výroba, tedy kolik po odečtení přetoků zbylo dokoupit
   - **průměr** právě vykreslených sérií je v grafu proložený přerušovanou čarou, jedna na veličinu
   - denní, týdenní a měsíční zobrazení jsou sloupcová; import s více roky se otevře rovnou v měsíčním, kde je porovnání čitelné
   - **filtr dat** pod grafem má řádek na spotřebu a řádek na výrobu, každý s přepínačem celé veličiny a s čipem na každý nahraný rok (v „Dokoupené energii" je řádek jediný a bez přepínače veličiny); skrytí série mění jen graf, ne statistiky. Ukázání na čip (nebo tabulátor na něj) zvýrazní odpovídající sérii v grafu — se čtyřmi roky je čip jediné místo, kde se dá série odlišit od sousedních
   - v týdenním a měsíčním zobrazení ukázání na svislý pás jednotky vypíše ten týden či měsíc za **všechny nahrané roky**, jejich průměr a odchylku od něj (i pro roky, které graf právě nekreslí)
   - čtyřstavový přepínač **Suma / Den i noc / Jen den / Jen noc** na konci řádku spotřeby platí pro kterékoli zobrazení: „Suma" a „Den i noc" kreslí stejné sloupce a druhý z nich jen přidá rozpad do popisku u kurzoru, „Jen den" a „Jen noc" data v grafu i v popisku ořežou. U 15min a hodinového zobrazení není co v jednom bodě dělit, takže jakýkoli stav kromě „Sumy" vyznačí noční hodiny pásy (jen u jednoho vybraného roku — dva roky pásů přes sebe se nedají přečíst)
   - tlačítko v hlavičce karty grafu zvětší graf **na celou obrazovku**
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

| Varianta exportu | První řádek dne | Poslední řádek roku |
| --- | --- | --- |
| bez sekund (ukázková data 2022, 2023) | `01.01.2022 00:15` | `01.01.2023 00:00` |
| se sekundami (ukázková data 2024, 2025) | `01.01.2025 00:15:00` | `31.12.2025 24:00:00` |

Varianta času nesouvisí s hlavičkou: označení `a+`/`a-` i `+A/… [kW]` se objevuje v obou (2023 má novou hlavičku, ale staré časy bez sekund). Proto se typ dat pozná z hlavičky a čas se parsuje nezávisle.

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
| Spotřeba ve dne / v noci | rozdělení podle východu a západu slunce pro lokalitu z importního pruhu | aktivní rozsah |
| Úspora za rok | `(ušetřený nákup − ušlý výkup) × 365 / počet dnů` | přepočteno na rok |
| Doporučená kapacita | koleno křivky úspora–kapacita | aktivní rozsah |
| Dny bez dokupu | dny s nulovým odběrem, oddělené od dnů, které by takové byly i bez baterie | aktivní rozsah |
| Pokrytí odběru baterií | `snížení odběru / původní odběr`, vážené energií | aktivní rozsah |

**Den a noc.** „Den" je od východu do západu slunce pro lokalitu vybranou chipem v importním pruhu (výchozí Praha), noc je zbytek. Rozhodnutí dělá jediná funkce `createIsDayPredicate` v `src/utils/dayNight.ts`, takže rozpad v grafu, noční pásy i statistiky nemohou říkat něco jiného. Ruční okno hodin (`dayNightConfig.mode: 'manual'`) v kódu i v typech zůstává a používají ho testy, ale se zrušením karty „Nastavení grafu" k němu přestalo vést jakékoli UI — pro uživatele je „den" vždy podle slunce. Výroba se nerozděluje, protože fotovoltaika po západu slunce do sítě nedodává.

Statistické dlaždice „Spotřeba ve dne / v noci" ukazují obě poloviny vždy, nezávisle na přepínači pod grafem: ten je nastavení grafu, ne filtr dat.

**Aktivní rozsah** je jediná podmnožina dat, se kterou pracuje graf, statistiky i simulace baterie současně. Přepíná se v ovládacím prvku v hlavičce sekcí: vybrané roky, poslední rok, nebo **výseč v grafu** — tedy rozsah, na který je graf právě přiblížený. Zoom a výseč jsou jedna věc, takže v grafu není žádný nástroj na tažení výseče a volba je dostupná vždy (bez přiblížení znamená celý rozsah). Když je graf přiblížený, vypisuje se rozsah vpravo nad ním. Při porovnání více let sdílí roky jednu osu měsíc-den, kde jeden konkrétní časový rozsah neexistuje; popisek tam proto vypisuje názvy krajních kategorií a jako výseč se takový zoom použít nedá — režim „Výseč v grafu" pak pracuje s celým rozsahem.

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
│   ├── Chart/           # graf, volba agregace, přepínač zobrazení, filtr sérií, celá obrazovka
│   ├── Common/          # sdílené dlaždice, hlavičky sekcí, přepínač rozsahu
│   ├── Configuration/   # formuláře nastavení (baterie)
│   ├── DataImport/      # drop zóna, odznaky roků, chip lokality, návod, ukázková data
│   ├── Layout/          # hlavička a shell aplikace
│   └── Statistics/      # statistiky, doporučení kapacity, analýza baterie
├── hooks/
│   ├── useFullscreen.ts       # karta grafu na celou obrazovku
│   ├── useGlobalDropGuard.ts  # drop mimo zónu neotevře CSV v prohlížeči
│   └── useSmoothWheelZoom.ts
├── store/
│   └── energyStore.ts   # data, aktivní rozsah, simulace, doporučení
├── theme/               # MUI téma a ECharts téma „observatory"
├── types/
│   └── energy.ts        # všechny TS typy
├── utils/
│   ├── batteryAlgorithm.ts    # simulace, křivka kapacity, doporučení
│   ├── batteryChartOptions.ts # ECharts options pro obrazovku baterie
│   ├── chartSeriesBuilder.ts  # série hlavního grafu, čipy filtru, průměr, výseč ze zoomu
│   ├── csvParser.ts           # parsování exportu ČEZ
│   ├── dataAggregation.ts     # agregace, TOP dny, filtr rozsahu
│   ├── dateUtils.ts           # klíče podle lokálního času, NE UTC
│   ├── dayNight.ts            # jediné rozhodnutí „byl den?“ pro celou aplikaci
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

`public/sample-data/2022`–`2025` jsou skutečné exporty jednoho odběrného místa (35 040 řádků na soubor, 35 136 v přestupném 2024) v obou formátech, které ČEZ produkuje:

| Rok | Hlavička | Časy | Desetinný oddělovač | Kódování |
| --- | --- | --- | --- | --- |
| 2022 | `a+` / `a-` | `DD.MM.YYYY HH:mm` | tečka | UTF-8 s poškozenou diakritikou ve sloupci Status (nález D9) |
| 2023 | `+A/… [kW]` | `DD.MM.YYYY HH:mm` | tečka | Windows-1250 |
| 2024, 2025 | `+A/… [kW]` | `DD.MM.YYYY HH:mm:ss` včetně `24:00:00` | čárka | Windows-1250 |

Soubory jsou verzované s `-text` v `.gitattributes`, aby zůstaly bajtově věrné, včetně CRLF a kódování.

Tlačítko **„Vyzkoušet s ukázkovými daty“** načte všechny čtyři roky jedním importem (`SAMPLE_DATA_YEARS` v `src/constants.ts`), takže uživatel bez vlastního exportu vidí i porovnání let. Roky se přidávají do storu jednou dávkou, aby se simulace baterie a křivka kapacity počítaly jen jednou.

## Deployment

Projekt je připravený pro Vercel: propojit GitHub repozitář, Vite se detekuje automaticky.
