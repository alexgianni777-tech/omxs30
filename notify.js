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
    console.error('Saknar TELEGRAM_TOKEN / TELEGRAM_CHAT_ID — skriver bara ut nedan.');
    console.log(text);
    return;
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
    if (!res.ok) console.error('Telegram-fel:', res.status, await res.text());
    await new Promise(r => setTimeout(r, 400));
  }
}

(async () => {
  let output;
  try {
    output = execFileSync('node', [script], { encoding: 'utf8', timeout: 180000 });
  } catch (e) {
    output = `${script} kraschade:\n` + (e.stdout || '') + '\n' + (e.message || '');
  }
  await sendTelegram(output.trim() || '(tom utskrift)');
  console.log('Klart:', script);
})();
