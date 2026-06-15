'use strict';

/**
 * ============================================================
 *  OMXS30 EDGE EVALUATOR  ·  kör:  node evaluate.js
 * ============================================================
 *  Läser candidates-log.csv (skapad av screenern) PLUS dina egna
 *  utfall, och svarar på den enda frågan som betyder något:
 *
 *      Har jag-plus-maskinen en edge som tjänar pengar — eller
 *      känns det bara så?
 *
 *  WORKFLOW
 *  1. Screenern loggar kandidater till candidates-log.csv.
 *  2. När du TAR en trade: öppna CSV:n och fyll i tre kolumner
 *     längst till höger på den raden:
 *        taken   = 1   (du tog traden; lämna tomt för de du avstod)
 *        result_R = utfallet i R, dvs vinst/förlust delat med din
 *                   ursprungliga risk. +1 = du nådde 1R, -1 = stoppad,
 *                   +0.4 = liten vinst, -0.5 = halv stop, osv.
 *        note    = valfri kommentar
 *  3. Kör:  node evaluate.js
 *
 *  Skriptet räknar vinstandel, snitt-R, förväntan och payoff PER
 *  setup-typ (momentum/squeeze/bounce) och kör sen en Monte Carlo
 *  över din faktiska statistik: sannolikhet att vara i vinst efter
 *  N trades, risk för djup drawdown, och Kelly-andel.
 *
 *  Behöver minst ~15–20 tagna trades för att betyda något. Färre =
 *  för lite data, brus dominerar. Skriptet säger till.
 * ============================================================
 */

const fs = require('fs');

const LOG = 'candidates-log.csv';
const SIMULATIONS = 10000;
const HORIZON_TRADES = 100;     // simulera en framtida serie om så många trades
const RUIN_DRAWDOWN = 0.5;      // "ruin" = -50% på serien (i R-termer mot startbankrulle)
const START_UNITS = 100;        // startbankrulle i R-enheter (för drawdown-matten)

/* ---------------- läs & parsa CSV ---------------- */
function loadRows() {
  if (!fs.existsSync(LOG)) {
    console.error(`Hittar inte ${LOG}. Kör screenern först och fyll i utfall.`);
    process.exit(1);
  }
  const lines = fs.readFileSync(LOG, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',').map(h => h.trim());
  const idx = name => header.indexOf(name);
  const iTaken = idx('taken'), iRes = idx('result_R');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const taken = iTaken >= 0 ? c[iTaken] : '';
    const resRaw = iRes >= 0 ? c[iRes] : '';
    rows.push({
      date: c[0], list: c[1], name: c[2], ticker: c[3],
      taken: String(taken).trim() === '1',
      resultR: resRaw === '' || resRaw == null ? null : parseFloat(resRaw),
    });
  }
  return rows;
}

/* ---------------- statistik ---------------- */
function statsFor(trades) {
  const wins = trades.filter(t => t.resultR > 0);
  const losses = trades.filter(t => t.resultR <= 0);
  const n = trades.length;
  const winRate = n ? wins.length / n : 0;
  const avgWin = wins.length ? wins.reduce((a, t) => a + t.resultR, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, t) => a + t.resultR, 0) / losses.length) : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss; // i R per trade
  const totalR = trades.reduce((a, t) => a + t.resultR, 0);
  // Kelly (asymmetrisk): f = p - q/b,  b = avgWin/avgLoss
  const b = avgLoss > 0 ? avgWin / avgLoss : 0;
  const kelly = b > 0 ? winRate - (1 - winRate) / b : 0;
  return { n, wins: wins.length, losses: losses.length, winRate, avgWin, avgLoss, expectancy, totalR, b, kelly };
}

/* ---------------- Monte Carlo (Oraklet) ---------------- */
function monteCarlo(trades) {
  // bootstrap: dra slumpmässiga trade-utfall MED återläggning ur din egen historik
  const pool = trades.map(t => t.resultR);
  if (pool.length < 2) return null;
  const finals = [], maxDDs = [];
  let ruin = 0, profit = 0;
  const ruinLevel = START_UNITS * (1 - RUIN_DRAWDOWN);
  for (let s = 0; s < SIMULATIONS; s++) {
    let eq = START_UNITS, peak = START_UNITS, dd = 0, ruined = false;
    for (let i = 0; i < HORIZON_TRADES; i++) {
      eq += pool[Math.floor(Math.random() * pool.length)]; // +1R per "unit" risk
      if (eq > peak) peak = eq;
      const cur = (peak - eq) / peak;
      if (cur > dd) dd = cur;
      if (eq <= ruinLevel) ruined = true;
    }
    finals.push(eq); maxDDs.push(dd);
    if (ruined) ruin++;
    if (eq > START_UNITS) profit++;
  }
  finals.sort((a, b) => a - b); maxDDs.sort((a, b) => a - b);
  const pct = (arr, p) => arr[Math.floor((arr.length - 1) * p)];
  return {
    pProfit: profit / SIMULATIONS,
    pRuin: ruin / SIMULATIONS,
    medianFinalR: pct(finals, 0.5) - START_UNITS,
    p5: pct(finals, 0.05) - START_UNITS,
    p95: pct(finals, 0.95) - START_UNITS,
    medianMaxDD: pct(maxDDs, 0.5),
    p95MaxDD: pct(maxDDs, 0.95),
  };
}

