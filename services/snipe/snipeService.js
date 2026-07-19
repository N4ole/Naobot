/**
 * Système de snipe : capture et consultation des événements récents
 * (messages supprimés/modifiés, suppressions massives, arrivées/départs,
 * changements de rôles, sanctions, tickets, protections).
 *
 * - `record(guild, category, payload)` : appelé par les écouteurs et les
 *   services concernés pour mémoriser un événement (le plus récent en tête).
 * - `query(guildId, category, filtres)` : consultation filtrée (utilisateur,
 *   salon) — la pagination et les boutons vivent dans la commande.
 * - Limites par serveur (nombre maximal, durée de conservation) + purge
 *   automatique périodique (repository).
 * - Toute consultation est journalisée dans la catégorie de logs « watch »
 *   (surveillance).
 */
const crypto = require('node:crypto');
const repository = require('../../database/snipeRepository');
const snipeCategories = require('../../utils/constants/snipeCategories');
const logService = require('../logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Intervalle de la purge automatique des événements expirés. */
const PURGE_INTERVAL_MS = 30 * 60 * 1000;

function isCategory(category) {
  return Boolean(snipeCategories[category]);
}

/**
 * Mémorise un événement de snipe.
 * @param {import('discord.js').Guild} guild
 * @param {string} category  clé de snipeCategories
 * @param {object} payload   { type?, userId?, userTag?, channelId?, moderatorId?,
 *   oldContent?, newContent?, attachments?, images?, extra? }
 */
function record(guild, category, payload = {}) {
  if (!guild || !isCategory(category)) return;
  const entry = {
    id: crypto.randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    type: payload.type ?? category,
    userId: payload.userId ?? null,
    userTag: payload.userTag ?? null,
    channelId: payload.channelId ?? null,
    moderatorId: payload.moderatorId ?? null,
    oldContent: payload.oldContent ?? null,
    newContent: payload.newContent ?? null,
    attachments: Array.isArray(payload.attachments) ? payload.attachments.slice(0, 10) : [],
    images: Array.isArray(payload.images) ? payload.images.slice(0, 10) : [],
    extra: payload.extra ?? {},
  };
  repository.push(guild.id, category, entry);
}

/**
 * Consulte les événements d'une catégorie, filtrés par utilisateur et/ou salon.
 * @returns {object[]} les plus récents d'abord
 */
function query(guildId, category, { userId, channelId } = {}) {
  if (!isCategory(category)) return [];
  let items = repository.list(guildId, category);
  if (userId) items = items.filter((entry) => entry.userId === userId);
  if (channelId) items = items.filter((entry) => entry.channelId === channelId);
  return items;
}

function getConfig(guildId) {
  return repository.getConfig(guildId);
}

function setConfig(guildId, patch) {
  return repository.setConfig(guildId, patch);
}

/** Journalise une consultation de snipe dans la catégorie « watch ». */
function logConsultation(guild, category, user, filters = {}) {
  const def = snipeCategories[category];
  const fields = [{ name: t('snipe.field.category'), value: `${def.emoji} ${def.label}`, inline: true }];
  if (filters.userId) fields.push({ name: t('snipe.field.user'), value: `<@${filters.userId}>`, inline: true });
  if (filters.channelId) fields.push({ name: t('snipe.field.channel'), value: `<#${filters.channelId}>`, inline: true });
  return logService
    .log(
      guild,
      'watch',
      logEventEmbed({ title: `🔍 ${t('snipe.logs.consulted')}`, color: COLORS.LOG_NEUTRAL, user, fields }),
    )
    .catch(() => null);
}

/** Purge tous les serveurs (événements expirés). */
function purgeAll() {
  for (const guildId of repository.allGuildIds()) repository.purgeGuild(guildId);
}

/** Démarre la purge périodique (appelée au ready). */
function startPurgeScheduler() {
  purgeAll();
  const timer = setInterval(purgeAll, PURGE_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

module.exports = {
  PURGE_INTERVAL_MS,
  record,
  query,
  getConfig,
  setConfig,
  logConsultation,
  purgeAll,
  startPurgeScheduler,
};
