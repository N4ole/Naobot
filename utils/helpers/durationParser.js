/**
 * Analyse et formatage de durées lisibles ("10m", "1h30m", "2d"…).
 * Utilisé notamment par la commande timeout.
 */
const UNITS_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Convertit une durée textuelle en millisecondes.
 * Accepte la concaténation d'unités : "1h30m", "2d12h", "45s"…
 * @param {string} input
 * @returns {number|null} millisecondes, ou null si le format est invalide
 */
function parseDuration(input) {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().toLowerCase();
  if (!/^(\d+[smhdw])+$/.test(normalized)) return null;

  let total = 0;
  for (const [, amount, unit] of normalized.matchAll(/(\d+)([smhdw])/g)) {
    total += Number(amount) * UNITS_MS[unit];
  }
  return total > 0 ? total : null;
}

/**
 * Formate des millisecondes en durée lisible en français ("2 j 3 h").
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const parts = [];
  const units = [
    { label: 'j', ms: UNITS_MS.d },
    { label: 'h', ms: UNITS_MS.h },
    { label: 'min', ms: UNITS_MS.m },
    { label: 's', ms: UNITS_MS.s },
  ];

  let remaining = ms;
  for (const unit of units) {
    const amount = Math.floor(remaining / unit.ms);
    if (amount > 0) {
      parts.push(`${amount} ${unit.label}`);
      remaining -= amount * unit.ms;
    }
  }
  return parts.length > 0 ? parts.join(' ') : '0 s';
}

module.exports = { parseDuration, formatDuration };
