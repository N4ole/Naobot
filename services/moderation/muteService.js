/**
 * Logique métier du mute par rôle (mute / unmute), partagée par les commandes
 * slash et préfixées.
 *
 * Différence avec le timeout natif : le mute par rôle est illimité dans le
 * temps (jusqu'à unmute), alors que le timeout Discord est plafonné à
 * 28 jours. Pour une sanction temporaire, préférer la commande timeout,
 * qui s'appuie sur le mécanisme natif de Discord.
 */
const { PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config');
const { checkTargetHierarchy } = require('../../middlewares/permissions/checkPermissions');
const { logModAction } = require('../logging/modLogService');
const { modLogEmbed } = require('../../utils/embeds/embeds');
const { auditReason, dmUser } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

/** Permissions retirées par le rôle de mute dans chaque salon. */
const MUTED_OVERWRITES = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
  Speak: false,
};

/**
 * Récupère le rôle de mute, en le créant (et en configurant les salons)
 * s'il n'existe pas encore.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').Role|null>}
 */
async function ensureMutedRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === config.mutedRoleName);
  if (role) return role;

  role = await guild.roles
    .create({
      name: config.mutedRoleName,
      permissions: [],
      reason: 'Création automatique du rôle de mute',
    })
    .catch(() => null);
  if (!role) return null;

  for (const channel of guild.channels.cache.values()) {
    if (!channel.permissionOverwrites) continue;
    if (!guild.members.me.permissionsIn(channel).has(PermissionFlagsBits.ManageRoles)) continue;
    await channel.permissionOverwrites
      .edit(role, MUTED_OVERWRITES, { reason: 'Configuration du rôle de mute' })
      .catch(() => null);
  }
  return role;
}

/**
 * Rend un membre muet (attribution du rôle de mute).
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {import('discord.js').GuildMember} member
 * @param {string} reason
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function muteMember(ctx, member, reason) {
  const hierarchy = checkTargetHierarchy(ctx, member);
  if (!hierarchy.ok) return { ok: false, message: hierarchy.error };

  const role = await ensureMutedRole(ctx.guild);
  if (!role) return { ok: false, message: t('moderation.mute.roleFailed') };
  if (member.roles.cache.has(role.id)) return { ok: false, message: t('moderation.mute.alreadyMuted') };

  try {
    await member.roles.add(role, auditReason(ctx.user, reason));
  } catch {
    return { ok: false, message: t('moderation.mute.roleFailed') };
  }

  await dmUser(member.user, t('moderation.dm.mute', { guild: ctx.guild.name, reason }));
  await logModAction(
    ctx.guild,
    modLogEmbed({ action: t('moderation.mute.logAction'), target: member.user, moderator: ctx.user, reason }),
  );
  return { ok: true, message: t('moderation.mute.success', { user: member.user.tag, reason }) };
}

/**
 * Redonne la parole à un membre (retrait du rôle de mute).
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {import('discord.js').GuildMember} member
 * @param {string} reason
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function unmuteMember(ctx, member, reason) {
  const role = ctx.guild.roles.cache.find((r) => r.name === config.mutedRoleName);
  if (!role || !member.roles.cache.has(role.id)) {
    return { ok: false, message: t('moderation.unmute.notMuted') };
  }

  try {
    await member.roles.remove(role, auditReason(ctx.user, reason));
  } catch {
    return { ok: false, message: t('moderation.unmute.failed') };
  }

  await dmUser(member.user, t('moderation.dm.unmute', { guild: ctx.guild.name }));
  await logModAction(
    ctx.guild,
    modLogEmbed({ action: t('moderation.unmute.logAction'), target: member.user, moderator: ctx.user, reason }),
  );
  return { ok: true, message: t('moderation.unmute.success', { user: member.user.tag }) };
}

module.exports = { muteMember, unmuteMember, ensureMutedRole };
