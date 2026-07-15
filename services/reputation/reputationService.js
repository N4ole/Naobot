/**
 * Système de réputation des serveurs.
 *
 * Chaque serveur reçoit un score (0-100), un niveau (Excellent → Dangereux,
 * voir utils/constants/reputationLevels) et un historique des changements,
 * persistés dans database/data/guildStats.json.
 *
 * Le score part d'une base de 50 points, ajustée par la liste CRITERIA :
 * chaque critère est une fonction pure qui reçoit un instantané du serveur
 * (buildInput) et retourne un nombre de points. **Ajouter un critère =
 * ajouter une entrée dans CRITERIA** — le calcul, le détail affiché par la
 * commande rep et l'historique le prennent en compte automatiquement.
 *
 * Un score fixé manuellement (rep set) prime sur le score calculé jusqu'au
 * prochain recalcul manuel (rep recalc) ; les recalculs automatiques
 * (événements importants) mettent à jour le score calculé sans écraser
 * l'override manuel.
 */
const statsService = require('../tracking/guildStatsService');
const levels = require('../../utils/constants/reputationLevels');
const { t } = require('../../utils/helpers/i18n');

const BASE_SCORE = 50;
const HISTORY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Critères de réputation. Chaque entrée : { key, label, evaluate(input) }.
 * `input` est l'instantané retourné par buildInput ; `evaluate` retourne un
 * delta de points (positif ou négatif).
 */
const CRITERIA = [
  {
    key: 'age',
    label: 'Ancienneté du serveur',
    evaluate: ({ ageMs }) => {
      const days = ageMs / DAY_MS;
      if (days >= 365) return 10;
      if (days >= 180) return 6;
      if (days >= 30) return 2;
      if (days >= 7) return 0;
      return -8;
    },
  },
  {
    key: 'members',
    label: 'Nombre de membres',
    evaluate: ({ memberCount }) => {
      if (memberCount >= 1000) return 10;
      if (memberCount >= 100) return 6;
      if (memberCount >= 20) return 2;
      if (memberCount >= 5) return 0;
      return -4;
    },
  },
  {
    key: 'botRatio',
    label: 'Ratio humains / bots',
    evaluate: ({ botRatio }) => {
      if (botRatio === null) return 0;
      if (botRatio > 0.5) return -15;
      if (botRatio > 0.3) return -6;
      if (botRatio < 0.1) return 5;
      return 0;
    },
  },
  {
    key: 'verification',
    label: 'Niveau de vérification',
    evaluate: ({ verificationLevel }) => [-5, 0, 3, 6, 8][verificationLevel] ?? 0,
  },
  {
    key: 'sanctions',
    label: 'Sanctions réalisées',
    evaluate: ({ sanctionCount }) => -Math.min(Math.floor(sanctionCount / 10), 10),
  },
  {
    key: 'usage',
    label: "Fréquence d'utilisation du bot",
    evaluate: ({ commandCount }) => {
      if (commandCount >= 200) return 6;
      if (commandCount >= 50) return 4;
      if (commandCount >= 10) return 2;
      return 0;
    },
  },
  {
    key: 'channelDeletions',
    label: 'Suppressions massives de salons (24 h)',
    evaluate: ({ recentChannelDeletions }) => {
      if (recentChannelDeletions >= 10) return -15;
      if (recentChannelDeletions >= 5) return -8;
      return 0;
    },
  },
  {
    key: 'massBans',
    label: 'Bannissements massifs (24 h)',
    evaluate: ({ recentBans }) => {
      if (recentBans >= 10) return -15;
      if (recentBans >= 5) return -8;
      return 0;
    },
  },
  {
    key: 'churn',
    label: 'Départs / retours du bot',
    evaluate: ({ joinCount }) => -Math.min(Math.max(joinCount - 1, 0) * 5, 15),
  },
  {
    key: 'shortStays',
    label: 'Invitations suivies de départs rapides',
    evaluate: ({ shortStayCount }) => -Math.min(shortStayCount * 7, 14),
  },
];

/** Niveau correspondant à un score. */
function levelFor(score) {
  return levels.find((level) => score >= level.min)?.key ?? 'dangereux';
}

/**
 * Calcul pur du score à partir d'un instantané (voir buildInput).
 * @returns {{ score: number, level: string, breakdown: {key, label, points}[] }}
 */
