/**
 * Pont de données de l'interface web : agrège les statistiques et l'état du
 * bot à partir des repositories existants et du client Discord (lecture
 * seule). Volontairement séparé de la logique Discord : aucune commande, aucun
 * écouteur — uniquement de la lecture de données pour l'API.
 *
 * Chaque source est encapsulée dans un try/catch : une donnée indisponible
 * n'empêche jamais le reste du tableau de bord de s'afficher.
 */
const ticketRepository = require('../../database/ticketRepository');
const ticketCategoryRepository = require('../../database/ticketCategoryRepository');
const bumpRepository = require('../../database/bumpRepository');
const warnRepository = require('../../database/warnRepository');
const reputationService = require('../reputation/reputationService');
const guildStatsRepository = require('../../database/guildStatsRepository');
const protectionRepository = require('../../database/protectionRepository');
const reactionRoleRepository = require('../../database/reactionRoleRepository');
const formRepository = require('../../database/formRepository');
const backupRepository = require('../../database/backupRepository');
const logService = require('../logs/logService');
const tempVoiceRepository = require('../../database/tempVoiceRepository');
const captchaRepository = require('../../database/captchaRepository');
const antipubRepository = require('../../database/antipubRepository');
const antisensitiveRepository = require('../../database/antisensitiveRepository');
const prefixService = require('../prefix/prefixService');
const levelService = require('../levels/levelService');
const snipeService = require('../snipe/snipeService');
const snipeCategories = require('../../utils/constants/snipeCategories');
const globalReputationService = require('../reputation/globalReputationService');
const memberFileService = require('../memberFiles/memberFileService');
const logStore = require('../../database/logStoreRepository');
const logCategories = require('../../utils/constants/logCategories');
const emojis = require('../../config/emojis');

/**
 * Convertit le niveau de réputation pour l'interface web : le champ `emoji`
 * (émoji personnalisé Discord, non rendu sur une page web) est remplacé par son
 * **secours Unicode**, garantissant une identité visuelle cohérente et lisible.
 */
function webLevel(level) {
  if (!level) return level;
  return { ...level, emoji: level.emojiKey ? emojis.fallback(level.emojiKey) : level.emoji };
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Total de bumps, tous serveurs confondus. */
function totalBumps() {
  return safe(() => Object.values(bumpRepository.getAllGuildBumps()).reduce((sum, g) => sum + (g.bumpCount ?? g.count ?? 0), 0), 0);
}

/** Nombre de tickets (ouverts + fermés), tous serveurs confondus. */
function totalTickets() {
  return safe(() => ticketRepository.allTickets().length, 0);
}

/** Statistiques globales + état du bot (tableau de bord). */
function globalStats(client) {
  const guilds = client?.guilds?.cache;
  const users = safe(() => guilds?.reduce((sum, g) => sum + (g.memberCount ?? 0), 0), 0);
  return {
    servers: guilds?.size ?? 0,
    users,
    tickets: totalTickets(),
    bumps: totalBumps(),
    status: {
      ready: Boolean(client?.isReady?.()),
      uptimeMs: client?.uptime ?? 0,
      ping: Math.max(0, Math.round(client?.ws?.ping ?? 0)),
      commands: client?.commands?.size ?? 0,
    },
    updatedAt: new Date().toISOString(),
  };
}

/** Liste des serveurs (résumé) où le bot est présent. */
function listGuilds(client) {
  return safe(
    () =>
      [...(client?.guilds?.cache?.values() ?? [])].map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL?.({ size: 64 }) ?? null,
        members: guild.memberCount ?? 0,
      })),
    [],
  );
}

/** Vue d'ensemble de la configuration d'un serveur. */
function guildOverview(client, guildId) {
  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) return null;
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL?.({ size: 128 }) ?? null,
    members: guild.memberCount ?? 0,
    channels: safe(() => guild.channels.cache.size, 0),
    roles: safe(() => guild.roles.cache.size, 0),
    prefix: safe(() => prefixService.getConfig(guildId), { prefix: '!', default: '!', isCustom: false, updatedBy: null, updatedAt: null }),
    protections: safe(() => protectionRepository.getConfig(guildId), {}),
    reactionRoles: safe(() => Object.keys(reactionRoleRepository.getGuildPanels(guildId)).length, 0),
    forms: safe(() => formRepository.getForms(guildId).length, 0),
    backups: safe(() => backupRepository.getBackups(guildId).length, 0),
    logs: safe(() => logService.getStatus(guildId), {}),
    reputation: safe(() => reputationService.getEffective(guildStatsRepository.getStats(guildId)), null),
    tickets: ticketSummary(guildId),
    tempVoice: safe(() => ({ generators: tempVoiceRepository.listGenerators(guildId).length, active: tempVoiceRepository.listTemps(guildId).length }), { generators: 0, active: 0 }),
    captcha: captcha(guildId),
    antipub: safe(() => { const c = antipubRepository.getConfig(guildId); return { enabled: c.enabled, exemptChannels: c.exemptChannels.length, stats: c.stats }; }, { enabled: false, exemptChannels: 0, stats: { detections: 0, deleted: 0, errors: 0 } }),
    snipe: safe(() => Object.fromEntries(Object.keys(snipeCategories).map((key) => [key, snipeService.query(guildId, key).length])), {}),
    antisensitive: safe(() => { const c = antisensitiveRepository.getConfig(guildId); return { enabled: c.enabled, exemptChannels: c.exemptChannels.length, stats: c.stats }; }, { enabled: false, exemptChannels: 0, stats: { detections: 0, deleted: 0, errors: 0 } }),
    levels: safe(() => { const c = levelService.getConfig(guildId); return { enabled: c.enabled, ranked: levelService.leaderboard(guildId).length, rewards: Object.keys(c.rewards).length }; }, { enabled: false, ranked: 0, rewards: 0 }),
    stats: safe(() => guildStatsRepository.getStats(guildId), {}),
  };
}

