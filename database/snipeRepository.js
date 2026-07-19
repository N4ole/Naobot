/**
 * Persistance du système de snipe (database/data/snipe.json).
 *
 * Chaque serveur possède, par catégorie, une file d'événements récents
 * (les plus récents en tête). Les limites — nombre maximal d'éléments et durée
 * de conservation — évitent toute croissance illimitée (bot multi-serveurs) et
 * sont **configurables par serveur** ; une purge automatique retire les
 * événements expirés.
 *
 * Structure par serveur :
 * {
 *   events: { <catégorie>: [ { id, type, userId, userTag, channelId,
 *     moderatorId, createdAt, oldContent, newContent, attachments:[], images:[],
 *     extra:{} } ] },
 *   config: { maxItems, maxAgeMs }  // surcharges éventuelles
 * }
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');
const snipeCategories = require('../utils/constants/snipeCategories');

const store = new JsonStore(path.join(__dirname, 'data', 'snipe.json'));

/** Valeurs par défaut (surchargées par serveur via setConfig). */
const DEFAULTS = { maxItems: 50, maxAgeMs: 24 * 60 * 60 * 1000 };

function emptyEvents() {
  const events = {};
  for (const key of Object.keys(snipeCategories)) events[key] = [];
  return events;
}

function getGuildData(guildId) {
  const stored = store.get(guildId, {});
  const events = emptyEvents();
  for (const key of Object.keys(events)) {
    if (Array.isArray(stored.events?.[key])) events[key] = stored.events[key];
  }
  return { events, config: { ...DEFAULTS, ...(stored.config ?? {}) } };
}

function saveGuildData(guildId, data) {
  store.set(guildId, data);
}

function getConfig(guildId) {
  return getGuildData(guildId).config;
}

function setConfig(guildId, patch) {
  const data = getGuildData(guildId);
  data.config = { ...data.config, ...patch };
  saveGuildData(guildId, data);
  return data.config;
}

/** Retire les événements expirés d'une liste selon l'âge maximal. */
function prune(list, maxAgeMs, maxItems, now = Date.now()) {
  return list
    .filter((entry) => now - Date.parse(entry.createdAt) <= maxAgeMs)
    .slice(0, maxItems);
}

/** Enregistre un événement dans sa catégorie (le plus récent en tête). */
function push(guildId, category, entry) {
  if (!snipeCategories[category]) return;
  const data = getGuildData(guildId);
  const list = [entry, ...(data.events[category] ?? [])];
  data.events[category] = prune(list, data.config.maxAgeMs, data.config.maxItems);
  saveGuildData(guildId, data);
}

/** Événements d'une catégorie (déjà purgés des expirés), les plus récents d'abord. */
function list(guildId, category) {
  const data = getGuildData(guildId);
  const pruned = prune(data.events[category] ?? [], data.config.maxAgeMs, data.config.maxItems);
  // Persiste l'élagage si nécessaire (évite de recalculer indéfiniment).
  if (pruned.length !== (data.events[category] ?? []).length) {
    data.events[category] = pruned;
    saveGuildData(guildId, data);
  }
  return pruned;
}

/** Purge tous les événements expirés d'un serveur. @returns nombre retiré. */
function purgeGuild(guildId) {
  const data = getGuildData(guildId);
  let removed = 0;
  for (const key of Object.keys(data.events)) {
    const before = data.events[key].length;
    data.events[key] = prune(data.events[key], data.config.maxAgeMs, data.config.maxItems);
    removed += before - data.events[key].length;
  }
  if (removed > 0) saveGuildData(guildId, data);
  return removed;
}

function allGuildIds() {
  return Object.keys(store.all());
}

module.exports = { DEFAULTS, getConfig, setConfig, push, list, purgeGuild, allGuildIds };
