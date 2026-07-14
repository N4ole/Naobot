/**
 * Logique métier des avertissements, partagée par les commandes slash et
 * préfixées. Les avertissements sont persistés via database/warnRepository.
 */
const warnRepository = require('../../database/warnRepository');
const { checkTargetHierarchy } = require('../../middlewares/permissions/checkPermissions');
const { logModAction } = require('../logging/modLogService');
const { modLogEmbed } = require('../../utils/embeds/embeds');
const { dmUser } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

/**
 * Ajoute un avertissement à un membre.
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {import('discord.js').GuildMember} member
 * @param {string} reason
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function warnMember(ctx, member, reason) {
  const hierarchy = checkTargetHierarchy(ctx, member);
  if (!hierarchy.ok) return { ok: false, message: hierarchy.error };

  const { total } = warnRepository.addWarn(ctx.guild.id, member.id, ctx.user.id, reason);

  await dmUser(member.user, t('moderation.dm.warn', { guild: ctx.guild.name, reason }));
  await logModAction(
    ctx.guild,
    modLogEmbed({
      action: t('moderation.warn.logAction'),
      target: member.user,
      moderator: ctx.user,
      reason,
      extraFields: [{ name: t('common.warnCount'), value: String(total), inline: true }],
    }),
  );
  return {
    ok: true,
    message: t('moderation.warn.success', { user: member.user.tag, count: total, reason }),
  };
}

/**
 * Liste les avertissements d'un membre.
 * @param {string} guildId
 * @param {string} userId
 * @returns {object[]}
 */
function getWarnings(guildId, userId) {
  return warnRepository.getWarns(guildId, userId);
}

module.exports = { warnMember, getWarnings };
