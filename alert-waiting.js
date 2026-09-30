'use strict';

// Sends one informational Telegram message when the daily screener is waiting
// for complete Yahoo daily bars. No trading plans are included.
async function main() {
  const date = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    throw new Error('Ogiltigt rapportdatum');
  }

  const token = process.env.TELEGRAM_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) throw new Error('Saknar Telegram-inställningar');

  const text =
    '⏳ OMXS30-rapporten för ' + date + ' väntar på kompletta dagskurser från Yahoo. ' +
    'GitHub försöker automatiskt igen var 20:e minut. Ingen gammal handelslista skickas.';

  const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text }),
  });

  if (!res.ok) throw new Error('Telegram HTTP ' + res.status);
  console.log('Väntestatus skickad för ' + date);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
