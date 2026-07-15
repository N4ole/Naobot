/**
 * Persistance du système de bump (database/data/bumps.json).
 *
 * Structure :
 * {
 *   "guilds": {
 *     "<guildId>": {
 *       enabled,            // système activé sur ce serveur
 *       channelId,          // salon de réception des publicités
 *       bumpCount,          // total de bumps du serveur
 *       lastBumpAt,         // dernier bump (cooldown global 6 h par serveur)
 *       bumpers,            // { userId: nombre de bumps sur ce serveur }
 *       history             // [{ at, userId }] (plafonné)
 *     }
 *   },
 *   "users": { "<userId>": { count, lastBumpAt } }
 * }
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'bumps.json'));
const HISTORY_LIMIT = 50;

function defaultGuildBump() {
  return {
    enabled: false,
    channelId: null,
    bumpCount: 0,
    lastBumpAt: null,
    bumpers: {},
    history: [],
  };
}

function getGuildBump(guildId) {
  return { ...defaultGuildBump(), ...(store.get('guilds', {})[guildId] ?? {}) };
}

function saveGuildBump(guildId, config) {
  const guilds = store.get('guilds', {});
  guilds[guildId] = config;
  store.set('guilds', guilds);
}

/** @returns {Record<string, object>} configuration bump de tous les serveurs connus */
function getAllGuildBumps() {
  return { ...store.get('guilds', {}) };
}

function getUserBump(userId) {
  return { count: 0, lastBumpAt: null, ...(store.get('users', {})[userId] ?? {}) };
}

function getAllUserBumps() {
  return { ...store.get('users', {}) };
}

/**
 * Enregistre un bump : compteurs serveur + utilisateur, dates, historique.
 * @returns {{ guildCount: number, userCount: number }}
 */
function recordBump(guildId, userId) {
  const now = new Date().toISOString();

  const guildBump = getGuildBump(guildId);
  guildBump.bumpCount += 1;
  guildBump.lastBumpAt = now;
  guildBump.bumpers[userId] = (guildBump.bumpers[userId] ?? 0) + 1;
  guildBump.history = [...guildBump.history, { at: now, userId }].slice(-HISTORY_LIMIT);
  saveGuildBump(guildId, guildBump);

  const users = store.get('users', {});
  const userBump = { count: 0, lastBumpAt: null, ...(users[userId] ?? {}) };
  userBump.count += 1;
  userBump.lastBumpAt = now;
  users[userId] = userBump;
  store.set('users', users);

  return { guildCount: guildBump.bumpCount, userCount: userBump.count };
}

module.exports = {
  getGuildBump,
  saveGuildBump,
  getAllGuildBumps,
  getUserBump,
  getAllUserBumps,
  recordBump,
};
