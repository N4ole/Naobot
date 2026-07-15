/**
 * Persistance de la liste noire globale des serveurs
 * (database/data/serverBans.json — jamais dans le .env).
 *
 * Structure :
 * {
 *   "bannedServers": [
 *     {
 *       id,          // identifiant du serveur
 *       name,        // dernier nom connu (peut être null)
 *       reason,      // raison du bannissement
 *       bannedBy,    // identifiant de l'owner ayant agi
 *       date,        // date ISO du bannissement
 *       history      // [{ action: 'ban'|'attempt', at, by?, reason? }]
 *     }
 *   ]
 * }
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'serverBans.json'));

/** @returns {object[]} entrées de la liste noire */
function getAll() {
  return [...store.get('bannedServers', [])];
}

function getBan(guildId) {
  return getAll().find((entry) => entry.id === guildId) ?? null;
}

function isBanned(guildId) {
  return getBan(guildId) !== null;
}

/**
 * Ajoute un serveur à la liste noire.
 * @returns {object} l'entrée créée
 */
function addBan({ id, name = null, reason, bannedBy }) {
  const now = new Date().toISOString();
  const entry = {
    id,
    name,
    reason,
    bannedBy,
    date: now,
    history: [{ action: 'ban', at: now, by: bannedBy, reason }],
  };
  store.set('bannedServers', [...getAll().filter((e) => e.id !== id), entry]);
  return entry;
}

/** @returns {boolean} true si le serveur était banni */
function removeBan(guildId) {
  const all = getAll();
  const remaining = all.filter((entry) => entry.id !== guildId);
  if (remaining.length === all.length) return false;
  store.set('bannedServers', remaining);
  return true;
}

/** Trace une tentative d'ajout du bot sur un serveur banni. */
function recordAttempt(guildId) {
  const all = getAll();
  const entry = all.find((e) => e.id === guildId);
  if (!entry) return;
  entry.history = [...(entry.history ?? []), { action: 'attempt', at: new Date().toISOString() }];
  store.set('bannedServers', all);
}

module.exports = { getAll, getBan, isBanned, addBan, removeBan, recordAttempt };