/** Système de niveaux d'un serveur (section dédiée) : config, top et récompenses. */
function levels(guildId) {
  return safe(
    () => {
      const c = levelService.getConfig(guildId);
      return {
        config: {
          enabled: c.enabled,
          xpPerMessage: c.xpPerMessage,
          xpPerVoiceMinute: c.xpPerVoiceMinute,
          messageCooldownMs: c.messageCooldownMs,
          minMessageLength: c.minMessageLength,
          excludedChannels: c.excludedChannels,
          excludedRoles: c.excludedRoles,
          announceChannelId: c.announceChannelId,
          curve: c.curve,
          lastModifiedAt: c.lastModifiedAt,
        },
        rewards: Object.entries(c.rewards).map(([level, roleId]) => ({ level: Number(level), roleId })).sort((a, b) => a.level - b.level),
        leaderboard: levelService.leaderboard(guildId).slice(0, 50),
      };
    },
    { config: { enabled: false }, rewards: [], leaderboard: [] },
  );
}

/** Anti-contenus sensibles d'un serveur (section dédiée, lecture seule). */
function antisensitive(guildId) {
  return safe(
    () => {
      const c = antisensitiveRepository.getConfig(guildId);
      return {
        enabled: c.enabled,
        categories: c.categories,
        action: c.action,
        autoTimeout: c.autoTimeout,
        exemptChannels: c.exemptChannels,
        exemptCategories: c.exemptCategories,
        exemptRoles: c.exemptRoles,
        exemptUsers: c.exemptUsers,
        blockedDomains: c.blockedDomains,
        allowedDomains: c.allowedDomains,
        blockedKeywords: c.blockedKeywords,
        stats: c.stats,
        lastModifiedAt: c.lastModifiedAt,
        lastModifiedBy: c.lastModifiedBy,
        recentDetections: c.recentDetections,
      };
    },
    { enabled: false, categories: {}, action: 'delete', exemptChannels: [], stats: { detections: 0, deleted: 0, errors: 0 }, recentDetections: [] },
  );
}

/** Snipe d'un serveur : nombre d'événements récents par catégorie (lecture seule). */
function snipe(guildId) {
  return safe(
    () => ({
      config: snipeService.getConfig(guildId),
      categories: Object.entries(snipeCategories).map(([key, def]) => ({
        key,
        label: def.label,
        emoji: def.emoji,
        command: def.command,
        count: snipeService.query(guildId, key).length,
      })),
    }),
    { config: {}, categories: [] },
  );
}

/** Anti-publicité d'un serveur (section dédiée) : état, salons exemptés,
 * statistiques et dernières détections. */
function antipub(guildId) {
  return safe(
    () => {
      const c = antipubRepository.getConfig(guildId);
      return {
        enabled: c.enabled,
        exemptChannels: c.exemptChannels,
        stats: c.stats,
        lastModifiedAt: c.lastModifiedAt,
        lastModifiedBy: c.lastModifiedBy,
        recentDetections: c.recentDetections,
      };
    },
    { enabled: false, exemptChannels: [], stats: { detections: 0, deleted: 0, errors: 0 }, lastModifiedAt: null, lastModifiedBy: null, recentDetections: [] },
  );
}

/** Résumé du captcha d'un serveur (sans jamais exposer les réponses). */
function captcha(guildId) {
  return safe(
    () => {
      const c = captchaRepository.getConfig(guildId);
      return {
        enabled: c.enabled,
        type: c.type,
        channelId: c.channelId,
        verifiedRoleId: c.verifiedRoleId,
        timeoutMinutes: c.timeoutMinutes,
        pending: Object.keys(c.pending ?? {}).length,
        stats: c.stats ?? { passed: 0, kicked: 0 },
      };
    },
    { enabled: false, type: 'button', pending: 0, stats: { passed: 0, kicked: 0 } },
  );
}

/** Salons vocaux temporaires d'un serveur (section dédiée). */
function tempVoice(guildId) {
  return safe(
    () => ({
      generators: tempVoiceRepository.listGenerators(guildId).map((g) => ({ channelId: g.channelId, categoryId: g.categoryId, nameFormat: g.nameFormat, userLimit: g.userLimit, counter: g.counter })),
      active: tempVoiceRepository.listTemps(guildId).map((t) => ({ channelId: t.channelId, ownerId: t.ownerId, name: t.name, createdAt: t.createdAt })),
      stats: tempVoiceRepository.getStats(guildId),
    }),
    { generators: [], active: [], stats: { created: 0, deleted: 0 } },
  );
}

