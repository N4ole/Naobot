/**
 * Commande roleinfo : informations détaillées sur un rôle du serveur.
 */
const { PermissionFlagsBits } = require('discord.js');
const permissionLabels = require('../../utils/constants/permissionLabels');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

/** Permissions mises en avant dans l'embed (les plus sensibles). */
const KEY_PERMISSIONS = [
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'ManageMessages',
  'BanMembers',
  'KickMembers',
  'ModerateMembers',
  'MentionEveryone',
];

module.exports = {
  name: 'roleinfo',
  description: "Affiche les informations d'un rôle",
  usage: 'roleinfo <rôle>',
  examples: ['roleinfo @Modérateur', 'roleinfo 123456789012345678'],
  aliases: ['ri'],
  cooldown: 5,
  args: [
    { name: 'role', type: 'role', required: true, description: 'Le rôle à consulter (mention, identifiant ou nom)' },
  ],
  async execute(ctx) {
    const role = ctx.options.role;

    const keyPerms = role.permissions.has(PermissionFlagsBits.Administrator)
      ? [permissionLabels.Administrator]
      : role.permissions
          .toArray()
          .filter((name) => KEY_PERMISSIONS.includes(name))
          .map((name) => permissionLabels[name] ?? name);

    const embed = infoEmbed(role.name, `${role}`)
      .setColor(role.color || undefined)
      .addFields(
        { name: t('info.id'), value: `\`${role.id}\``, inline: true },
        { name: t('info.color'), value: role.hexColor, inline: true },
        { name: t('info.position'), value: String(role.position), inline: true },
        { name: t('info.membersWithRole'), value: String(role.members.size), inline: true },
        { name: t('info.mentionable'), value: role.mentionable ? t('info.yes') : t('info.no'), inline: true },
        { name: t('info.hoisted'), value: role.hoist ? t('info.yes') : t('info.no'), inline: true },
        {
          name: t('info.created'),
          value: `<t:${Math.floor(role.createdTimestamp / 1000)}:D>`,
          inline: true,
        },
        {
          name: t('info.keyPermissions'),
          value: keyPerms.length > 0 ? keyPerms.join(', ') : t('help.none'),
        },
      );
    return ctx.reply({ embeds: [embed] });
  },
};
