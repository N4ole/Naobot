/**
 * Commande leave : force le départ du bot d'un serveur — réservée aux
 * owners. Affiche d'abord un embed de confirmation (informations et
 * statistiques du serveur) avec boutons Confirmer / Annuler, utilisables
 * uniquement par l'owner ayant lancé la commande.
 * La logique métier vit dans services/serverManagement.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { checkOwner } = require('../../middlewares/permissions/ownerCheck');
const serverManagementService = require('../../services/serverManagement/serverManagementService');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const GUILD_ID_PATTERN = /^\d{17,20}$/;

function confirmationRow(userId, guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`leave:confirm:${userId}:${guildId}`)
      .setLabel(t('serverManagement.leave.confirm'))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`leave:cancel:${userId}:${guildId}`)
      .setLabel(t('serverManagement.leave.cancel'))
      .setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  name: 'leave',
  ownerOnly: true,
  description: "Force le départ du bot d'un serveur, avec confirmation (réservé aux owners)",
  usage: 'leave <id_serveur>',
  examples: ['leave 123456789012345678'],
  aliases: [],
  cooldown: 5,
  args: [
    { name: 'serveur', type: 'string', required: true, description: 'Identifiant du serveur à quitter' },
  ],
  async execute(ctx) {
    const guildId = ctx.options.serveur.trim();
    const guild = GUILD_ID_PATTERN.test(guildId) ? ctx.client.guilds.cache.get(guildId) : null;
    if (!guild) {
      return ctx.reply({
        embeds: [errorEmbed(t('serverManagement.leave.notFound', { id: guildId }))],
        ephemeral: true,
      });
    }

    await ctx.defer();
    const embed = infoEmbed(
      t('serverManagement.leave.confirmTitle'),
      t('serverManagement.leave.confirmDescription', { name: guild.name, id: guild.id }),
    ).addFields(await serverManagementService.buildServerSummaryFields(guild));
    const icon = guild.iconURL();
    if (icon) embed.setThumbnail(icon);

    return ctx.reply({ embeds: [embed], components: [confirmationRow(ctx.user.id, guild.id)] });
  },

  /**
   * Boutons de confirmation (customId "leave:<action>:<userId>:<guildId>").
   * Réservés à l'owner ayant lancé la commande.
   */
  async handleComponent(interaction) {
    if (!interaction.isButton()) return;
    const [, action, requesterId, guildId] = interaction.customId.split(':');
    if (!['confirm', 'cancel'].includes(action)) return;

    const owner = checkOwner(interaction.user.id);
    if (!owner.ok || interaction.user.id !== requesterId) {
      return interaction.reply({
        embeds: [errorEmbed(t('serverManagement.leave.notYourSession'))],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'cancel') {
      return interaction.update({
        embeds: [infoEmbed(t('serverManagement.leave.confirmTitle'), t('serverManagement.leave.cancelled'))],
        components: [],
      });
    }

    await interaction.deferUpdate();
    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) {
      return interaction.editReply({
        embeds: [errorEmbed(t('serverManagement.leave.notFound', { id: guildId }))],
        components: [],
      });
    }

    const name = guild.name;
    const result = await serverManagementService.leaveServer(guild, interaction.user);
    return interaction.editReply({
      embeds: [
        result.ok
          ? successEmbed(t('serverManagement.leave.done', { name, id: guildId }))
          : errorEmbed(t('serverManagement.leave.failed')),
      ],
      components: [],
    });
  },
};
