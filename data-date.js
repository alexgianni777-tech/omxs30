'use strict';

function ymd(timestampSeconds) {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

function previousWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  do d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

// Deliberate one-trading-day lag: report day D ALWAYS uses D-1 close.
// Never silently upgrade to same-day data in an evening run, and never fall
// back to D-2. Every series must contain the exact same target session.
function chooseCommonDataDate(reportDate, seriesList) {
  if (!seriesList.length || seriesList.some(bars => !bars?.length)) {
    throw new Error('Saknar prisserie');
  }

  const target = previousWeekday(reportDate);
  const hasDate = (bars, date) => bars.some(b => ymd(b.t) === date);
  if (seriesList.every(bars => hasDate(bars, target))) {
    return { dataDate: target, delayed: true };
  }

  throw new Error(`Saknar gemensam prisdag ${target} (föregående handelsdag)`);
}

module.exports = { chooseCommonDataDate, previousWeekday, ymd };
