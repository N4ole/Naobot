/**
 * Commande invite :
 * - sans argument : lien d'invitation du bot (accessible à tous), avec les
 *   permissions requises pré-cochées et un bouton ;
 * - avec un identifiant de serveur (owners uniquement) : génère une
 *   invitation vers ce serveur du bot, en cherchant automatiquement un
 *   salon où c'est possible.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  OAuth2Scopes,
  PermissionFlagsBits,
  PermissionsBitField,
} = require('discord.js');
const config = require('../../config/config');
const permissionsConfig = require('../../config/permissions');
const { checkOwner } = require('../../middlewares/permissions/ownerCheck');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { findInvitableChannel } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

/**
 * Permissions demandées dans le lien d'invitation du bot.
 * Source unique : `config/permissions.js` — la liste doit rester l'union
 * exacte de ce que les commandes et les fonctionnalités utilisent vraiment
 * (vérifié par `tests/permissionsLeastPrivilege.test.js`).
 */
const BOT_INVITE_PERMISSIONS = new PermissionsBitField(permissionsConfig.INVITE_PERMISSIONS);

function botInviteReply(ctx) {
  const url = ctx.client.generateInvite({
    scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
    permissions: BOT_INVITE_PERMISSIONS,
  });
  const embed = infoEmbed(
    t('info.inviteTitle', { bot: ctx.client.user.username }),
    t('info.inviteDescription', { bot: ctx.client.user.username }),
  ).setThumbnail(ctx.client.user.displayAvatarURL());
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(t('info.inviteButton')),
  );
  return ctx.reply({ embeds: [embed], components: [buttons] });
}

async function guildInviteReply(ctx, guildId) {
  const owner = checkOwner(ctx.user.id);
  if (!owner.ok) {
    return ctx.reply({ embeds: [errorEmbed(owner.error)], ephemeral: true });
  }

  const guild = ctx.client.guilds.cache.get(guildId);
  if (!guild) {
    return ctx.reply({
      embeds: [errorEmbed(t('owners.invite.notFound', { id: guildId }))],
      ephemeral: true,
    });
  }

  const channel = findInvitableChannel(guild);
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
}

module.exports = {
  name: 'invite',
  description: "Lien d'invitation du bot ; avec un ID de serveur (owners) : invitation vers ce serveur",
  usage: 'invite [id_serveur]',
  examples: ['invite', 'invite 123456789012345678'],
  aliases: [],
  cooldown: 5,
  args: [
    {
      name: 'serveur',
      type: 'string',
      required: false,
      description: '(Owners) Identifiant d\'un serveur du bot',
    },
  ],
  async execute(ctx) {
    const guildId = ctx.options.serveur?.trim();
    if (!guildId) return botInviteReply(ctx);
    return guildInviteReply(ctx, guildId);
  },
};
