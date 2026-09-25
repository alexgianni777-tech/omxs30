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
  const header = `📊 ${script.replace('omxs30-', '').replace('.js', '').toUpperCase()} · ${new Date().toISOString().slice(0, 10)}\n`;
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

(async () => {
  let output;
  try {
    output = execFileSync('node', [script], { encoding: 'utf8', timeout: 180000 });
  } catch (e) {
    // Do not send partial plans or import failed output to the dashboard.
    const details = String(e.stderr || e.message || 'Okänt fel').trim().slice(0, 600);
    const alert = '⚠️ OMXS30-SCREENER STOPPAD — ' + (process.env.REPORT_DATE || new Date().toISOString().slice(0, 10)) +
      '\nIngen handelslista eller dashboard-import skickades. Kontrollera dagskurserna.\n' + details;
    console.error(alert);
    try {
      if (process.env.RETRY !== '1') await sendTelegram(alert);
    } catch (telegramError) {
      console.error('Kunde inte skicka felmeddelande till Telegram:', telegramError.message);
    }
    process.exitCode = 1;
    return;
  }
  await sendTelegram(output.trim() || '(tom utskrift)');

  // ── AG Investment Capital dashboard ──────────────────────────────────────
  if (process.env.DASHBOARD_URL && process.env.DASHBOARD_IMPORT_SECRET && script === 'omxs30-screener.js') {
    try {
      const dashRes = await fetch(`${process.env.DASHBOARD_URL}/api/telegram-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DASHBOARD_IMPORT_SECRET}`,
        },
        body: JSON.stringify({ text: output.trim() }),
      });
      if (dashRes.ok) {
        const j = await dashRes.json();
        console.log(`✅ Dashboard: session ${j.sessionId} (${j.date}), ${j.candidateCount} kandidater`);
      } else {
        console.warn(`⚠️ Dashboard HTTP ${dashRes.status}`);
      }
    } catch (e) {
      console.warn('⚠️ Dashboard-import fel:', e.message);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  console.log('Klart:', script);
})();
