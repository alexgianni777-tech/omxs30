'use strict';

    // Sent only after the final data retry. No trading plans are included.
    async function main() {
      const date = process.argv[2];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Ogiltigt rapportdatum');
      const token = process.env.TELEGRAM_TOKEN;
      const chat = process.env.TELEGRAM_CHAT_ID;
      if (!token || !chat) throw new Error('Saknar Telegram-inställningar');
      const text = '⚠️ OMXS30-rapport för ' + date + ' saknas fortfarande. ' +
        'Kompletta dagskurser för index och aktier finns inte tillgängliga. ' +
        'Ingen handelslista eller dashboard-import har skickats för den dagen. ' +
        'Om datan kommer efter återförsöken kan datumet köras om manuellt i GitHub Actions.';
      const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text }),
      });
      if (!res.ok) throw new Error('Telegram HTTP ' + res.status);
      console.log('Saknad rapport meddelad för ' + date);
    }

    main().catch(error => { console.error(error.message); process.exitCode = 1; });
    