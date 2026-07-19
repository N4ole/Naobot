/**
 * Point d'entrée des commandes préfixées (!commande).
 * Analyse le message, résout les arguments selon le schéma de la commande,
 * construit le CommandContext unifié puis délègue au pipeline commun
 * (commandExecutor) : la logique métier est ainsi strictement identique à
 * celle des commandes slash.
 */
const { Events } = require('discord.js');
const { CommandContext } = require('../../utils/helpers/commandContext');
const { resolvePrefixArgs } = require('../../utils/helpers/argumentParser');
const { executeCommand } = require('../../utils/helpers/commandExecutor');
const prefixService = require('../../services/prefix/prefixService');
const { errorEmbed } = require('../../utils/embeds/embeds');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot || !message.inGuild()) return;

    // Préfixe propre au serveur (personnalisé ou défaut), lu à chaque message
    // pour une prise en compte immédiate après un changement.
    const prefix = prefixService.getPrefix(message.guild.id);
    if (!message.content.startsWith(prefix)) return;

    const [rawName, ...tokens] = message.content.slice(prefix.length).trim().split(/\s+/);
    if (!rawName) return;

    const name = rawName.toLowerCase();
    const { client } = message;
    const command = client.commands.get(name) ?? client.commands.get(client.commandAliases.get(name));
    // Les noms inconnus sont ignorés silencieusement pour ne pas polluer les
    // salons (ex. : "!!" ou préfixe utilisé dans un autre contexte).
    if (!command) return;

    const resolved = await resolvePrefixArgs({ guild: message.guild, client }, command, tokens);
    if (resolved.error) {
      return message.reply({
        embeds: [errorEmbed(resolved.error)],
        allowedMentions: { repliedUser: false },
      });
    }

    const ctx = new CommandContext({
      client,
      guild: message.guild,
      channel: message.channel,
      member: message.member,
      user: message.author,
      options: resolved.values,
      message,
    });
    await executeCommand(ctx, command);
  },
};
