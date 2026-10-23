# AG Invest – kvalitetssäkring av korta affärer

## Princip
Den dagliga screenern är ett **D-1-urvalsverktyg**, inte en ordermotor. `SVAGAST` visar bara kvalitetssäkrade shortbevakningar. Tidigare presenterades nästan alla under SMA50 som shorts, även efter extrema nedgångar.

`short-quality.js` kräver giltig kurs/ATR/RSI/Bollinger, kurs under SMA50, negativ 21-dagars avkastning, negativ relativ styrka mot OMXS30 på 21 dagar, RSI strikt över 35 och under 65, och att priset inte är vid nedre Bollinger-bandet. Stora dagsgap under -2,5% samt över +2,5% väntar på separat bekräftelse. Bekräftad rapport inom fem *vardagar* blockerar nya shorts i bevakningslistan. Helgdagar hanteras inte exakt.

Kvalitetspoäng 0–100 används enbart för intern **rangordning av bevakningar**, inte som prognostiserad sannolikhet för vinst eller backtestad edge. Urvalet kan vara tomt när marknaden redan fallit kraftigt. I utskriftens 4B syns varför de svagaste kandidaterna stoppas.

## Rapportdatum
`earnings-upcoming.json` innehåller **endast manuellt verifierade** framtida datum. Saknat, passerat eller felaktigt datum märks med `RAPPORTDATUM_EJ_VERIFIERAT` – frånvaro betyder **inte** att rapport saknas. Kontrollera mot bolagets IR-sida före en affär och underhåll filen regelbundet. Rapportreaktionshistorik styr inte urvalet.

## Entry, stop och hävstång
Visade entry/stop/mål gäller **underliggande aktie**, aldrig direkt priset på en mini future eller turbo. Beräkna faktisk risk i det instrument du ska handla, kontrollera finansieringsnivå, knock-out, spreaddata, avgifter och möjlighet till gap över stop. En shortbevakning kräver en ny signal/retest och validerad aktuell kurs. Aldrig automatisk affär.

Ordinarie affärsram 4–8× hävstång, rapporttrade högst 4× enligt användarens policy. Dessa hävstångstal används INTE för att automatiskt multiplicera prognoser.

## Utvärdering
Testa reglerna med walk-forward på korta affärer och verkliga transaktionskostnader innan du kallar urvalet lönsamt. Testerna `node smoke-tests.js` och `node short-quality-tests.js` kontrollerar koderna, men **bevisar ingen vinstfördel**.

Den befintliga kategorin SHORT SQUEEZE / REVERSAL analyserar en möjlig **uppåtgående vändning** i redan blankade aktier. Det är en annan strategi och har inte ändrats. Telegram och dashboard behåller sitt ordinarie huvudformat.
