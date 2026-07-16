/**
 * Commandes watch / stopwatch (même famille, même fichier) : démarrage et
 * arrêt manuel d'une surveillance de modération.
 *
 * Accès : administrateurs, modérateurs (Modérer les membres) ou owners du
 * bot — contrôlé par middlewares/watch/watchAccess. Avant toute activation,
 * un avertissement légal (RGPD / usage modération / durée limitée /
 * responsabilité) est affiché et l'action doit être confirmée par un bouton.
 * La logique métier vit dans services/watch/watchService.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const watchService = require('../../services/watch/watchService');
const { checkWatchAccess } = require('../../middlewares/watch/watchAccess');
const { checkTargetHierarchy } = require('../../middlewares/permissions/checkPermissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

function confirmRow(userId, targetId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`watch:confirm:${userId}:${targetId}`)
      .setLabel(t('watch.warning.confirmButton'))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`watch:cancel:${userId}:${targetId}`)
      .setLabel(t('watch.warning.cancelButton'))
      .setStyle(ButtonStyle.Secondary),
  );
}

const watch = {
  name: 'watch',
  description: 'Surveille un membre à des fins de modération (7 jours max)',
  usage: 'watch <utilisateur>',
  examples: ['watch @Utilisateur'],
  aliases: [],
  cooldown: 5,
  args: [
    { name: 'membre', type: 'member', required: true, description: 'Le membre à surveiller' },
  ],
  async execute(ctx) {
    const access = checkWatchAccess(ctx.member);
    if (!access.ok) {
      return ctx.reply({ embeds: [errorEmbed(access.error)], ephemeral: true });
    }

    const target = ctx.options.membre;
    if (target.id === ctx.user.id || target.user.bot) {
      return ctx.reply({ embeds: [errorEmbed(t('watch.errors.invalidTarget'))], ephemeral: true });
    }
    // On ne surveille pas un membre d'un rang supérieur ou égal (hiérarchie).
    const hierarchy = checkTargetHierarchy(ctx, target);
    if (!hierarchy.ok) {
      return ctx.reply({ embeds: [errorEmbed(hierarchy.error)], ephemeral: true });
    }

    // Avertissement obligatoire + confirmation avant toute activation.
    return ctx.reply({
      embeds: [watchService.buildWarningEmbed(target.user.tag)],
      components: [confirmRow(ctx.user.id, target.id)],
      ephemeral: true,
    });
  },

  /** Boutons d'avertissement (customId "watch:<action>:<userId>:<targetId>"). */
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const [, action, requesterId, targetId] = interaction.customId.split(':');
    if (!['confirm', 'cancel'].includes(action)) return;

    const access = checkWatchAccess(interaction.member);
    if (!access.ok || interaction.user.id !== requesterId) {
      return interaction.reply({
        embeds: [errorEmbed(t('watch.errors.notYourSession'))],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'cancel') {
      return interaction.update({ embeds: [successEmbed(t('watch.warning.cancelled'))], components: [] });
    }

    await interaction.deferUpdate();
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return interaction.editReply({ embeds: [errorEmbed(t('errors.memberNotFound'))], components: [] });
    }

    const result = await watchService.startWatch(interaction.guild, targetMember, interaction.user);
    if (!result.ok) {
      return interaction.editReply({ embeds: [errorEmbed(t('watch.errors.channelFailed'))], components: [] });
    }
    const key = result.resumed ? 'watch.command.resumed' : 'watch.command.started';
    return interaction.editReply({
      embeds: [
        successEmbed(
          t(key, {
            user: `${targetMember}`,
            channel: `${result.channel}`,
            expires: `<t:${Math.floor(result.expiresAt / 1000)}:R>`,
          }),
        ),
      ],
      components: [],
    });
  },
};

const stopwatch = {
  name: 'stopwatch',
  description: 'Arrête la surveillance d’un membre (salon et historique conservés)',
  usage: 'stopwatch <utilisateur>',
  examples: ['stopwatch @Utilisateur'],
  aliases: [],
  cooldown: 5,
  args: [
    { name: 'membre', type: 'user', required: true, description: 'Le membre dont arrêter la surveillance' },
  ],
  async execute(ctx) {
    const access = checkWatchAccess(ctx.member);
    if (!access.ok) {
      return ctx.reply({ embeds: [errorEmbed(access.error)], ephemeral: true });
    }

    const target = ctx.options.membre;
    const result = await watchService.finishWatch(ctx.guild, target.id, 'manual', ctx.user);
    if (!result.ok) {
      return ctx.reply({ embeds: [errorEmbed(t('watch.errors.notWatched'))], ephemeral: true });
    }
    return ctx.reply({ embeds: [successEmbed(t('watch.command.stopped', { user: target.tag }))] });
  },
};

module.exports = [watch, stopwatch];
