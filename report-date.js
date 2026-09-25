'use strict';

// Determine the latest completed Stockholm weekday trading session. On retry runs,
// target the previous weekday even if the retry was delayed until later today.
function reportDate(now = new Date(), retry = false) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (retry || Number(parts.hour) < 19) day.setUTCDate(day.getUTCDate() - 1);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

if (require.main === module) console.log(reportDate(new Date(), process.argv.includes('--retry')));
module.exports = reportDate;
