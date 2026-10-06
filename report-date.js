'use strict';

// Report date is the publication/trading decision day. The screener itself
// deliberately anchors all levels to the PREVIOUS completed Stockholm weekday.
// Therefore a Tuesday morning retry must remain a Tuesday report (using Monday
// close), rather than being relabelled Monday and skipped as already sent.
function reportDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  // Weekend runs belong to Friday; weekday runs keep today's report label.
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

if (require.main === module) console.log(reportDate(new Date()));
module.exports = reportDate;
