/**
 * **Archives** : serveurs que le bot a quittés, dont les données restent
 * consultables depuis l'interface web.
 *
 * Rien n'est supprimé lorsque le bot quitte un serveur — les repositories sont
 * indexés par `guildId` et conservent leur contenu. Le problème que ce module
 * résout est un problème de **visibilité** : `webAuth.canAccessGuild` exige que
 * le bot soit présent, et `accessibleGuilds` ne liste que le cache Discord. Un
 * serveur quitté devenait donc inatteignable alors que ses données étaient
 * toujours là.
 *
 * Un serveur est « archivé » lorsqu'il est **connu** (le bot y est passé, il a
 * laissé des données) mais **absent du client Discord**.
 *
 * Comme le reste de `services/web/*`, ce module ne fait que **lire et
 * déléguer** : chaque section est produite par `webService`, dont les fonctions
 * ne prennent qu'un `guildId` et fonctionnent donc à l'identique pour un
 * serveur quitté. Aucune règle métier n'est réécrite ici.
 */
const guildStatsRepository = require('../../database/guildStatsRepository');
const warnRepository = require('../../database/warnRepository');
const ticketRepository = require('../../database/ticketRepository');
const levelRepository = require('../../database/levelRepository');
const protectionRepository = require('../../database/protectionRepository');
const antipubRepository = require('../../database/antipubRepository');
const antisensitiveRepository = require('../../database/antisensitiveRepository');
const captchaRepository = require('../../database/captchaRepository');
const bumpRepository = require('../../database/bumpRepository');
const logStoreRepository = require('../../database/logStoreRepository');
const serverBanRepository = require('../../database/serverBanRepository');
const contactService = require('../contact/contactService');
const reputationService = require('../reputation/reputationService');
const webService = require('./webService');

