/**
 * Persistance de la réputation globale des utilisateurs (users/reputation) —
 * database/data/globalReputation.json.
 * Structure : { [userId]: Record }
 *
 * Record = {
 *   userId, tag, accountCreatedAt,   // identité (mise à jour à chaque événement)
 *   score,                           // score actuel (0-100), dérivé
 *   stats: { warns, timeouts, mutes, kicks, bans, antispam, antilink, antibot, captcha },
 *   guilds: [guildId],               // serveurs où NaoBot a observé l'utilisateur
 *   firstSeen, updatedAt
 * }
 *
 * Indexé par userId (global, jamais par serveur). Un serveur ne peut pas
 * écrire directement ce store : seul le service enregistre des événements.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'globalReputation.json'));

function defaultRecord(userId) {
  return {
    userId,
    tag: null,
    accountCreatedAt: null,
    score: 100,
    stats: {},
    guilds: [],
    firstSeen: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getRecord(userId) {
  const stored = store.get(userId, null);
  return stored ? { ...defaultRecord(userId), ...stored } : null;
}

function getOrCreate(userId) {
  return getRecord(userId) ?? defaultRecord(userId);
}

function save(record) {
  record.updatedAt = new Date().toISOString();
  store.set(record.userId, record);
  return record;
}

function all() {
  return Object.values(store.all());
}

/** Classements par score (meilleurs / pires). */
function ranked({ order = 'desc', limit = 10 } = {}) {
  const sorted = all().sort((a, b) => (order === 'asc' ? a.score - b.score : b.score - a.score));
  return sorted.slice(0, limit);
}

module.exports = { defaultRecord, getRecord, getOrCreate, save, all, ranked };
