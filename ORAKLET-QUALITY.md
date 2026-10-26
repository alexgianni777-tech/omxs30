# Oraklet – treledat kvalitetsfilter (v1, 2026-10-26)

## Vad som sker
Den dagliga OMXS30-screeningen behåller D-1-stängningskursen och sin befintliga Telegram-/dashboard-struktur. Ny sektion **0B · ORAKLET TOPP 3** ger högst tre **QUALIFIED_WATCH**, inte köporder. Om ingen kvalificerar sig är resultatet uttryckligen noll.

Tre oberoende villkor måste vara uppfyllda:
- **Trend:** aktien över SMA50 och SMA200, positiv 21-dagarsavkastning, RSI 45–72 och relativ dagsvolym >=0,8×.
- **Relativ styrka:** RS21 >2 procentenheter och RS63 >5 procentenheter mot samma D-1 OMXS30. När indexet är under SMA50 krävs RS21 >4.
- **Rapportkvalitet:** företagets senast inlagda offentliga rapport måste ha positiv organisk omsättningstillväxt **och** förbättrad jämförbar marginal (YoY). Två mätetal baserade på bolagets egna publicerade siffror, inte historiska rapportdagsreaktioner.

Utöver dessa blockeras stora öppningsgap (|gap| >=3%) och verifierade kommande rapporter inom fem vardagar. Tidsstämplar måste vara <= dataprisets datum (ingen lookahead). Föregående rapport blir för gammal efter 120 kalenderdagar. Helgdagar räknas bara som helger i datumspärren, inte börsens hela helgdagskalender. Saknat/otillräckligt rapportunderlag ger WATCH och orsak, **aldrig** neutral eller automatiskt godkänd kvalitet.

Rapportkomponenten är ett **evidensfilter**, inte en prognos: tillväxt och marginaltrend säger inget säkert om förväntningsöverraskningar, framtida börsriktning eller rapporternas jämförbarhet mellan olika bolag. 0–100-poängen är bara intern prioritering, ingen uppmätt hit rate eller sannolikhet. Kursnivåer avser underliggande aktie och ska omvärderas till livekurs och produktspecifik risk.

## Rapportdata och uppdatering
Filen `report-quality.json` är en **manuellt källgranskad datakälla**, inte en automatiskt hämtad fundamentalfeed. v1 täcker Ericsson, Hexagon och Saab för Q3 2026; resterande bolag är omärkta. Lägg en ny, verifierad rapport från officiell IR i `reports[ticker]` med `period`, `releasedOn`, `availableFrom`, `sourceUrl`, `organicGrowthYoYPct`, `marginDeltaPp` och `marginBasis`. `availableFrom` ska vara första handelsdag då informationen fanns före relevant stängningskurs. Blanda aldrig marginalmått inom samma företags YoY-jämförelse. Ange inte uppskattningar som verifierade faktiska tal.

Den befintliga `earnings-upcoming.json` är separat och gles. Koden varnar när nästa rapportdatum saknas; uppdatera manuellt från IR innan affär. En nyligen publicerad rapport flaggas särskilt för rekylrisk. Historiken `earnings-history.json` fortsätter endast att vara bakgrund, aldrig ett eget positivt rapportbetyg.

## Bakåtkompatibilitet och kontroll
Legacy-kategorierna MOMENTUM/SQUEEZE/STUDS/SVAGAST finns kvar för bevakning och dashboardimport. Momentum högst 3 med RSI <=72; squeeze högst 2 och %B <=1; studs högst 2. Orakletsektionen använder inte `plan(LONG)` och skapar därför inte dubbla legacy-importer. Nya kvalificerade observationer loggas separat i `oraklet-candidates.csv` med data-/rapportdatum och käll-URL, idempotent vid omkörningar.

Tester: `node smoke-tests.js`, `node short-quality-tests.js`, `node oraklet-quality-tests.js`. CI kör syntax och dessa tester på pull requests. Ingen automatisk trading, inget Replit-beroende och ingen förändring av Telegram-token eller orderflöde.

För nästa version: jämför faktiska stängda signalutfall mot en kontrollgrupp efter spread, courtage, gap och urvalsbias, först därefter utvärdera statistisk edge.
