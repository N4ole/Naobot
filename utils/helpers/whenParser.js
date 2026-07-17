/**
 * Analyse d'une échéance : durée **relative** (30s, 15m, 2h, 3d/3j, 1w/1sem…)
 * ou **date absolue** (JJ/MM/AAAA, éventuellement suivie de HH:mm).
 * Utilisé par les rappels et les sondages.
 *
 * S'appuie sur parseDuration pour les durées ; ajoute les alias français
 * (j → jours, sem → semaines) et le format date. Ne modifie pas
 * durationParser (réutilisé ailleurs tel quel).
 */
const { parseDuration } = require('./durationParser');

const DURATION_REGEX = /^(\d+(?:s|m|h|d|w|j|sem))+$/i;
const DATE_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const TIME_REGEX = /^(\d{1,2}):(\d{2})$/;

/** Normalise les alias français de durée vers ceux de durationParser. */
function normalizeDuration(input) {
  return input.toLowerCase().replace(/sem/g, 'w').replace(/j/g, 'd');
}

/**
 * Analyse une échéance à partir d'un jeton `whenStr` et, éventuellement,
 * d'une chaîne restante `restStr` (dont une heure `HH:mm` peut être
 * consommée si `whenStr` est une date sans heure).
 * @returns {{ at: number, message: string } | { error: string }}
 */
function parseWhen(whenStr, restStr = '') {
  if (!whenStr) return { error: 'empty' };
  const when = whenStr.trim();
  const rest = restStr.trim();

  // Durée relative.
  if (DURATION_REGEX.test(when)) {
    const ms = parseDuration(normalizeDuration(when));
    if (ms === null) return { error: 'invalid' };
    return { at: Date.now() + ms, message: rest };
  }

  // Date absolue (JJ/MM/AAAA), avec heure optionnelle.
  const dateMatch = when.match(DATE_REGEX);
  if (dateMatch) {
    const [, day, month, year] = dateMatch.map(Number);
    let hours = 0;
    let minutes = 0;
    let message = rest;

    // Heure fournie dans le reste ? (« JJ/MM/AAAA HH:mm message »)
    const firstToken = rest.split(/\s+/)[0] ?? '';
    const timeMatch = firstToken.match(TIME_REGEX);
    if (timeMatch) {
      hours = Number(timeMatch[1]);
      minutes = Number(timeMatch[2]);
      message = rest.slice(firstToken.length).trim();
    }

    const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return { error: 'invalidDate' };
    }
    if (date.getTime() <= Date.now()) return { error: 'past' };
    return { at: date.getTime(), message };
  }

  return { error: 'invalid' };
}

module.exports = { parseWhen, normalizeDuration };
