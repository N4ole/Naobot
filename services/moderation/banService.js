/**
 * Logique métier du bannissement (ban / unban), partagée par les commandes
 * slash et préfixées. S'appuie sur le système de bans natif de Discord.
 */
const { checkTargetHierarchy } = require('../../middlewares/permissions/checkPermissions');
const { logModAction } = require('../logging/modLogService');
const { modLogEmbed } = require('../../utils/embeds/embeds');
const { auditReason, dmUser } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

/**
 * Bannit un utilisateur (membre du serveur ou non, via son identifiant).
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {import('discord.js').User} user
 * @param {string} reason
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function banUser(ctx, user, reason) {
  // Si l'utilisateur est membre du serveur, la hiérarchie s'applique.
  const member = await ctx.guild.members.fetch(user.id).catch(() => null);
  if (member) {
    const hierarchy = checkTargetHierarchy(ctx, member);
    if (!hierarchy.ok) return { ok: false, message: hierarchy.error };
    if (!member.bannable) return { ok: false, message: t('moderation.ban.notBannable') };
  }

  // Le MP est envoyé avant le ban, sinon il devient impossible.
  await dmUser(user, t('moderation.dm.ban', { guild: ctx.guild.name, reason }));

  try {
    await ctx.guild.members.ban(user.id, { reason: auditReason(ctx.user, reason) });
  } catch {
    return { ok: false, message: t('moderation.ban.failed') };
  }

  await logModAction(
    ctx.guild,
    modLogEmbed({ action: t('moderation.ban.logAction'), target: user, moderator: ctx.user, reason }),
  );
  return { ok: true, message: t('moderation.ban.success', { user: user.tag, reason }) };
}

/**
 * Révoque le bannissement d'un utilisateur.
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {import('discord.js').User} user
 * @param {string} reason
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function unbanUser(ctx, user, reason) {
  const ban = await ctx.guild.bans.fetch(user.id).catch(() => null);
  if (!ban) return { ok: false, message: t('moderation.unban.notBanned') };

  try {
    await ctx.guild.members.unban(user.id, auditReason(ctx.user, reason));
  } catch {
    return { ok: false, message: t('moderation.unban.failed') };
  }

  await logModAction(
    ctx.guild,
    modLogEmbed({ action: t('moderation.unban.logAction'), target: user, moderator: ctx.user, reason }),
  );
  return { ok: true, message: t('moderation.unban.success', { user: user.tag }) };
}

module.exports = { banUser, unbanUser };
