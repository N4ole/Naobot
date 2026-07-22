/**
 * Journal persistant des logs serveur (database/data/logStore.json).
 *
 * Chaque événement consigné par `logService.log` y est aussi enregistré sous
 * forme **compacte** (catégorie, titre, résumé, membre concerné, modérateur,
 * horodatage), par serveur, dans un **tampon borné** (les entrées les plus
 * anciennes sont évincées). Permet :
 *   - `logs stats` (compteurs par catégorie) ;
 *   - l'interface web (consultation, filtres par catégorie/utilisateur/date,
 *     recherche) — réservée aux owners du bot.
 *
 * Indexé par `guildId` : aucune donnée n'est jamais mélangée entre serveurs.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'logStore.json'));

/** Nombre maximal d'entrées conservées par serveur. */
const MAX_PER_GUILD = 300;

/**
 * Ajoute une entrée au journal d'un serveur (évince la plus ancienne au-delà
 * de la limite).
 * @param {string} guildId
 * @param {{ category: string, title: string, summary?: string, userId?: string|null, userTag?: string|null, moderatorId?: string|null, moderatorTag?: string|null }} entry
 */
function append(guildId, entry) {
  const list = store.get(guildId, []);
  list.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    category: entry.category,
    title: entry.title ?? '',
    summary: (entry.summary ?? '').slice(0, 300),
    userId: entry.userId ?? null,
    userTag: entry.userTag ?? null,
    moderatorId: entry.moderatorId ?? null,
    moderatorTag: entry.moderatorTag ?? null,
  });
  if (list.length > MAX_PER_GUILD) list.splice(0, list.length - MAX_PER_GUILD);
  store.set(guildId, list);
}

/** @returns {object[]} entrées d'un serveur (plus récentes en dernier). */
function all(guildId) {
  return store.get(guildId, []);
}

/** Compteurs par catégorie pour un serveur. */
function statsByCategory(guildId) {
  const counts = {};
  for (const entry of all(guildId)) counts[entry.category] = (counts[entry.category] ?? 0) + 1;
  return counts;
}

/**
 * Recherche filtrée (interface web).
 * @param {string} guildId
 * @param {{ category?: string, userId?: string, since?: string, until?: string, query?: string, limit?: number }} [filters]
 * @returns {object[]} entrées filtrées, plus récentes d'abord.
 */
function query(guildId, filters = {}) {
  const { category, userId, since, until, query: text, limit = 100 } = filters;
  const sinceMs = since ? Date.parse(since) : null;
  const untilMs = until ? Date.parse(until) : null;
  const needle = text ? text.toLowerCase() : null;

  const result = all(guildId)
    .filter((e) => {
      if (category && e.category !== category) return false;
      if (userId && e.userId !== userId && e.moderatorId !== userId) return false;
      const atMs = Date.parse(e.at);
      if (sinceMs !== null && atMs < sinceMs) return false;
      if (untilMs !== null && atMs > untilMs) return false;
      if (needle) {
        const haystack = `${e.title} ${e.summary} ${e.userTag ?? ''} ${e.moderatorTag ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    })
    .slice(-limit)
    .reverse();
  return result;
}

/** Purge le journal d'un serveur (ex. serveur quitté). */
function clear(guildId) {
  store.set(guildId, []);
}

module.exports = { append, all, statsByCategory, query, clear, MAX_PER_GUILD };
