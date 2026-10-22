# SHORT SQUEEZE / REVERSAL – AG Invest

## Syfte
Separat observationslista för SCA och SKF. **Ingen köporder, inga extra Telegram-meddelanden och ingen rapportspärr.**
OMXS30:s befintliga fyra kategorier och dashboardens planformat är oförändrade.

## Datakälla
Aggregerade korta nettopositioner enligt [Finansinspektionen](https://www.fi.se/sv/vara-register/blankningsregistret/). Summan inkluderar rapporteringspliktiga positioner från 0,1% av emitterat aktiekapital. Den är **inte** total blankning och är inte intradagsdata.

En egen GitHub Actions-körning hämtar FI:s officiella publika positionslista **en gång per svensk handelsvardag kl 18:30**. Ingen masshämtning eller historisk scraping. Om webbplatsens format ändras eller något värde saknas: ingen felaktig observation skrivs. Kontrollera workflow-run och uppdatera manuellt vid behov.

`short-interest-history.json` har märkta observationer, källa och publiceringsdatum. Läs endast observationer som både observerats och publicerats **senast samma datum som prisdatan** (ingen framtidsinformation i historiska utvärderingar). En 5–10-dagars blankningstrend visas först när tillräcklig observationstid finns.

## Kriterier (hypoteser, ej bevisad edge)
- Rapporterad aggregerad blankning **minst 5%**.
- Bekräftad dagsstängning över föregående 20 handelsdagars högsta **eller** återtag av SMA20 jämfört med föregående dags läge.
- Minst **1,5×** 20-dagars volym.
- Högst **tre vardagar gammal** FI-observation, annars gammal data – ingen signal.
- En verklig bolagskatalysator och rimlig spread/R:R efter kostnader måste fortfarande verifieras **manuellt**.

Status `TECHNICAL_WATCH` betyder **endast teknisk observation baserad på D-1**, aldrig `TRADEABLE`. För rapport, gap, vinsthemtagning, stop och positionsstorlek gäller övrig manuell process.

## Loggning
En daglig rad per bevakat bolag i `short-squeeze-watch.csv`. Befintliga `candidates-log.csv` ändras inte. Använd fler datapunkter för att validera netto-R/R, out-of-sample och falska signaler innan strategin tas i skarpt bruk.

## Köra
```bash
node smoke-tests.js
node short-interest-refresh.js   # manuellt FI-anrop
REPORT_DATE=YYYY-MM-DD node omxs30-screener.js
```

`short-interest-refresh.js` kan stoppas av FI eller webbförändringar. I så fall lever befintlig screener vidare och visar föråldrad blankningsdata som sådan.
