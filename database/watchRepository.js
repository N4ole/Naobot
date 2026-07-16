/**
 * Persistance du système de surveillance de modération
 * (database/data/watch.json).
 *
 * Toutes les données survivent à un redémarrage :
 * {
 *   "guilds": {
 *     "<guildId>": {
 *       categoryId,                 // catégorie « 📁 Surveillance »
 *       watches: {                  // surveillances par utilisateur surveillé
 *         "<userId>": {
 *           channelId, active, startedAt, expiresAt, startedBy,
 *           watchCount,             // nombre de surveillances de cet utilisateur
 *           totalDurationMs,        // temps cumulé (surveillances terminées)
 *           lastWatchAt
 *         }
 *       }
 *     }
 *   },
 *   "guildStats": {                 // agrégats par serveur (classements)
 *     "<guildId>": { watchCount, totalDurationMs, lastUsedAt }
 *   }
 * }
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'watch.json'));

function getGuild(guildId) {
  return { categoryId: null, watches: {}, ...(store.get('guilds', {})[guildId] ?? {}) };
}

function saveGuild(guildId, data) {
  const guilds = store.get('guilds', {});
  guilds[guildId] = data;
  store.set('guilds', guilds);
}

function getWatch(guildId, userId) {
  return getGuild(guildId).watches[userId] ?? null;
}

function saveWatch(guildId, userId, watch) {
  const data = getGuild(guildId);
  data.watches[userId] = watch;
  saveGuild(guildId, data);
}

function setCategory(guildId, categoryId) {
  const data = getGuild(guildId);
  data.categoryId = categoryId;
  saveGuild(guildId, data);
}

/** Toutes les surveillances actives, tous serveurs confondus. */
function getAllActiveWatches() {
  const result = [];
  for (const [guildId, data] of Object.entries(store.get('guilds', {}))) {
    for (const [userId, watch] of Object.entries(data.watches ?? {})) {
      if (watch.active) result.push({ guildId, userId, watch });
    }
  }
  return result;
}

/** true s'il existe une surveillance active pour cet utilisateur sur ce serveur. */
function isWatched(guildId, userId) {
  return getWatch(guildId, userId)?.active === true;
}

// --- Statistiques par serveur (classements owners) ---

function getGuildStats(guildId) {
  return { watchCount: 0, totalDurationMs: 0, lastUsedAt: null, ...(store.get('guildStats', {})[guildId] ?? {}) };
}

function saveGuildStats(guildId, stats) {
  const all = store.get('guildStats', {});
  all[guildId] = stats;
  store.set('guildStats', all);
}

function getAllGuildStats() {
  return { ...store.get('guildStats', {}) };
}

/** Toutes les surveillances connues (actives et terminées) : classement utilisateurs. */
function getAllWatches() {
  const result = [];
  for (const [guildId, data] of Object.entries(store.get('guilds', {}))) {
    for (const [userId, watch] of Object.entries(data.watches ?? {})) {
      result.push({ guildId, userId, watch });
    }
  }
  return result;
}

module.exports = {
  getGuild,
  saveGuild,
  getWatch,
  saveWatch,
  setCategory,
  getAllActiveWatches,
  isWatched,
  getGuildStats,
  saveGuildStats,
  getAllGuildStats,
  getAllWatches,
};
