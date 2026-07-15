/**
 * Suivi des serveurs : enregistre les arrivées/départs du bot, l'activité
 * (commandes, sanctions) et les événements sensibles (suppressions de
 * salons, bannissements) utilisés par le système de réputation.
 * Toutes les données sont persistées immédiatement.
 */
const repository = require('../../database/guildStatsRepository');

/** Fenêtre de détection des événements « massifs » (suppressions, bans). */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Séjour considéré comme « départ rapide » après une invitation. */
const SHORT_STAY_MS = 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function pruneRecent(timestamps, now = Date.now()) {
  return (timestamps ?? []).filter((ts) => now - ts < RECENT_WINDOW_MS);
}

/** Nombre d'événements dans la fenêtre récente. */
function countRecent(timestamps, now = Date.now()) {
  return pruneRecent(timestamps, now).length;
}

/** @param {import('discord.js').Guild} guild */
function recordJoin(guild) {
  const stats = repository.getStats(guild.id);
  stats.name = guild.name;
  if (!stats.firstJoinedAt) stats.firstJoinedAt = nowIso();
  stats.lastJoinedAt = nowIso();
  stats.joinCount += 1;
  repository.saveStats(guild.id, stats);
  return stats;
}

/** @param {import('discord.js').Guild} guild */
function recordLeave(guild) {
  const stats = repository.getStats(guild.id);
  stats.name = guild.name ?? stats.name;
  stats.lastLeftAt = nowIso();
  stats.leaveCount += 1;
  const joinedAt = guild.joinedTimestamp ?? Date.parse(stats.lastJoinedAt ?? '');
  if (Number.isFinite(joinedAt) && Date.now() - joinedAt < SHORT_STAY_MS) {
    stats.shortStayCount += 1;
  }
  repository.saveStats(guild.id, stats);
  return stats;
}

function recordCommand(guildId) {
  const stats = repository.getStats(guildId);
  stats.commandCount += 1;
  stats.lastActivityAt = nowIso();
  repository.saveStats(guildId, stats);
}

function recordSanction(guildId) {
  const stats = repository.getStats(guildId);
  stats.sanctionCount += 1;
  stats.lastActivityAt = nowIso();
  repository.saveStats(guildId, stats);
}

function recordChannelDeletion(guildId) {
  const stats = repository.getStats(guildId);
  stats.channelDeletions = [...pruneRecent(stats.channelDeletions), Date.now()];
  repository.saveStats(guildId, stats);
}

function recordBan(guildId) {
  const stats = repository.getStats(guildId);
  stats.banEvents = [...pruneRecent(stats.banEvents), Date.now()];
  repository.saveStats(guildId, stats);
}

module.exports = {
  RECENT_WINDOW_MS,
  SHORT_STAY_MS,
  countRecent,
  recordJoin,
  recordLeave,
  recordCommand,
  recordSanction,
  recordChannelDeletion,
  recordBan,
  getStats: repository.getStats,
  saveStats: repository.saveStats,
  getAllStats: repository.getAllStats,
};
