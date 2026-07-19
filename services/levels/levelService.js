/**
 * Système de niveaux basé sur l'activité réelle des membres, propre à chaque
 * serveur. Deux sources d'XP : messages (avec cooldown, longueur minimale et
 * anti-répétition) et temps vocal (minutes réellement actives).
 *
 * La courbe de niveaux est **configurable** : XP total requis pour atteindre un
 * niveau = `base * level² + offset` (défaut 50·L²+50 → 100, 250, 500, 850…).
 *
 * Récompenses : rôles attribués à certains niveaux (cumulatifs), annonce
 * optionnelle (salon dédié ou salon courant). Tout est journalisé (gain de
 * niveau et configuration → « members » ; attribution de rôle → « roles »).
 *
 * L'affichage (rank) sépare les **données** (buildRankData) de la présentation,
 * afin d'ajouter facilement une carte graphique de profil plus tard.
 */
const repository = require('../../database/levelRepository');
const logService = require('../logs/logService');
const { logEventEmbed, successEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** XP total nécessaire pour atteindre `level` (0 pour le niveau 0). */
function xpToReach(level, curve) {
  if (level <= 0) return 0;
  return Math.round(curve.base * level * level + curve.offset);
}

/** Niveau correspondant à une quantité d'XP totale. */
function levelForXp(xp, curve) {
  if (xp < xpToReach(1, curve)) return 0;
  const level = Math.floor(Math.sqrt(Math.max(0, (xp - curve.offset) / curve.base)));
  return Math.max(0, level);
}

/** Détail de progression d'un utilisateur (pour rank / carte future). */
function progress(user, curve) {
  const level = user.level;
  const floor = xpToReach(level, curve);
  const ceil = xpToReach(level + 1, curve);
  const needed = Math.max(1, ceil - floor);
  const into = Math.max(0, user.xp - floor);
  return { level, xp: user.xp, into, needed, nextLevelXp: ceil, ratio: Math.min(1, into / needed) };
}

const getConfig = (guildId) => repository.getConfig(guildId);
const isEnabled = (guildId) => repository.getConfig(guildId).enabled === true;

function touch(config, byUserId) {
  config.lastModifiedAt = new Date().toISOString();
  config.lastModifiedBy = byUserId ?? null;
}

function saveConfig(guild, config, byUser) {
  touch(config, byUser?.id);
  repository.saveConfig(guild.id, config);
  return logService
    .log(guild, 'members', logEventEmbed({ title: `📈 ${t('levels.logs.configChanged')}`, color: COLORS.LOG_UPDATE, user: byUser, fields: [] }))
    .catch(() => null);
}

/** Attribue les rôles de récompense des niveaux atteints (cumulatif). */
async function assignRewards(guild, member, config, newLevel) {
  const rewards = config.rewards ?? {};
  const me = guild.members.me;
  for (const [levelStr, roleId] of Object.entries(rewards)) {
    if (Number(levelStr) > newLevel) continue;
    const role = guild.roles.cache.get(roleId);
    if (!role || role.managed) continue;
    if (me && role.position >= me.roles.highest.position) continue;
    if (member.roles.cache.has(roleId)) continue;
    const added = await member.roles.add(role, t('levels.rewardReason', { level: levelStr })).then(() => true).catch(() => false);
    if (added) {
      await logService
        .log(guild, 'roles', logEventEmbed({
          title: `🎁 ${t('levels.logs.rewardGranted')}`,
          color: COLORS.LOG_CREATE,
          fields: [
            { name: t('common.member'), value: `${member.user.tag}`, inline: true },
            { name: t('levels.field.level'), value: String(levelStr), inline: true },
            { name: t('levels.field.role'), value: `<@&${roleId}>`, inline: true },
          ],
        }))
        .catch(() => null);
    }
  }
}

/** Annonce une montée de niveau (salon configuré, ou salon fourni). */
async function announceLevelUp(guild, member, config, newLevel, fallbackChannel) {
  if (!config.announceLevelUp) return;
  const channel = (config.announceChannelId && guild.channels.cache.get(config.announceChannelId)) || fallbackChannel;
  if (!channel?.isTextBased?.()) return;
  await channel
    .send({ embeds: [successEmbed(t('levels.levelUp', { user: `<@${member.id}>`, level: newLevel }))], allowedMentions: { users: [member.id] } })
    .catch(() => null);
}

/**
 * Ajoute de l'XP à un membre et gère la montée de niveau.
 * @returns {Promise<{ leveledUp: boolean, level: number }>}
 */
async function addXp(guild, member, amount, { channel = null, incMessages = 0, incVoiceMs = 0, hash = undefined } = {}) {
  const config = repository.getConfig(guild.id);
  const user = repository.getUser(guild.id, member.id);
  user.xp += Math.max(0, Math.round(amount));
  user.messages += incMessages;
  user.voiceMs += Math.max(0, incVoiceMs);
  if (hash !== undefined) user.lastHash = hash;
  if (incMessages > 0) user.lastMessageAt = Date.now();

  const previousLevel = user.level;
  const newLevel = levelForXp(user.xp, config.curve);
  user.level = newLevel;
  repository.saveUser(guild.id, member.id, user);

  if (newLevel > previousLevel) {
    await assignRewards(guild, member, config, newLevel).catch(() => null);
    await announceLevelUp(guild, member, config, newLevel, channel).catch(() => null);
    await logService
      .log(guild, 'members', logEventEmbed({
        title: `📈 ${t('levels.logs.levelUp')}`,
        color: COLORS.LOG_CREATE,
        fields: [
          { name: t('common.member'), value: `${member.user.tag}`, inline: true },
          { name: t('levels.field.level'), value: `${previousLevel} → **${newLevel}**`, inline: true },
        ],
      }))
      .catch(() => null);
    return { leveledUp: true, level: newLevel };
  }
  return { leveledUp: false, level: newLevel };
}

/** Données du classement (leaderboard), enrichies du rang. */
function leaderboard(guildId) {
  return repository.rankedUsers(guildId).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Données de rang d'un membre (séparées de la présentation). */
function buildRankData(guild, userId) {
  const config = repository.getConfig(guild.id);
  const user = repository.getUser(guild.id, userId);
  return {
    userId,
    level: user.level,
    xp: user.xp,
    messages: user.messages,
    voiceMs: user.voiceMs,
    rank: repository.rankOf(guild.id, userId),
    total: repository.rankedUsers(guild.id).length,
    progress: progress(user, config.curve),
  };
}

module.exports = {
  xpToReach,
  levelForXp,
  progress,
  getConfig,
  isEnabled,
  saveConfig,
  addXp,
  leaderboard,
  buildRankData,
};
