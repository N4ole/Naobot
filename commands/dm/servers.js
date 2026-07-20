/**
 * Commande servers : affiche les serveurs que vous partagez avec le bot et
 * mémorise le **serveur actif** (utile en messages privés pour les commandes
 * qui nécessitent un serveur). Utilisable partout, y compris en DM
 * (`dm: 'direct'`).
 *
 * Le menu déroulant (customId « servers:pick:<userId> ») est aussi présenté par
 * les points d'entrée DM lorsqu'une commande nécessite un serveur ; sa
 * sélection est routée ici via handleComponent.
 */
const { MessageFlags } = require('discord.js');
const dmService = require('../../services/directMessages/dmService');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'servers',
  description: 'Affiche vos serveurs et mémorise le serveur actif (utile en DM)',
  usage: 'servers',
  examples: ['servers'],
  // « serveurs » n'est pas un alias ici : c'est déjà le nom de la commande
  // owner de liste des serveurs du bot (commands/owner/serveurs.js).
  aliases: ['serveur'],
  cooldown: 5,
  dm: 'direct',
  args: [],
  async execute(ctx) {
    const picker = dmService.buildServerPicker(ctx.client, ctx.user.id);
    if (!picker) {
      return ctx.reply({ embeds: [infoEmbed(t('dm.serversTitle'), t('dm.noServers'))], ephemeral: true });
    }
    return ctx.reply({ embeds: [infoEmbed(t('dm.serversTitle'), t('dm.serversHelp'))], components: [picker] });
  },

  /** Sélection d'un serveur (customId « servers:pick:<userId> »). */
  async handleComponent(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    const [, kind, userId] = interaction.customId.split(':');
    if (kind !== 'pick') return;
    if (interaction.user.id !== userId) {
      return interaction.reply({ embeds: [errorEmbed(t('dm.notYours'))], flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.values[0];
    dmService.setLastGuild(userId, guildId);
    const guild = interaction.client.guilds.cache.get(guildId);
    return interaction.update({
      embeds: [successEmbed(t('dm.selected', { server: guild?.name ?? guildId }))],
      components: [],
    });
  },
};
