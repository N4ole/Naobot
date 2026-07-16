/**
 * Résolution et application des sanctions progressives.
 *
 * - resolveSanction : quelle sanction pour un nombre de warns donné
 *   (au-delà du dernier palier, le dernier palier s'applique — « plafond »).
 * - executeSanction : applique concrètement la punition via les mécanismes
 *   natifs de Discord, en réutilisant ensureMutedRole (mute par rôle) et
 *   auditReason. Jamais bloquant : retourne un code d'échec exploitable.
 *
 * La configuration de l'échelle vit dans database/warnConfigRepository ;
 * les libellés dans utils/constants/warnSanctions et locales/fr.json.
 */
const warnConfigRepository = require('../../database/warnConfigRepository');
const { ensureMutedRole } = require('../moderation/muteService');
const { SANCTION_TYPES } = require('../../utils/constants/warnSanctions');
const { MAX_TIMEOUT_MS } = require('../../utils/constants/limits');
const { auditReason } = require('../../utils/helpers/discordUtils');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

/** Paliers triés par ordre croissant. */
function sortedLevels(ladder) {
  return Object.keys(ladder)
    .map(Number)
    .filter((level) => Number.isInteger(level) && level > 0)
    .sort((a, b) => a - b);
}

/**
 * Sanction applicable pour `count` warns.
 * @returns {{ level: number, sanction: object } | null}
 */
function resolveSanction(guildId, count) {
  if (count <= 0) return null;
  const ladder = warnConfigRepository.getLadder(guildId);
  const levels = sortedLevels(ladder);
  if (levels.length === 0) return null;

  const maxLevel = levels[levels.length - 1];
  const effective = Math.min(count, maxLevel);
  const sanction = ladder[effective];
  if (!sanction || sanction.enabled === false) return null;
  return { level: effective, sanction };
}

/** Sanction prévue au prochain warn (count + 1). */
function nextSanction(guildId, count) {
  return resolveSanction(guildId, count + 1);
}

/** Libellé lisible d'une sanction (« Exclusion temporaire (1 h) »). */
function describeSanction(sanction) {
  if (!sanction) return t('warns.sanction.none');
  const type = SANCTION_TYPES[sanction.type];
  if (!type) return sanction.type;
  if (type.duration && sanction.durationMs) {
    return `${type.emoji} ${type.label} (${formatDuration(sanction.durationMs)})`;
  }
  return `${type.emoji} ${type.label}`;
}

/**
 * Applique une sanction à un membre.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember|null} member
 * @param {import('discord.js').User} moderator
 * @param {object} sanction - { type, durationMs? }
 * @param {string} reason
 * @returns {Promise<{ applied: boolean, code?: string }>}
 */
async function executeSanction(guild, member, moderator, sanction, reason) {
  const audit = auditReason(moderator, reason);
  try {
    switch (sanction.type) {
      case 'warn':
        return { applied: true };
      case 'timeout': {
        if (!member?.moderatable) return { applied: false, code: 'cannotModerate' };
        await member.timeout(Math.min(sanction.durationMs ?? 0, MAX_TIMEOUT_MS), audit);
        return { applied: true };
      }
      case 'mute': {
        if (!member) return { applied: false, code: 'notMember' };
        const role = await ensureMutedRole(guild);
        if (!role) return { applied: false, code: 'muteRoleFailed' };
        if (!member.roles.cache.has(role.id)) await member.roles.add(role, audit);
        return { applied: true };
      }
      case 'kick': {
        if (!member?.kickable) return { applied: false, code: 'cannotKick' };
        await member.kick(audit);
        return { applied: true };
      }
      case 'ban': {
        if (!member?.bannable) return { applied: false, code: 'cannotBan' };
        await guild.members.ban(member.id, { reason: audit });
        return { applied: true };
      }
      default:
        return { applied: false, code: 'unknownType' };
    }
  } catch {
    return { applied: false, code: 'error' };
  }
}

module.exports = {
  resolveSanction,
  nextSanction,
  describeSanction,
  executeSanction,
  sortedLevels,
  getLadder: warnConfigRepository.getLadder,
  setTier: warnConfigRepository.setTier,
  resetLadder: warnConfigRepository.resetLadder,
};
