/**
 * Commande setwarnrole : liaison des paliers de warn à des rôles automatiques.
 *
 *   setwarnrole                    → liste des associations (palier → rôle)
 *   setwarnrole <palier> <rôle>    → associe / modifie le rôle d'un palier
 *   setwarnrole <palier>           → supprime l'association d'un palier
 *   setwarnrole sync               → resynchronise immédiatement le serveur
 *
 * Réservée aux administrateurs (config/permissions.js). La logique vit dans
 * services/warnings/warnRoleService ; les changements sont journalisés.
 */
const { PermissionFlagsBits } = require('discord.js');
const warnRoleService = require('../../services/warnings/warnRoleService');
const logService = require('../../services/logs/logService');
const { successEmbed, errorEmbed, infoEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

function mappingEmbed(guild) {
  const mapping = warnRoleService.getMapping(guild.id);
  const levels = warnRoleService.sortedLevels(mapping);
  const body = levels.length
    ? levels.map((level) => t('warns.roles.line', { level, role: `<@&${mapping[level]}>` })).join('\n')
    : t('warns.roles.empty');
  return infoEmbed(t('warns.roles.title'), `${t('warns.roles.description')}\n\n${body}`);
}

function logChange(guild, moderator, detail) {
  return logService.log(
    guild,
    'warns',
    logEventEmbed({
      title: `📛 ${t('warns.logs.roleConfig')}`,
      color: COLORS.LOG_UPDATE,
      user: moderator,
      fields: [{ name: t('warns.field.change'), value: detail }],
    }),
  );
}

module.exports = {
  name: 'setwarnrole',
  description: 'Associe un rôle automatique à chaque palier de warn',
  usage: 'setwarnrole [palier] [rôle] | setwarnrole sync',
  examples: ['setwarnrole', 'setwarnrole 1 @Warn 1', 'setwarnrole 3 @Warn 3', 'setwarnrole 2', 'setwarnrole sync'],
  aliases: ['warnrole'],
  cooldown: 3,
  args: [
    { name: 'palier', type: 'string', required: false, description: 'Numéro du palier (≥ 1), ou « sync »' },
    { name: 'role', type: 'role', required: false, description: 'Le rôle à associer (omis = supprime l’association)' },
  ],
  async execute(ctx) {
    const raw = ctx.options.palier?.trim();

    // Aucun argument → liste des associations.
    if (!raw) return ctx.reply({ embeds: [mappingEmbed(ctx.guild)] });

    // Resynchronisation manuelle immédiate.
    if (raw.toLowerCase() === 'sync') {
      await ctx.defer();
      const corrected = await warnRoleService.syncGuild(ctx.guild);
      return ctx.reply({ embeds: [successEmbed(t('warns.roles.synced', { count: corrected }))] });
    }

    const level = Number.parseInt(raw, 10);
    if (!Number.isInteger(level) || level < 1) {
      return ctx.reply({ embeds: [errorEmbed(t('warns.roles.invalidLevel'))], ephemeral: true });
    }

    const role = ctx.options.role;

    // Palier sans rôle → suppression de l'association.
    if (!role) {
      const removed = warnRoleService.removeRole(ctx.guild.id, level);
      if (!removed) return ctx.reply({ embeds: [errorEmbed(t('warns.roles.notSet', { level }))], ephemeral: true });
      await logChange(ctx.guild, ctx.user, t('warns.roles.logRemoved', { level }));
      return ctx.reply({ embeds: [successEmbed(t('warns.roles.removed', { level }))] });
    }

    // Vérifications : rôle gérable par le bot, non @everyone, non géré.
    if (role.id === ctx.guild.roles.everyone.id || role.managed) {
      return ctx.reply({ embeds: [errorEmbed(t('warns.roles.invalidRole'))], ephemeral: true });
    }
    const me = ctx.guild.members.me;
    if (me && role.position >= me.roles.highest.position) {
      return ctx.reply({ embeds: [errorEmbed(t('warns.roles.roleTooHigh', { role: `${role}` }))], ephemeral: true });
    }
    if (me && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return ctx.reply({ embeds: [errorEmbed(t('warns.roles.botMissingPerm'))], ephemeral: true });
    }

    warnRoleService.setRole(ctx.guild.id, level, role.id);
    await logChange(ctx.guild, ctx.user, t('warns.roles.logSet', { level, role: role.name }));
    return ctx.reply({ embeds: [successEmbed(t('warns.roles.set', { level, role: `${role}` })), mappingEmbed(ctx.guild)] });
  },
};
