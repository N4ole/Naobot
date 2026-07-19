/**
 * Point d'entrée des commandes **préfixées en messages privés** (DM).
 *
 * Le préfixe par défaut du code s'applique en DM (aucun serveur, donc aucun
 * préfixe personnalisé). Les commandes déclarant `dm: 'direct'` (personnelles :
 * aide, rappels, réputation globale…) sont exécutées directement ; les autres
 * nécessitent un serveur : le bot l'explique et propose une sélection de
 * serveur (menu déroulant des serveurs partagés).
 *
 * Les commandes en serveur restent gérées par events/message/messageCreate ;
 * cet écouteur ne traite que les DM.
 */
const { Events } = require('discord.js');
const config = require('../../config/config');
const { CommandContext } = require('../../utils/helpers/commandContext');
const { resolvePrefixArgs } = require('../../utils/helpers/argumentParser');
const { executeCommand } = require('../../utils/helpers/commandExecutor');
const dmService = require('../../services/directMessages/dmService');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Uniquement les messages privés (les serveurs sont gérés ailleurs).
    if (message.author?.bot || message.inGuild()) return;
    if (!message.content?.startsWith(config.prefix)) return;

    const [rawName, ...tokens] = message.content.slice(config.prefix.length).trim().split(/\s+/);
    if (!rawName) return;

    const { client } = message;
    const name = rawName.toLowerCase();
    const command = client.commands.get(name) ?? client.commands.get(client.commandAliases.get(name));
    if (!command) return;

    // Commande nécessitant un serveur : on explique et on propose la sélection.
    if (!dmService.isDirect(command)) {
      const picker = dmService.buildServerPicker(client, message.author.id);
      return message
        .reply({
          embeds: [infoEmbed(t('dm.guildOnlyTitle'), t('dm.guildOnly', { command: command.name }))],
          components: picker ? [picker] : [],
          allowedMentions: { repliedUser: false },
        })
        .catch(() => null);
    }

    const resolved = await resolvePrefixArgs({ guild: null, client }, command, tokens);
    if (resolved.error) {
      return message.reply({ embeds: [errorEmbed(resolved.error)], allowedMentions: { repliedUser: false } }).catch(() => null);
    }

    const ctx = new CommandContext({
      client,
      guild: null,
      channel: message.channel,
      member: null,
      user: message.author,
      options: resolved.values,
      message,
    });
    await executeCommand(ctx, command);
  },
};
