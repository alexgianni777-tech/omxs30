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

// Pick one common session for every series. Prefer the requested report day.
// If that is not available everywhere, allow exactly the previous weekday.
// This avoids mixing current and stale bars in the same ranking.
function chooseCommonDataDate(reportDate, seriesList) {
  if (!seriesList.length || seriesList.some(bars => !bars?.length)) {
    throw new Error('Saknar prisserie');
  }

  const hasDate = (bars, date) => bars.some(b => ymd(b.t) === date);
  if (seriesList.every(bars => hasDate(bars, reportDate))) {
    return { dataDate: reportDate, delayed: false };
  }

  const fallback = previousWeekday(reportDate);
  if (seriesList.every(bars => hasDate(bars, fallback))) {
    return { dataDate: fallback, delayed: true };
  }

  throw new Error('Ingen gemensam prisdag inom högst en handelsdags fördröjning');
}

module.exports = { chooseCommonDataDate, previousWeekday, ymd };