/** Résumé des tickets d'un serveur. */
function ticketSummary(guildId) {
  return safe(
    () => {
      const all = ticketRepository.listTickets(guildId);
      return {
        open: all.filter((t) => t.status === 'open').length,
        closed: all.filter((t) => t.status === 'closed').length,
        categories: ticketCategoryRepository.listCategories(guildId).length,
        stats: ticketRepository.getStats(guildId),
      };
    },
    { open: 0, closed: 0, categories: 0, stats: {} },
  );
}

/** Détail des tickets d'un serveur (section Tickets). */
function tickets(guildId) {
  return safe(
    () => {
      const all = ticketRepository.listTickets(guildId);
      const categories = ticketCategoryRepository.listCategories(guildId).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, counter: c.counter }));
      const stats = ticketRepository.getStats(guildId);
      return {
        open: all.filter((t) => t.status === 'open').map((t) => ({ id: t.id, name: t.channelName, categoryId: t.categoryId, user: t.userId, assignedTo: t.assignedTo, createdAt: t.createdAt })),
        // Un ticket fermé quitte `tickets` (il part en archive) : le décompte
        // fiable est celui des compteurs persistants par catégorie.
        closed: Object.values(stats).reduce((sum, stat) => sum + (stat?.closed ?? 0), 0),
        categories,
        stats,
      };
    },
    { open: [], closed: 0, categories: [], stats: {} },
  );
}

/** Modération : warns et statistiques (section Modération). */
function moderation(guildId) {
  return safe(
    () => {
      const warns = warnRepository.getAllWarns(guildId);
      const byUser = {};
      for (const warn of warns) byUser[warn.userId] = (byUser[warn.userId] ?? 0) + 1;
      return {
        totalWarns: warns.length,
        warnedUsers: Object.keys(byUser).length,
        topWarned: Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([userId, count]) => ({ userId, count })),
        recent: warns.slice(-20).reverse().map((w) => ({ userId: w.userId, reason: w.reason, moderatorId: w.moderatorId, createdAt: w.createdAt, sanction: w.sanction?.type ?? null })),
      };
    },
    { totalWarns: 0, warnedUsers: 0, topWarned: [], recent: [] },
  );
}

/**
 * Profil d'un membre : réputation (niveau/score) + historique de warns.
 * Les badges/succès sont prévus mais non encore alimentés (placeholders).
 */
function profile(client, guildId, userId) {
  // `getEffective` attend les **statistiques** du serveur (c'est là qu'est
  // persistée la réputation), pas l'objet Guild de discord.js.
  const reputation = safe(() => reputationService.getEffective(guildStatsRepository.getStats(guildId)), null);
  return {
    userId,
    reputation,
    warns: safe(() => warnRepository.countWarns(guildId, userId), 0),
    history: safe(() => warnRepository.getWarns(guildId, userId).map((w) => ({ reason: w.reason, createdAt: w.createdAt, sanction: w.sanction?.type ?? null })), []),
    badges: [], // à venir
    achievements: [], // à venir
  };
}

/** Profil de réputation globale d'un utilisateur (accès contrôlé côté API). */
function reputationProfile(userId) {
  return safe(() => {
    const profile = globalReputationService.getProfile(userId);
    return { ...profile, level: webLevel(profile.level), files: memberFileService.fileStats(userId) };
  }, null);
}

/**
 * Dossier membre complet (owners du bot uniquement — accès contrôlé côté API).
 * Données sensibles : réputation + notes globales inter-serveurs.
 */
function memberFile(userId) {
  return safe(() => {
    const dossier = memberFileService.getDossier(userId);
    // Émoji de niveau en secours Unicode pour un rendu web lisible.
    if (dossier?.rep?.level) dossier.rep = { ...dossier.rep, level: webLevel(dossier.rep.level) };
    return dossier;
  }, null);
}

/** Statistiques + pondérations de réputation globale (owners). */
function reputationOverview() {
  return safe(() => ({ stats: globalReputationService.globalStats(), config: globalReputationService.getConfig() }), null);
}

/**
 * Journal des logs serveur (owners) : entrées filtrées + compteurs par
 * catégorie. Filtres : catégorie, utilisateur, plage de dates, recherche texte.
 */
function serverLogs(guildId, filters = {}) {
  return safe(
    () => ({
      categories: Object.fromEntries(Object.entries(logCategories).map(([key, def]) => [key, def.label])),
      stats: logStore.statsByCategory(guildId),
      entries: logStore.query(guildId, filters),
    }),
    { categories: {}, stats: {}, entries: [] },
  );
}

module.exports = { globalStats, listGuilds, guildOverview, ticketSummary, tickets, tempVoice, captcha, antipub, antisensitive, levels, snipe, moderation, profile, reputationProfile, reputationOverview, memberFile, serverLogs, totalBumps, totalTickets };
