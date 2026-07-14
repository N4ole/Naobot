/**
 * Analyse la saisie utilisateur désignant des catégories de logs
 * (ex. : "sanctions moderation", "messages-supprimés", "tout").
 * Tolère les accents, les virgules et les doublons.
 */
const logCategories = require('../constants/logCategories');

const ALL_KEYWORDS = new Set(['tout', 'tous', 'all']);

function normalize(token) {
  return token.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * @param {string} input
 * @returns {{ keys: string[] } | { error: 'missing' } | { error: 'unknown', token: string }}
 */
function parseCategoryInput(input) {
  if (typeof input !== 'string' || !input.trim()) return { error: 'missing' };

  const tokens = input.split(/[\s,;]+/).filter(Boolean).map(normalize);
  if (tokens.some((token) => ALL_KEYWORDS.has(token))) {
    return { keys: Object.keys(logCategories) };
  }

  const keys = [];
  for (const token of tokens) {
    const key = Object.keys(logCategories).find((k) => normalize(k) === token);
    if (!key) return { error: 'unknown', token };
    if (!keys.includes(key)) keys.push(key);
  }
  return { keys };
}

module.exports = { parseCategoryInput };