function computeScore(input) {
  const breakdown = CRITERIA.map((criterion) => ({
    key: criterion.key,
    label: criterion.label,
    points: criterion.evaluate(input),
  }));
  const total = breakdown.reduce((sum, entry) => sum + entry.points, BASE_SCORE);
  const score = Math.max(0, Math.min(100, Math.round(total)));
  return { score, level: levelFor(score), breakdown };
}

/** Instantané des données d'un serveur pour le calcul du score. */
function buildInput(guild, stats) {
  const now = Date.now();
  // Ratio de bots estimé depuis le cache (approximation suffisante).
  let botRatio = null;
  const cached = guild.members.cache;
  if (cached.size >= 10 || cached.size >= (guild.memberCount ?? 0)) {
    botRatio = cached.filter((member) => member.user.bot).size / Math.max(cached.size, 1);
  }
  return {
    ageMs: now - guild.createdTimestamp,
    memberCount: guild.memberCount ?? 0,
    botRatio,
    verificationLevel: Number(guild.verificationLevel ?? 0),
    sanctionCount: stats.sanctionCount,
    commandCount: stats.commandCount,
    joinCount: Math.max(stats.joinCount, 1),
    shortStayCount: stats.shortStayCount,
    recentChannelDeletions: statsService.countRecent(stats.channelDeletions, now),
    recentBans: statsService.countRecent(stats.banEvents, now),
  };
}

function appendHistory(reputation, score, level, reason) {
  reputation.history = reputation.history ?? [];
  const last = reputation.history[reputation.history.length - 1];
  // Les recalculs automatiques ne tracent que les changements significatifs.
  if (reason === 'auto' && last && last.level === level && Math.abs(last.score - score) < 5) return;
  reputation.history.push({ at: new Date().toISOString(), score, level, reason });
  reputation.history = reputation.history.slice(-HISTORY_LIMIT);
}

/** Score/niveau effectifs depuis des stats déjà chargées (null si jamais évalué). */
function getEffective(stats) {
  const reputation = stats.reputation;
  if (!reputation) return null;
  const score = reputation.manual?.score ?? reputation.score;
  return { score, level: levelFor(score), manual: reputation.manual ?? null };
}

/**
 * Recalcule et persiste la réputation d'un serveur.
 * @param {import('discord.js').Guild} guild
 * @param {{ reason?: string, clearManual?: boolean }} [options]
 *   reason : 'auto' (événement), 'recalcul' (commande), 'initial'.
 *   clearManual : lève l'override manuel (utilisé par rep recalc).
 */
function recalculate(guild, { reason = 'auto', clearManual = false } = {}) {
  const stats = statsService.getStats(guild.id);
  stats.name = guild.name ?? stats.name;
  const computed = computeScore(buildInput(guild, stats));

  const reputation = stats.reputation ?? { history: [] };
  if (clearManual) reputation.manual = null;
  reputation.score = computed.score;
  reputation.level = computed.level;
  reputation.updatedAt = new Date().toISOString();

  const effectiveScore = reputation.manual?.score ?? computed.score;
  const effectiveLevel = levelFor(effectiveScore);
  appendHistory(reputation, effectiveScore, effectiveLevel, reason);

  stats.reputation = reputation;
  statsService.saveStats(guild.id, stats);
  return {
    score: effectiveScore,
    level: effectiveLevel,
    breakdown: computed.breakdown,
    manual: reputation.manual ?? null,
  };
}

/** Fixe manuellement le score d'un serveur (prime jusqu'au prochain rep recalc). */
function setManual(guildId, score, byUserId) {
  const stats = statsService.getStats(guildId);
  const reputation = stats.reputation ?? { history: [], score, level: levelFor(score) };
  reputation.manual = { score, by: byUserId, at: new Date().toISOString() };
  appendHistory(reputation, score, levelFor(score), 'manuel');
  stats.reputation = reputation;
  statsService.saveStats(guildId, stats);
  return { score, level: levelFor(score) };
}

/** Réputation pour affichage : valeur stockée, ou première évaluation. */
function getOrCompute(guild) {
  const effective = getEffective(statsService.getStats(guild.id));
  return effective ?? recalculate(guild, { reason: 'initial' });
}

/** Rendu court « 🟢 Excellent (84/100) » pour les embeds. */
function formatReputation({ score, level }) {
  const definition = levels.find((entry) => entry.key === level);
  return `${definition?.emoji ?? ''} ${t(`reputation.levels.${level}`)} (${score}/100)`;
}

module.exports = {
  BASE_SCORE,
  CRITERIA,
  levelFor,
  computeScore,
  buildInput,
  getEffective,
  getOrCompute,
  recalculate,
  setManual,
  formatReputation,
};