/* ---------------- presentation ---------------- */
const pc = v => (v * 100).toFixed(1) + '%';
const r2 = v => v.toFixed(2);

function printStats(label, s) {
  console.log(`\n— ${label} —`);
  console.log(`  Trades: ${s.n}  (${s.wins}V / ${s.losses}F)   Träffsäkerhet: ${pc(s.winRate)}`);
  console.log(`  Snittvinst: +${r2(s.avgWin)}R   Snittförlust: -${r2(s.avgLoss)}R   (payoff b=${r2(s.b)})`);
  console.log(`  Förväntan/trade: ${s.expectancy >= 0 ? '+' : ''}${r2(s.expectancy)}R    Summa hittills: ${s.totalR >= 0 ? '+' : ''}${r2(s.totalR)}R`);
  if (s.kelly > 0) console.log(`  Kelly: ${pc(s.kelly)} av bankrullen per trade (använd HALVA = ${pc(s.kelly / 2)} i praktiken)`);
  else console.log(`  Kelly: negativ → matematiskt ska du INTE handla denna setup som den ser ut nu.`);
}

function main() {
  const rows = loadRows();
  const taken = rows.filter(t => t.taken && t.resultR != null && isFinite(t.resultR));

  console.log(`\nOMXS30 EDGE EVALUATOR · ${new Date().toISOString().slice(0, 10)}`);
  console.log(`Loggade kandidater: ${rows.length}   ·   Tagna trades med utfall: ${taken.length}`);

  if (taken.length < 5) {
    console.log(`\nFör lite data ännu (${taken.length} trades). Fyll i fler utfall i ${LOG}.`);
    console.log(`Påminnelse om kolumnerna: lägg till "taken", "result_R", "note" längst till höger.`);
    console.log(`  taken=1 för tagna trades · result_R = vinst/förlust i R (+1 = nådde 1R, -1 = stoppad).`);
    return;
  }

  const all = statsFor(taken);
  printStats('ALLA tagna trades', all);

  // per setup-typ
  for (const list of ['momentum', 'squeeze', 'bounce']) {
    const sub = taken.filter(t => t.list === list);
    if (sub.length >= 5) printStats(`Setup: ${list}`, statsFor(sub));
  }

  console.log('\n──────────── MONTE CARLO (Oraklet) ────────────');
  if (taken.length < 15) {
    console.log(`Bara ${taken.length} trades — simuleringen körs men ÄR OPÅLITLIG under ~15–20.`);
    console.log('Tolka den som en fingervisning, inte ett facit.');
  }
  const mc = monteCarlo(taken);
  if (mc) {
    console.log(`Över ${HORIZON_TRADES} framtida trades (bootstrap ur din egen historik):`);
    console.log(`  Sannolikhet att vara i vinst:        ${pc(mc.pProfit)}`);
    console.log(`  Risk för -${RUIN_DRAWDOWN * 100}% drawdown ("ruin"):   ${pc(mc.pRuin)}`);
    console.log(`  Median-utfall:  ${mc.medianFinalR >= 0 ? '+' : ''}${r2(mc.medianFinalR)}R   (p5 ${r2(mc.p5)}R · p95 +${r2(mc.p95)}R)`);
    console.log(`  Typisk värsta drawdown: ${pc(mc.medianMaxDD)} (median) · ${pc(mc.p95MaxDD)} (p95 — värsta 5%)`);
  }

  console.log('\n──────────── DOMEN ────────────');
  if (all.expectancy > 0.05 && taken.length >= 20 && mc && mc.pProfit > 0.7) {
    console.log('✅ Positiv förväntan med rimlig datamängd. Edgen ser ut att finnas.');
    console.log('   Fortsätt smått, öka först när fler trades bekräftar det. Half-Kelly som tak.');
  } else if (all.expectancy > 0) {
    console.log('🟡 Svagt positiv förväntan. Lovande men inte bevisat — samla fler trades innan du ökar.');
  } else {
    console.log('🔴 Negativ förväntan i datan hittills. Antingen otur i ett litet urval, eller så');
    console.log('   saknas edgen. Ändra INTE upp insatsen. Granska: tar du för svaga setups, för');
    console.log('   snäva mål mot ATR, eller äter courtaget vinsten? Mät om efter förändring.');
  }
  console.log('\nUrvals- och analysverktyg, inte rådgivning. Liten insats tills datan bär.\n');
}

main();
