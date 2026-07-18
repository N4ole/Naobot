/**
 * Logique métier de l'exclusion temporaire (timeout / untimeout), partagée
 * par les commandes slash et préfixées. Utilise le système de timeout natif
 * de Discord (communication désactivée), visible dans l'interface Discord et
 * dans les logs d'audit.
 */
const { checkTargetHierarchy } = require('../../middlewares/permissions/checkPermissions');
const { logModAction } = require('../logging/modLogService');
const globalReputationService = require('../reputation/globalReputationService');
const { modLogEmbed } = require('../../utils/embeds/embeds');
const { auditReason, dmUser } = require('../../utils/helpers/discordUtils');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { MAX_TIMEOUT_MS } = require('../../utils/constants/limits');
const { t } = require('../../utils/helpers/i18n');

/**
 * Applique une exclusion temporaire à un membre.
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {import('discord.js').GuildMember} member
 * @param {number} durationMs
 * @param {string} reason
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function applyTimeout(ctx, member, durationMs, reason) {
  const hierarchy = checkTargetHierarchy(ctx, member);
  if (!hierarchy.ok) return { ok: false, message: hierarchy.error };
  if (durationMs > MAX_TIMEOUT_MS) return { ok: false, message: t('moderation.timeout.tooLong') };
  if (!member.moderatable) return { ok: false, message: t('moderation.timeout.notModeratable') };

  const duration = formatDuration(durationMs);
  try {
    await member.timeout(durationMs, auditReason(ctx.user, reason));
  } catch {
    return { ok: false, message: t('moderation.timeout.failed') };
  }

  await dmUser(member.user, t('moderation.dm.timeout', { guild: ctx.guild.name, duration, reason }));
  await logModAction(
    ctx.guild,
    modLogEmbed({
      action: t('moderation.timeout.logAction'),
      target: member.user,
      moderator: ctx.user,
      reason,
      extraFields: [{ name: t('common.duration'), value: duration, inline: true }],
    }),
  );
  globalReputationService.record({ guild: ctx.guild, user: member.user, moderator: ctx.user, action: 'timeout', reason, durationMs }).catch(() => null);
  return { ok: true, message: t('moderation.timeout.success', { user: member.user.tag, duration, reason }) };
}

/**
 * Lève l'exclusion temporaire d'un membre.
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {import('discord.js').GuildMember} member
 * @param {string} reason
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function removeTimeout(ctx, member, reason) {
  if (!member.isCommunicationDisabled()) {
    return { ok: false, message: t('moderation.untimeout.notTimedOut') };
  }
  if (!member.moderatable) return { ok: false, message: t('moderation.timeout.notModeratable') };

  try {
    await member.timeout(null, auditReason(ctx.user, reason));
  } catch {
    return { ok: false, message: t('moderation.untimeout.failed') };
  }

  await dmUser(member.user, t('moderation.dm.untimeout', { guild: ctx.guild.name }));
  await logModAction(
    ctx.guild,
    modLogEmbed({ action: t('moderation.untimeout.logAction'), target: member.user, moderator: ctx.user, reason }),
  );
  return { ok: true, message: t('moderation.untimeout.success', { user: member.user.tag }) };
}

module.exports = { applyTimeout, removeTimeout };
