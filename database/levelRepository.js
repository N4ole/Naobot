/**
 * Persistance du système de niveaux basé sur l'activité, par serveur
 * (database/data/levels.json). Chaque serveur a sa propre configuration, ses
 * utilisateurs et ses sessions vocales en cours (pour survivre aux redémarrages).
 *
 * Structure par serveur :
 * {
 *   config: { enabled, xpPerMessage, xpPerVoiceMinute, messageCooldownMs,
 *     minMessageLength, excludedChannels[], excludedRoles[], excludeBots,
 *     excludeAloneVoice, announceChannelId, announceLevelUp, rewards:{level:roleId},
 *     curve:{ base, offset }, lastModifiedAt, lastModifiedBy },
 *   users: { userId: { xp, level, messages, voiceMs, lastMessageAt, lastHash } },
 *   voiceSessions: { userId: { channelId, since } }
 * }
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'levels.json'));

/** Configuration par défaut (multi-serveurs : désactivé par défaut). */
function defaultConfig() {
  return {
    enabled: false,
    xpPerMessage: 15,
    xpPerVoiceMinute: 10,
    messageCooldownMs: 60 * 1000,
    minMessageLength: 5,
    excludedChannels: [],
    excludedRoles: [],
    excludeBots: true,
    excludeAloneVoice: true,
    announceChannelId: null,
    announceLevelUp: true,
    rewards: {},
    curve: { base: 50, offset: 50 },
    lastModifiedAt: null,
    lastModifiedBy: null,
  };
}

function defaultUser() {
  return { xp: 0, level: 0, messages: 0, voiceMs: 0, lastMessageAt: 0, lastHash: null };
}

function getGuildData(guildId) {
  const stored = store.get(guildId, {});
  return {
    config: { ...defaultConfig(), ...(stored.config ?? {}), curve: { ...defaultConfig().curve, ...(stored.config?.curve ?? {}) }, rewards: { ...(stored.config?.rewards ?? {}) } },
    users: stored.users ?? {},
    voiceSessions: stored.voiceSessions ?? {},
  };
}

function saveGuildData(guildId, data) {
  store.set(guildId, data);
}

function getConfig(guildId) {
  return getGuildData(guildId).config;
}

function saveConfig(guildId, config) {
  const data = getGuildData(guildId);
  data.config = config;
  saveGuildData(guildId, data);
}

function getUser(guildId, userId) {
  const data = getGuildData(guildId);
  return { ...defaultUser(), ...(data.users[userId] ?? {}) };
}

function saveUser(guildId, userId, user) {
  const data = getGuildData(guildId);
  data.users[userId] = user;
  saveGuildData(guildId, data);
}

/** Tous les utilisateurs classés par XP décroissante (avec leur id). */
function rankedUsers(guildId) {
  const data = getGuildData(guildId);
  return Object.entries(data.users)
    .map(([userId, user]) => ({ userId, ...defaultUser(), ...user }))
    .sort((a, b) => b.xp - a.xp);
}

/** Rang (1-indexé) d'un utilisateur dans le classement, ou null. */
function rankOf(guildId, userId) {
  const ranked = rankedUsers(guildId);
  const index = ranked.findIndex((entry) => entry.userId === userId);
  return index === -1 ? null : index + 1;
}

// --- Sessions vocales (persistées pour survivre aux redémarrages) ---

function getSession(guildId, userId) {
  return getGuildData(guildId).voiceSessions[userId] ?? null;
}

function setSession(guildId, userId, session) {
  const data = getGuildData(guildId);
  data.voiceSessions[userId] = session;
  saveGuildData(guildId, data);
}

function clearSession(guildId, userId) {
  const data = getGuildData(guildId);
  if (data.voiceSessions[userId]) {
    delete data.voiceSessions[userId];
    saveGuildData(guildId, data);
  }
}

function allSessions() {
  const all = [];
  for (const [guildId, data] of Object.entries(store.all())) {
    for (const [userId, session] of Object.entries(data.voiceSessions ?? {})) {
      all.push({ guildId, userId, ...session });
    }
  }
  return all;
}

module.exports = {
  defaultConfig,
  getConfig,
  saveConfig,
  getUser,
  saveUser,
  rankedUsers,
  rankOf,
  getSession,
  setSession,
  clearSession,
  allSessions,
};
