/**
 * Historique global de modération (events/moderationHistory) —
 * database/data/moderationHistory.json.
 * Structure : { [userId]: [ Event ] }
 *
 * Event = { id, guildId, action, reason, moderatorId, date, durationMs,
 *           scoreBefore, scoreAfter, automatic }
 *
 * Traçabilité complète : chaque contribution à la réputation globale laisse
 * une trace horodatée (serveur d'origine, modérateur, raison, impact sur le
 * score). Capé par utilisateur pour rester borné.
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'moderationHistory.json'));
const HISTORY_LIMIT = 500;

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function getHistory(userId) {
  return [...store.get(userId, [])];
}

function addEvent(userId, event) {
  const entry = { id: generateId(), date: new Date().toISOString(), ...event };
  const history = [...getHistory(userId), entry].slice(-HISTORY_LIMIT);
  store.set(userId, history);
  return entry;
}

/** Nombre d'événements enregistrés pour (utilisateur, serveur) depuis `sinceMs`. */
function countRecent(userId, guildId, sinceMs) {
  const threshold = Date.now() - sinceMs;
  return getHistory(userId).filter((event) => event.guildId === guildId && Date.parse(event.date) >= threshold).length;
}

/** Nombre total d'événements enregistrés (statistiques globales). */
function totalEvents() {
  return Object.values(store.all()).reduce((sum, list) => sum + list.length, 0);
}

/** Nombre d'evenements par type d'action, tous utilisateurs confondus. */
function countByAction() {
  const counts = {};
  for (const history of Object.values(store.all())) {
    for (const event of history ?? []) {
      if (!event?.action) continue;
      counts[event.action] = (counts[event.action] ?? 0) + 1;
    }
  }
  return counts;
}

/** Tous les evenements de tous les utilisateurs (analyse). */
function allEvents() {
  return Object.entries(store.all()).flatMap(([userId, history]) => (history ?? []).map((event) => ({ userId, ...event })));
}

module.exports = { generateId, getHistory, addEvent, countRecent, totalEvents, countByAction, allEvents, HISTORY_LIMIT };
