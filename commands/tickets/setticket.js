/**
 * Commande setticket : publie le panneau d'un type de ticket dans un salon
 * et persiste la configuration du serveur. La logique métier vit dans
 * services/tickets/ticketService.
 */
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const ticketTypes = require('../../utils/constants/ticketTypes');
const ticketService = require('../../services/tickets/ticketService');
const permissionLabels = require('../../utils/constants/permissionLabels');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

/** Permissions minimales du bot dans le salon du panneau. */
const PANEL_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

function validTypeList() {
  return Object.keys(ticketTypes).map((key) => `\`${key}\``).join(', ');
}

module.exports = {
  name: 'setticket',
  description: 'Publie le panneau de création de tickets d’un type dans un salon',
  usage: 'setticket <salon> <type>',
  examples: ['setticket #support assistance', 'setticket #signalements signalement'],
  aliases: [],
  cooldown: 5,
  args: [
    { name: 'salon', type: 'channel', required: true, description: 'Le salon où publier le panneau' },
    {
      name: 'type',
      type: 'string',
      required: true,
      choices: Object.keys(ticketTypes),
      description: 'Le type de tickets (assistance, questions, report, signalement)',
    },
  ],
  async execute(ctx) {
    const channel = ctx.options.salon;
    const type = ctx.options.type.toLowerCase();

    if (!ticketService.isValidType(type)) {
      return ctx.reply({
        embeds: [errorEmbed(t('tickets.errors.unknownType', { type, types: validTypeList() }))],
        ephemeral: true,
      });
    }
    if (channel.type !== ChannelType.GuildText) {
      return ctx.reply({ embeds: [errorEmbed(t('tickets.errors.invalidChannel'))], ephemeral: true });
    }

    const missing = ctx.guild.members.me.permissionsIn(channel).missing(PANEL_CHANNEL_PERMISSIONS);
    if (missing.length > 0) {
      return ctx.reply({
        embeds: [
          errorEmbed(
            t('tickets.errors.botMissingPerms', {
              channel: `${channel}`,
              perms: missing.map((name) => permissionLabels[name] ?? name).join(', '),
            }),
          ),
        ],
        ephemeral: true,
      });
    }

    // Création de la catégorie + publication du panneau : peut dépasser 3 s.
    await ctx.defer();
    await ticketService.setupPanel(ctx.guild, channel, type, ctx.user);
    return ctx.reply({
      embeds: [
        successEmbed(
          t('tickets.panel.configured', { type: ticketTypes[type].label, channel: `${channel}` }),
        ),
      ],
    });
  },
};
