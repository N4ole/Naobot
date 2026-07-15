/**
 * Logique métier de l'expulsion, partagée par les commandes slash et préfixées.
 */
const { checkTargetHierarchy } = require('../../middlewares/permissions/checkPermissions');
const { logModAction } = require('../logging/modLogService');
const { modLogEmbed } = require('../../utils/embeds/embeds');
const { auditReason, dmUser } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

/**
 * Expulse un membre du serveur.
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {import('discord.js').GuildMember} member
 * @param {string} reason
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function kickMember(ctx, member, reason) {
  const hierarchy = checkTargetHierarchy(ctx, member);
  if (!hierarchy.ok) return { ok: false, message: hierarchy.error };
  if (!member.kickable) return { ok: false, message: t('moderation.kick.notKickable') };

  // Le MP est envoyé avant l'expulsion, sinon il devient impossible.
  await dmUser(member.user, t('moderation.dm.kick', { guild: ctx.guild.name, reason }));

  try {
    await member.kick(auditReason(ctx.user, reason));
  } catch {
    return { ok: false, message: t('moderation.kick.failed') };
  }

  await logModAction(
    ctx.guild,
    modLogEmbed({ action: t('moderation.kick.logAction'), target: member.user, moderator: ctx.user, reason }),
  );
  return { ok: true, message: t('moderation.kick.success', { user: member.user.tag, reason }) };
}

module.exports = { kickMember };
