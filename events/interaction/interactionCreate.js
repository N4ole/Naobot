/**
 * Point d'entrée des commandes slash.
 * Résout les options selon le schéma de la commande, construit le
 * CommandContext unifié puis délègue au pipeline commun (commandExecutor) :
 * la logique métier est ainsi strictement identique à celle des commandes
 * préfixées.
 */
const { Events, MessageFlags } = require('discord.js');
const { CommandContext } = require('../../utils/helpers/commandContext');
const { resolveSlashOptions } = require('../../utils/helpers/argumentParser');
const { executeCommand } = require('../../utils/helpers/commandExecutor');
const { errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Composants interactifs (boutons, menus, modals…) : le préfixe du
    // customId ("logs:...") désigne la commande propriétaire, qui expose
    // handleComponent(interaction). Aucun registre central à maintenir.
    if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
      const [ownerName] = interaction.customId.split(':');
      const owner = interaction.client.commands.get(ownerName);
      if (owner?.handleComponent) {
        try {
          await owner.handleComponent(interaction);
        } catch (error) {
          console.error(`[components] Erreur dans "${interaction.customId}" :`, error);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    if (!interaction.inCachedGuild()) {
      return interaction.reply({
        embeds: [errorEmbed(t('errors.guildOnly'))],
        flags: MessageFlags.Ephemeral,
      });
    }

    const resolved = resolveSlashOptions(interaction, command);
    if (resolved.error) {
      return interaction.reply({
        embeds: [errorEmbed(resolved.error)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const ctx = new CommandContext({
      client: interaction.client,
      guild: interaction.guild,
      channel: interaction.channel,
      member: interaction.member,
      user: interaction.user,
      options: resolved.values,
      interaction,
    });
    await executeCommand(ctx, command);
  },
};
