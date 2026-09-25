'use strict';

/**
 * notify.js — kör ett av skripten och skickar utskriften till Telegram.
 * Anrop:  node notify.js <skript>
 *   t.ex. node notify.js omxs30-screener.js
 *         node notify.js omxs30-backtest.js
 *         node notify.js omxs30-evaluate.js
 *
 * Hemligheter via miljövariabler (GitHub Secrets):
 *   TELEGRAM_TOKEN, TELEGRAM_CHAT_ID
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const script = process.argv[2] || 'omxs30-screener.js';

const ALLOWED = ['omxs30-screener.js', 'omxs30-backtest.js', 'omxs30-evaluate.js'];
if (!ALLOWED.includes(script)) {
  console.error('Okänt skript:', script, '— tillåtna:', ALLOWED.join(', '));
  process.exit(1);
}

async function sendTelegram(text) {
  if (!TOKEN || !CHAT_ID) {
    throw new Error('Saknar TELEGRAM_TOKEN / TELEGRAM_CHAT_ID');
  }
  const header = `📊 ${script.replace('omxs30-', '').replace('.js', '').toUpperCase()} · ${process.env.REPORT_DATE || new Date().toISOString().slice(0, 10)}\n`;
  const full = header + text;
  let s = full;
  const chunks = [];
  while (s.length > 0) { chunks.push(s.slice(0, 3800)); s = s.slice(3800); }
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: '```\n' + chunk + '\n```', parse_mode: 'Markdown' }),
    });
    if (!res.ok) throw new Error('Telegram HTTP ' + res.status);
    await new Promise(r => setTimeout(r, 400));
  }
}

async function importDashboard(text) {
      if (!process.env.DASHBOARD_URL || !process.env.DASHBOARD_IMPORT_SECRET) {
        console.error('Dashboard-import saknar URL eller hemlighet.');
        return false;
      }
      try {
        const res = await fetch(process.env.DASHBOARD_URL + '/api/telegram-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.DASHBOARD_IMPORT_SECRET,
          },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          console.error('Dashboard-import HTTP ' + res.status);
          return false;
        }
        const result = await res.json();
        console.log('Dashboard: session ' + result.sessionId + ' (' + result.date + '), ' + result.candidateCount + ' kandidater');
        return true;
      } catch (error) {
        console.error('Dashboard-import fel:', error.message);
        return false;
      }
    }

    (async () => {
      const isScreener = script === 'omxs30-screener.js';
      const date = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);
      const reportPath = path.join('report-outputs', date + '.txt');
      const pendingPath = path.join('dashboard-pending', date);

      // A previous run sent Telegram already. Reuse the exact saved report and do
      // not recompute signals or send a second trading list.
      if (isScreener && process.env.DASHBOARD_ONLY === 'true') {
        const output = fs.readFileSync(reportPath, 'utf8');
        if (await importDashboard(output)) {
          fs.unlinkSync(pendingPath);
          console.log('Dashboard-import återställd för ' + date);
        } else {
          process.exitCode = 76;
        }
        return;
      }

      let output;
      try {
        output = execFileSync('node', [script], { encoding: 'utf8', timeout: 180000 });
      } catch (e) {
        // Do not send partial plans or import failed output to the dashboard.
        const details = String(e.stderr || e.message || 'Okänt fel').trim().slice(0, 600);
        const alert = '⚠️ OMXS30-SCREENER STOPPAD — ' + date +
          '\nIngen handelslista eller dashboard-import skickades. Kontrollera dagskurserna.\n' + details;
        console.error(alert);
        if (process.env.RETRY === '1' && details.includes('DATA_NOT_READY:')) {
          console.log('Dagskurser saknas ännu; återförsök senare.');
          process.exitCode = 75;
          return;
        }
        try {
          if (process.env.RETRY !== '1') await sendTelegram(alert);
        } catch (telegramError) {
          console.error('Kunde inte skicka felmeddelande till Telegram:', telegramError.message);
        }
        process.exitCode = 1;
        return;
      }

      const text = output.trim() || '(tom utskrift)';
      if (isScreener) {
        fs.mkdirSync('report-outputs', { recursive: true });
        fs.writeFileSync(reportPath, text);
      }
      await sendTelegram(text);

      if (isScreener && !(await importDashboard(text))) {
        fs.mkdirSync('dashboard-pending', { recursive: true });
        fs.writeFileSync(pendingPath, 'Telegram levererat; dashboard-import väntar.\n');
        try {
          await sendTelegram('⚠️ Telegram-listan skickades, men dashboard-importen misslyckades. GitHub försöker igen utan att skicka listan på nytt.');
        } catch (error) {
          console.error('Kunde inte meddela om dashboard-fel:', error.message);
        }
      }
      console.log('Klart:', script);
    })().catch(error => {
      console.error('Notifier-fel:', error.message);
      process.exitCode = 1;
    });
    