/**
 * Réputation GLOBALE (inter-serveurs) des utilisateurs, centralisée au niveau
 * du bot. Fournit un indicateur de confiance (0-100) fondé sur les événements
 * de modération observés par NaoBot, **sans remplacer** la modération locale.
 *
 * Point d'entrée unique `record()` : tous les modules de modération y envoient
 * leurs événements (warn, timeout, mute, kick, ban, anti-spam, anti-link,
 * anti-bot, captcha…). Le score est recalculé à partir de l'historique complet
 * avec les pondérations courantes (un changement de pondération reprice tout).
 *
 * Protection contre les abus : un serveur ne peut jamais fixer directement le
 * score (seulement contribuer via des événements tracés) ; chaque événement
 * est journalisé (traçabilité) ; le nombre d'événements par (serveur,
 * utilisateur, jour) est plafonné.
 *
 * Distinct de services/reputation/reputationService (réputation des SERVEURS).
 */
const repository = require('../../database/globalReputationRepository');
const historyRepository = require('../../database/moderationHistoryRepository');
const configRepository = require('../../database/reputationConfigRepository');
const logService = require('../logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const {
  SCORE_BASE, SCORE_MIN, SCORE_MAX, TIMEOUT_LONG_MS, ACTION_STAT, trustLevel, badgesFor,
} = require('../../utils/constants/globalReputation');
const { t } = require('../../utils/helpers/i18n');

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (n) => Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(n)));

function weightForAction(action, durationMs, weights) {
  if (action === 'timeout') return durationMs && durationMs >= TIMEOUT_LONG_MS ? weights.timeoutLong : weights.timeoutShort;
  return weights[action] ?? 0;
}

function accountAgeBonus(accountCreatedAt, positive) {
  if (!accountCreatedAt) return 0;
  const years = (Date.now() - accountCreatedAt) / (365.25 * DAY_MS);
  return Math.min(positive.accountAgeMax, Math.floor(Math.max(0, years) * positive.accountAgePerYear));
}

/** Recalcule le score à partir de l'historique complet et de la config. */
function computeScore(accountCreatedAt, history, config) {
  const penalty = history.reduce((sum, event) => sum + weightForAction(event.action, event.durationMs, config.weights), 0);
  return clamp(SCORE_BASE + accountAgeBonus(accountCreatedAt, config.positive) - penalty);
}

async function logRep(guild, action, fields = [], color) {
  if (!guild) return;
  await logService.log(guild, 'repglobale', logEventEmbed({ title: `🌐 ${t(`repglobale.logs.${action}`)}`, color: color ?? COLORS.LOG_NEUTRAL, fields })).catch(() => null);
}

/**
 * Enregistre un événement de modération contribuant à la réputation globale.
 * @param {object} params
 * @param {import('discord.js').Guild} params.guild - Serveur d'origine
 * @param {import('discord.js').User} params.user - Utilisateur concerné
 * @param {import('discord.js').User} [params.moderator]
 * @param {string} params.action - warn|timeout|mute|kick|ban|antispam|antilink|antibot|captcha
 * @param {string} [params.reason]
 * @param {number} [params.durationMs]
 * @param {boolean} [params.automatic]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, scoreBefore?: number, scoreAfter?: number }>}
 */
async function record({ guild, user, moderator = null, action, reason = null, durationMs = null, automatic = false }) {
  if (!user || !ACTION_STAT[action]) return { ok: false };
  const guildId = guild?.id ?? null;
  const config = configRepository.getConfig();

  // Anti-abus : plafond d'événements par (serveur, utilisateur, jour).
  if (guildId && historyRepository.countRecent(user.id, guildId, DAY_MS) >= config.limits.maxEventsPerGuildPerDay) {
    await logRep(guild, 'limited', [{ name: t('common.member'), value: `${user.tag}`, inline: true }], COLORS.ERROR);
    return { ok: false, skipped: true };
  }

  const rec = repository.getOrCreate(user.id);
  rec.tag = user.tag ?? rec.tag;
  if (user.createdTimestamp) rec.accountCreatedAt = user.createdTimestamp;
  if (guildId && !rec.guilds.includes(guildId)) rec.guilds.push(guildId);
  rec.stats[ACTION_STAT[action]] = (rec.stats[ACTION_STAT[action]] ?? 0) + 1;

  const scoreBefore = rec.score;
  const history = historyRepository.getHistory(user.id);
  const event = { guildId, action, reason, moderatorId: moderator?.id ?? null, durationMs, scoreBefore, scoreAfter: scoreBefore, automatic };
  const scoreAfter = computeScore(rec.accountCreatedAt, [...history, event], config);
  event.scoreAfter = scoreAfter;
  rec.score = scoreAfter;

  repository.save(rec);
  historyRepository.addEvent(user.id, event);

  await logRep(
    guild,
    'sanction',
    [
      { name: t('common.member'), value: `${user.tag} (\`${user.id}\`)`, inline: true },
      { name: t('repglobale.field.action'), value: action, inline: true },
      { name: t('repglobale.field.score'), value: `${scoreBefore} → ${scoreAfter}`, inline: true },
    ],
    COLORS.LOG_UPDATE,
  );
  return { ok: true, scoreBefore, scoreAfter };
}

/** Recalcule le score d'un utilisateur (après changement de pondération). */
function recalculate(userId) {
  const rec = repository.getRecord(userId);
  if (!rec) return null;
  rec.score = computeScore(rec.accountCreatedAt, historyRepository.getHistory(userId), configRepository.getConfig());
  return repository.save(rec);
}

function recalculateAll() {
  const config = configRepository.getConfig();
  for (const rec of repository.all()) {
    rec.score = computeScore(rec.accountCreatedAt, historyRepository.getHistory(rec.userId), config);
    repository.save(rec);
  }
}

/** Profil de réputation d'un utilisateur (défaut fiable si jamais observé). */
function getProfile(userId) {
  const rec = repository.getRecord(userId) ?? repository.defaultRecord(userId);
  const history = historyRepository.getHistory(userId);
  const level = trustLevel(rec.score);
  return {
    record: rec,
    score: rec.score,
    level,
    badges: badgesFor(rec, rec.score),
    stats: rec.stats,
    guildsCount: rec.guilds.length,
    history,
  };
}

/** Statistiques globales (owners). */
function globalStats() {
  const all = repository.all();
  const totalSanctions = all.reduce((sum, rec) => sum + Object.values(rec.stats ?? {}).reduce((s, n) => s + (n || 0), 0), 0);
  return {
    users: all.length,
    totalSanctions,
    totalEvents: historyRepository.totalEvents(),
    best: repository.ranked({ order: 'desc', limit: 10 }),
    worst: repository.ranked({ order: 'asc', limit: 10 }).filter((rec) => rec.score < SCORE_MAX),
  };
}

module.exports = {
  record,
  recalculate,
  recalculateAll,
  getProfile,
  globalStats,
  computeScore,
  weightForAction,
  logRep,
  getConfig: configRepository.getConfig,
  setWeight: configRepository.setWeight,
  getHistory: historyRepository.getHistory,
};