function safe(fn, fallback) {
  try {
    const value = fn();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

/**
 * Sources de données indexées par `guildId`. Sert à établir la liste des
 * serveurs **connus** : un serveur ayant laissé la moindre trace dans l'une
 * d'elles est archivable, même si son entrée de statistiques a disparu.
 */
const GUILD_SOURCES = [
  () => guildStatsRepository.getAllStats(),
  () => warnRepository.getAllGuildWarns(),
  () => ticketRepository.allGuildData(),
  () => levelRepository.allGuildData(),
  () => protectionRepository.allConfigs(),
  () => antipubRepository.allConfigs(),
  () => antisensitiveRepository.allConfigs(),
  () => captchaRepository.allConfigs(),
  () => bumpRepository.getAllGuildBumps(),
];

/** Identifiants de tous les serveurs ayant laissé des données. */
function knownGuildIds() {
  const ids = new Set();
  for (const source of GUILD_SOURCES) {
    for (const id of Object.keys(safe(source, {}))) ids.add(id);
  }
  return ids;
}

/** Volume de données retenu pour un serveur (aperçu de la liste). */
function retainedCounts(guildId) {
  return {
    warns: safe(() => Object.values(warnRepository.getAllGuildWarns()[guildId] ?? {}).reduce((sum, list) => sum + (list?.length ?? 0), 0), 0),
    tickets: safe(() => {
      const data = ticketRepository.allGuildData()[guildId] ?? {};
      const closed = Object.values(data.stats ?? {}).reduce((sum, stat) => sum + (stat?.closed ?? 0), 0);
      return Object.keys(data.tickets ?? {}).length + closed;
    }, 0),
    members: safe(() => Object.keys(levelRepository.allGuildData()[guildId]?.users ?? {}).length, 0),
    logEntries: safe(() => logStoreRepository.all(guildId).length, 0),
    conversations: safe(() => contactService.getAllConversations().filter((c) => c.guildId === guildId).length, 0),
  };
}

/**
 * Serveurs archivés : connus mais absents du client Discord.
 *
 * ⚠️ Tant que le client n'est pas prêt, son cache de serveurs est vide : tout
 * paraîtrait archivé. Dans ce cas la liste est renvoyée vide, avec `ready:
 * false`, plutôt que d'afficher une information fausse.
 *
 * @param {import('discord.js').Client} client
 * @param {{ query?: string, page?: number, pageSize?: number, sort?: 'recent'|'name'|'data' }} [options]
 */
function list(client, { query, page = 1, pageSize = 20, sort = 'recent' } = {}) {
  const ready = Boolean(client?.isReady?.());
  if (!ready) return { archives: [], total: 0, page: 1, pages: 1, pageSize, ready: false };

  const present = client.guilds.cache;
  const stats = safe(() => guildStatsRepository.getAllStats(), {});

  let archives = [...knownGuildIds()]
    .filter((guildId) => !present.has(guildId))
    .map((guildId) => {
      const entry = stats[guildId] ?? {};
      return {
        id: guildId,
        name: entry.name ?? null,
        firstJoinedAt: entry.firstJoinedAt ?? null,
        lastJoinedAt: entry.lastJoinedAt ?? null,
        lastLeftAt: entry.lastLeftAt ?? null,
        joinCount: entry.joinCount ?? 0,
        leaveCount: entry.leaveCount ?? 0,
        commandCount: entry.commandCount ?? 0,
        // Un serveur peut avoir été quitté **parce qu'il est sur liste noire** :
        // l'information est utile au moment de consulter l'archive.
        banned: safe(() => serverBanRepository.isBanned(guildId), false),
        retained: retainedCounts(guildId),
      };
    });

  if (query) {
    const needle = String(query).toLowerCase();
    archives = archives.filter((archive) => `${archive.name ?? ''} ${archive.id}`.toLowerCase().includes(needle));
  }

  const totalData = (archive) => Object.values(archive.retained).reduce((sum, n) => sum + n, 0);
  const comparators = {
    recent: (a, b) => Date.parse(b.lastLeftAt ?? 0) - Date.parse(a.lastLeftAt ?? 0),
    name: (a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id),
    data: (a, b) => totalData(b) - totalData(a),
  };
  archives.sort(comparators[sort] ?? comparators.recent);

  const size = Math.min(Math.max(1, Number(pageSize) || 20), 100);
  const pages = Math.max(1, Math.ceil(archives.length / size));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  return {
    archives: archives.slice((current - 1) * size, current * size),
    total: archives.length,
    page: current,
    pages,
    pageSize: size,
    ready: true,
  };
}

/** true si le serveur est bien archivé (connu et absent du client). */
function isArchived(client, guildId) {
  if (!client?.isReady?.()) return false;
  if (client.guilds.cache.has(guildId)) return false;
  return knownGuildIds().has(guildId);
}

/**
 * Données retenues d'un serveur quitté, toutes sections confondues.
 * Chaque section est déléguée à `webService` — exactement les mêmes fonctions
 * que pour un serveur actif.
 *
 * @returns {object|null} `null` si le serveur n'est pas archivé
 */
function detail(client, guildId) {
  if (!isArchived(client, guildId)) return null;
  const stats = safe(() => guildStatsRepository.getStats(guildId), {});

  return {
    id: guildId,
    name: stats.name ?? null,
    banned: safe(() => serverBanRepository.getBan(guildId), null),
    stay: {
      firstJoinedAt: stats.firstJoinedAt ?? null,
      lastJoinedAt: stats.lastJoinedAt ?? null,
      lastLeftAt: stats.lastLeftAt ?? null,
      joinCount: stats.joinCount ?? 0,
      leaveCount: stats.leaveCount ?? 0,
      shortStayCount: stats.shortStayCount ?? 0,
      commandCount: stats.commandCount ?? 0,
      sanctionCount: stats.sanctionCount ?? 0,
      lastActivityAt: stats.lastActivityAt ?? null,
    },
    reputation: safe(() => reputationService.getEffective(stats), null),
    moderation: safe(() => webService.moderation(guildId), null),
    tickets: safe(() => webService.tickets(guildId), null),
    levels: safe(() => webService.levels(guildId), null),
    tempVoice: safe(() => webService.tempVoice(guildId), null),
    captcha: safe(() => webService.captcha(guildId), null),
    antipub: safe(() => webService.antipub(guildId), null),
    antisensitive: safe(() => webService.antisensitive(guildId), null),
    // Conversations de messagerie rattachées à ce serveur (l'historique reste
    // consultable même après le départ).
    conversations: safe(
      () =>
        contactService
          .getAllConversations()
          .filter((conversation) => conversation.guildId === guildId)
          .map((conversation) => ({
            id: conversation.id,
            status: conversation.status,
            ownerName: conversation.ownerName,
            messageCount: (conversation.messages ?? []).length,
            lastActivityAt: conversation.lastActivityAt,
          })),
      [],
    ),
    retained: retainedCounts(guildId),
  };
}

/** Journal de modération conservé d'un serveur archivé (mêmes filtres qu'en actif). */
function logs(client, guildId, filters = {}) {
  if (!isArchived(client, guildId)) return null;
  return safe(() => webService.serverLogs(guildId, filters), null);
}

/** Compteurs pour le tableau de bord et la navigation. */
function summary(client) {
  const ready = Boolean(client?.isReady?.());
  if (!ready) return { total: 0, ready: false };
  const present = client.guilds.cache;
  const archived = [...knownGuildIds()].filter((guildId) => !present.has(guildId));
  return {
    total: archived.length,
    known: knownGuildIds().size,
    active: present.size,
    ready: true,
  };
}

module.exports = { list, detail, logs, summary, isArchived, knownGuildIds, retainedCounts };
