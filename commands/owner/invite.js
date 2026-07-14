/**
 * Commande invite : génère une invitation vers un serveur où le bot est
 * présent — réservée aux owners. Cherche automatiquement un salon textuel
 * où le bot possède la permission « Créer une invitation ».
 */
const { PermissionFlagsBits } = require('discord.js');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'invite',
  ownerOnly: true,
  description: "Génère une invitation vers un serveur du bot (réservé aux owners)",
  usage: 'invite <id_serveur>',
  examples: ['invite 123456789012345678'],
  aliases: [],
  cooldown: 5,
  args: [
    { name: 'serveur', type: 'string', required: true, description: 'Identifiant du serveur' },
  ],
  async execute(ctx) {
    const guildId = ctx.options.serveur.trim();
    const guild = ctx.client.guilds.cache.get(guildId);
    if (!guild) {
      return ctx.reply({
        embeds: [errorEmbed(t('owners.invite.notFound', { id: guildId }))],
        ephemeral: true,
      });
    }

    const me = guild.members.me;
    const channel = guild.channels.cache
      .filter(
        (c) =>
          c.isTextBased() &&
          !c.isThread() &&
          me.permissionsIn(c).has(PermissionFlagsBits.CreateInstantInvite),
      )
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .first();
    if (!channel) {
      return ctx.reply({
        embeds: [errorEmbed(t('owners.invite.noChannel', { guild: guild.name }))],
        ephemeral: true,
      });
    }

    const invite = await channel
      .createInvite({
        maxAge: 86400,
        unique: true,
        reason: `Invitation demandée par ${ctx.user.tag} (owner du bot)`,
      })
      .catch(() => null);
    if (!invite) {
      return ctx.reply({
        embeds: [errorEmbed(t('owners.invite.failed', { guild: guild.name }))],
        ephemeral: true,
      });
    }

    const embed = infoEmbed(
      t('owners.invite.title', { guild: guild.name }),
      t('owners.invite.success', { channel: channel.name, url: invite.url }),
    );
    const icon = guild.iconURL();
    if (icon) embed.setThumbnail(icon);
    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
};
