/**
 * Résolution du **modérateur responsable** (et de la raison) d'une action via
 * les **audit logs Discord**, avec un **cache** afin d'éviter les requêtes
 * inutiles (un événement Gateway et son entrée d'audit arrivent séparément ;
 * plusieurs listeners peuvent interroger l'audit pour la même action).
 *
 * Discord n'associe pas directement un événement (salon supprimé, rôle
 * modifié…) à son auteur : il faut lire les audit logs et rapprocher par cible
 * et par fenêtre temporelle. Ce service centralise cette logique.
 *
 * Jamais bloquant : si le bot n'a pas la permission « Voir les logs d'audit »
 * ou si la requête échoue, on renvoie `null` (le log est simplement produit
 * sans modérateur).
 */
const { PermissionFlagsBits } = require('discord.js');

/** Durée de vie d'un lot d'entrées d'audit en cache (ms). */
const CACHE_TTL_MS = 4000;
/** Fenêtre de rapprochement événement ⇄ entrée d'audit (ms). */
const MATCH_WINDOW_MS = 8000;

/** Cache par (guildId:type) → { fetchedAt, entries }. */
const cache = new Map();

function cacheKey(guildId, type) {
  return `${guildId}:${type}`;
}

/**
 * Récupère (avec cache) les dernières entrées d'audit d'un type donné.
 * @returns {Promise<import('discord.js').GuildAuditLogsEntry[]>}
 */
async function recentEntries(guild, type) {
  if (!guild?.members?.me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) return [];

  const key = cacheKey(guild.id, type);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.entries;

  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const entries = [...logs.entries.values()];
    cache.set(key, { fetchedAt: Date.now(), entries });
    return entries;
  } catch {
    cache.set(key, { fetchedAt: Date.now(), entries: [] });
    return [];
  }
}

/**
 * Résout l'auteur d'une action à partir des audit logs.
 * @param {import('discord.js').Guild} guild
 * @param {object} params
 * @param {number} params.type - AuditLogEvent.*
 * @param {string} [params.targetId] - Identifiant de l'objet concerné.
 * @param {number} [params.within] - Fenêtre temporelle max (ms).
 * @returns {Promise<{ executor: import('discord.js').User|null, reason: string|null, at: Date }|null>}
 */
async function resolveExecutor(guild, { type, targetId = null, within = MATCH_WINDOW_MS }) {
  const entries = await recentEntries(guild, type);
  const now = Date.now();
  const entry = entries.find(
    (e) =>
      (targetId === null || e.targetId === targetId || e.target?.id === targetId) &&
      now - e.createdTimestamp <= within,
  );
  if (!entry) return null;
  return { executor: entry.executor ?? null, reason: entry.reason ?? null, at: entry.createdAt };
}

/** Vide le cache (tests). */
function _clearCache() {
  cache.clear();
}

module.exports = { resolveExecutor, recentEntries, _clearCache, CACHE_TTL_MS, MATCH_WINDOW_MS };
