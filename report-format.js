'use strict';

// Keep the customer-facing report compact without concealing repaired data.
// The full raw stdout remains available in the screener's execution context.
function formatScreenerReport(raw) {
  if (typeof raw !== 'string') return raw;
  const header = raw.match(/^(OMXS30 SCREENER\s*[·•]\s*\d{4}-\d{2}-\d{2})\r?\n/);
  if (!header) return raw;

  const marker = '⚠⚠⚠ EN HANDELSDAGS FÖRDRÖJNING';
  const markerAt = raw.indexOf(marker, header[0].length);
  if (markerAt < 0) return raw; // Fail open for an unknown report format.

  const diagnosticPrefix = raw.slice(header[0].length, markerAt);
  const reconstructed = (diagnosticPrefix.match(/\bREPAIRED_INTRADAY\b/g) || []).length;
  const qualityNotice = reconstructed
    ? '⚠ DATAKVALITET: ' + reconstructed +
      ' dagsstaplar rekonstruerade från intradagsdata. Verifiera kurser före handel.\n'
    : '';

  return header[1] + '\n' + qualityNotice + '\n' + raw.slice(markerAt);
}

// Prefer line boundaries; never truncate or reorder report content.
function splitTelegramChunks(text, limit = 3800) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    const lastNewline = remaining.lastIndexOf('\n', limit - 1);
    const cut = lastNewline >= Math.floor(limit / 2) ? lastNewline + 1 : limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

module.exports = { formatScreenerReport, splitTelegramChunks };
