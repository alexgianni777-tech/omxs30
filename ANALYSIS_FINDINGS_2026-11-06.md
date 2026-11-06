# AG Invest – historisk Asset Screen-granskning, 6 november 2026

**Status: FORSKNING, INTE VALIDERADE HANDELSSIGNALER.** Inga förändringar i ordinarie screener, Replit eller orderregler. GitHub Actions-körning: https://github.com/alexgianni777-tech/omxs30/actions/runs/42304582674

## Underlag

- Datakälla: arkiverade `candidates-log.csv` (GitHub PR-checkout inkluderade huvudgrenens tillägg från 6 november) och historiska Yahoo Finance OHLC.
- 671 rader med 18 kolumner; 9 upprepningar av samma datum/kategori/ticker togs bort; **662 unika kompletta planrader** bedömdes.
- 568 äldre rader med bara 12 kolumner saknar färdig entry/stop/target och utelämnades.
- 60 distinkta signaldatum i materialet, från augusti till 6 november; resultatkapning 2026-11-06.
- 416 planrader (62,8 %) fick ett simulerat avslut med beräkningsbart resultat. Övriga saknar entry, har ännu inte nått tillräcklig horisont, har ogiltigt gap före entry eller en tvetydig OHLC-ordning.
- Beräkningsantagande: indikativ rundtur-kostnad 20 baspunkter (0,20 %) på underliggande, dividerat med riskavståndet till stop. **Detta är inte verkliga kostnader för turbos, mini futures eller warranter.**
- `R` är resultatrisk relativt planerat entry–stop-avstånd, inte procent på kontokapitalet.

## Sammanlagd analys, endast affärer med bestämbart avslut

| Utfall | Resultat |
|---|---:|
| Avslut | 416 |
| Brutto expectancy | +0,0101 R |
| Netto expectancy efter antagen kostnad | **−0,0788 R** |
| Träffsäkerhet, netto | 40,1 % |
| Profit factor, netto | **0,875** |
| Indikativt 95 %-intervall för netto-expectancy (bootstrap per signaldag) | −0,2151 till +0,0510 R |

Observera att bootstrapintervallet korsar noll. Det ger **inte statistiskt stöd för en positiv total trading-edge**.

## Strategier

| Screenerkategori | Planer | Simulerade avslut | Netto expectancy / avslut | Profit factor | Dagsklustrat indikativt 95 %-intervall |
|---|---:|---:|---:|---:|---|
| Momentum | 284 | 197 | +0,0863 R | 1,154 | −0,1131 till +0,2755 |
| Squeeze | 145 | 95 | +0,0557 R | 1,083 | −0,1959 till +0,3282 |
| Bounce/Studs | 53 | 21 | −0,1349 R | 0,778 | −0,6432 till +0,3961 |
| Weakest/Svagast (short) | 180 | 103 | **−0,5070 R** | **0,313** | −0,6744 till −0,3116 |

Momentum och Squeeze är **intressanta hypoteser, inte bevisade vinnare**. Svagast-short presterade svagt i detta begränsade urval, men det betyder inte att shorts generellt är olönsamma eller att modellen testats genom en sammanhängande bear market.

## Trend: indexbaserad observationsjämförelse

**Denna körning använder en enkel historisk OMXS30-proxy** med färdigstängda dagskurser, SMA20/50/200 och 20-dagars kursriktning. Den innehåller **inte** historisk marknadsbredd eller full Great Defence 2.0-logik.

| Placering relativt proxytrend | Planer | Avslut | Netto expectancy | Profit factor |
|---|---:|---:|---:|---:|
| Med indextrenden | 152 | 98 | −0,1611 R | 0,774 |
| Mot indextrenden | 60 | 30 | −0,3714 R | 0,421 |
| Neutral indextrend | 438 | 279 | −0,0151 R | 0,975 |
| Okänt indexläge | 12 | 9 | −0,1805 R | 0,759 |

**Viktig begränsning:** I detta fönster klassades 20 signaldagar som BULLISH och 39 som NEUTRAL, **inga som BEARISH** med den strikta SMA-proxyn; en dag var okänd. Med-trend är därför i huvudsak longs under bullperioder och mot-trend i huvudsak shorts under samma perioder. Grupperna är **inte jämförbara som ett randomiserat experiment**. Resultatet visar inte att Great Defence 2.0 ger vinst eller att man ska blanka mer.

## Risker och datakvalitet

- Historiska signalers **publiceringstidpunkt är inte verifierad**. Det går inte att utesluta retrospektivt skapade rekommendationer eller informationsläckage.
- Dags-OHLC avslöjar inte om stop eller mål träffades först under en viss handelsdag. Tvetydiga uppslag utesluts; marknadsöppningsgap mot position redovisas separat.
- Många signaler gäller samma ticker återkommande dagar. Resultaten är **korrelerade**; raderna kan inte summeras till en realistisk portfölj.
- Kostnaderna är schabloner; minifuture-knockout, spread, courtage, finansiering, valutapåverkan och handelns exekvering saknas.
- Kort fönster och frånvaro av verklig bearish klassificering gör resultatet svagt som bevis för trendstrategier.
- Den nya Great Defence 2.0-koden i EdgeAI är fortfarande rådgivande och är **inte historiskt kvalificerad av denna körning**.

## Styrelsens forskningsbeslut

1. Avstå från att marknadsföra screenern som lönsam eller presentera historiskt resultat som prognos.
2. Undersök varför Svagast-short ger stora negativa utfall; separera mottrendsshorts och verkliga bearish regimer.
3. Utvärdera Momentum och Squeeze i framtida **oförändrade, tidsstämplade** observationer utan ny optimering mot samma sample.
4. Utvärdera full Great Defence 2.0 på separat historik inklusive genuina bearish/stressade perioder och kontrollera om riskjusterad nettoavkastning förbättras.
5. Förbli `RESEARCH ONLY`: inga automatiska entry-godkännanden. Ingen Replit-utveckling ingår.

*Observera: Det här dokumentet är en ögonblicksbild av en explorativ GitHub-körning, inte en revisionssäkrad handelshistorik.*
