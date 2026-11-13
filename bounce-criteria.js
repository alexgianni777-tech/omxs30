'use strict';

// Telegram OMXS30 STUDS: oversold RSI OR a close below the lower Bollinger band.
// %B between 0 and 0.05 is near the band, NOT below it.
// Keeps the historical trend and relative-strength constraints.
function qualifiesBounce(r) {
  if (!r || r.above200 !== true || !Number.isFinite(r.r63) || r.r63 <= 0) return false;
  return (Number.isFinite(r.rsi) && r.rsi < 35) ||
         (Number.isFinite(r.pctB) && r.pctB < 0);
}
module.exports = { qualifiesBounce };
