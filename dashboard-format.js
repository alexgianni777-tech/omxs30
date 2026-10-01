'use strict';

function normalizeDashboardText(text) {
  let out = String(text || '');

  out = out.replace(
    /SCREENER\s*[·•]\s*rapportdag\s+(\d{4}-\d{2}-\d{2})/,
    'SCREENER · $1',
  );

  out = out.replace(
    /plan\((LONG|SHORT)\): entry ~([\d.]+) · stop ([\d.]+) \(1\.2×ATR\) · mål ([\d.]+) \(([\d.]+)×ATR, R\/R ([\d.]+)\) · max (\d+) dagar/g,
    (_match, dir, entryRaw, stopRaw, target, targetMult, rr, holdDays) => {
      const entry = Number(entryRaw);
      const stop = Number(stopRaw);
      const oneR = 2 * entry - stop;
      return 'plan(' + dir + '): entry ~' + entry.toFixed(2) +
        ' · stop ' + stop.toFixed(2) + ' (1.2×ATR)' +
        ' · mål ' + target + ' (R/R ' + rr + ')' +
        ' · 1R ' + oneR.toFixed(2) +
        ' · måltyp ' + targetMult + '×ATR' +
        ' · max ' + holdDays + ' dagar';
    },
  );

  return out;
}

module.exports = { normalizeDashboardText };
