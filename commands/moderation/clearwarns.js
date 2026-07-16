/**
 * Commande clearwarns : supprime tous les avertissements d'un membre, après
 * confirmation par boutons. La logique métier vit dans
 * services/warnings/warnService.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const warnService = require('../../services/warnings/warnService');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

function confirmRow(userId, targetId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`clearwarns:confirm:${userId}:${targetId}`)
      .setLabel(t('warns.command.clearConfirmButton'))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`clearwarns:cancel:${userId}:${targetId}`)
      .setLabel(t('warns.command.clearCancelButton'))
      .setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  name: 'clearwarns',
  description: "Supprime tous les avertissements d'un membre (avec confirmation)",
  usage: 'clearwarns <utilisateur>',
  examples: ['clearwarns @Utilisateur'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'utilisateur', type: 'user', required: true, description: 'Le membre dont effacer les avertissements' },
  ],
  async execute(ctx) {
    const user = ctx.options.utilisateur;
    const count = warnService.countWarns(ctx.guild.id, user.id);
    if (count === 0) {
      return ctx.reply({ embeds: [errorEmbed(t('warns.command.none', { user: user.tag }))], ephemeral: true });
    }
    return ctx.reply({
      embeds: [infoEmbed(t('warns.command.clearTitle'), t('warns.command.clearConfirm', { user: user.tag, count }))],
      components: [confirmRow(ctx.user.id, user.id)],
    });
  },

  /** Boutons de confirmation (customId "clearwarns:<action>:<userId>:<targetId>"). */
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const [, action, requesterId, targetId] = interaction.customId.split(':');
    if (!['confirm', 'cancel'].includes(action)) return;

    if (interaction.user.id !== requesterId) {
      return interaction.reply({
        embeds: [errorEmbed(t('warns.errors.notYourSession'))],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'cancel') {
      return interaction.update({
        embeds: [infoEmbed(t('warns.command.clearTitle'), t('warns.command.clearCancelled'))],
        components: [],
      });
    }

    const user = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!user) {
      return interaction.update({ embeds: [errorEmbed(t('errors.userNotFound'))], components: [] });
    }
    const result = await warnService.clearWarns(interaction.guild, user, interaction.user);
    return interaction.update({
      embeds: [
        result.ok
          ? successEmbed(t('warns.command.cleared', { user: user.tag, count: result.count }))
          : errorEmbed(t('warns.command.none', { user: user.tag })),
      ],
      components: [],
    });
  },
};
