/**
 * Commande bumpenable : active ou désactive le système de bump du serveur.
 * À l'activation, le salon de réception se choisit via un sélecteur de
 * salons Discord natif (ChannelSelectMenu). La logique métier vit dans
 * services/bump/bumpService.
 */
const {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const config = require('../../config/config');
const permissionsConfig = require('../../config/permissions');
const bumpService = require('../../services/bump/bumpService');
const permissionLabels = require('../../utils/constants/permissionLabels');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

function channelSelectRow(currentChannelId) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId('bumpenable:channel')
    .setPlaceholder(t('bump.enable.channelPlaceholder'))
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1);
  if (currentChannelId) {
    try {
      select.setDefaultChannels(currentChannelId);
    } catch {
      // Version de discord.js sans valeurs par défaut : sélecteur vide.
    }
  }
  return new ActionRowBuilder().addComponents(select);
}

const bumpenable = {
  name: 'bumpenable',
  description: 'Active ou désactive le système de bump du serveur',
  usage: 'bumpenable <on|off>',
  examples: ['bumpenable on', 'bumpenable off'],
  aliases: [],
  cooldown: 3,
  args: [
    {
      name: 'etat',
      type: 'string',
      required: true,
      choices: ['on', 'off'],
      description: 'on : activer et choisir le salon de réception ; off : désactiver',
    },
  ],
  async execute(ctx) {
    const state = ctx.options.etat.toLowerCase();
    if (state !== 'on' && state !== 'off') {
      return ctx.reply({
        embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}${bumpenable.usage}` }))],
        ephemeral: true,
      });
    }

    if (state === 'off') {
      await bumpService.setEnabled(ctx.guild, false, ctx.user);
      return ctx.reply({ embeds: [successEmbed(t('bump.enable.disabled'))] });
    }

    await bumpService.setEnabled(ctx.guild, true, ctx.user);
    const current = bumpService.getGuildConfig(ctx.guild.id);
    return ctx.reply({
      embeds: [infoEmbed(t('bump.enable.enabledTitle'), t('bump.enable.enabledDescription'))],
      components: [channelSelectRow(current.channelId)],
    });
  },

  /** Sélecteur de salon (customId "bumpenable:channel") — Gérer le serveur requis. */
  async handleComponent(interaction) {
    if (!interaction.inCachedGuild() || !interaction.isChannelSelectMenu()) return;

    const requiredPerms = permissionsConfig[bumpenable.name]?.user ?? [];
    if (!interaction.member.permissions.has(requiredPerms)) {
      return interaction.reply({
        embeds: [errorEmbed(t('bump.enable.noPermission'))],
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.channels.first();
    if (!channel) return;

    // Le salon doit être lisible/écrivable et permettre les invitations.
    const needed = [...bumpService.CHANNEL_PERMISSIONS, PermissionFlagsBits.CreateInstantInvite];
    const missing = interaction.guild.members.me.permissionsIn(channel).missing(needed);
    if (missing.length > 0) {
      return interaction.reply({
        embeds: [
          errorEmbed(
            t('bump.enable.channelMissingPerms', {
              channel: `${channel}`,
              perms: missing.map((name) => permissionLabels[name] ?? name).join(', '),
            }),
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await bumpService.setChannel(interaction.guild, channel, interaction.user);
    return interaction.update({
      embeds: [successEmbed(t('bump.enable.channelSet', { channel: `${channel}` }))],
      components: [],
    });
  },
};

module.exports = bumpenable;
