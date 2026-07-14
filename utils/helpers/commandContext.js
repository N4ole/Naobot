/**
 * Contexte d'exécution unifié.
 *
 * C'est la pièce centrale qui permet aux commandes slash et aux commandes
 * préfixées de partager exactement la même logique métier : les deux points
 * d'entrée (events/interaction et events/message) construisent un
 * CommandContext, et chaque commande n'écrit qu'une seule méthode execute(ctx).
 */
const { MessageFlags } = require('discord.js');

class CommandContext {
  /**
   * @param {object} params
   * @param {import('discord.js').Client} params.client
   * @param {import('discord.js').Guild} params.guild
   * @param {import('discord.js').TextBasedChannel} params.channel
   * @param {import('discord.js').GuildMember} params.member - Auteur de la commande
   * @param {import('discord.js').User} params.user - Auteur de la commande
   * @param {Record<string, unknown>} params.options - Arguments déjà résolus (voir argumentParser)
   * @param {import('discord.js').ChatInputCommandInteraction} [params.interaction]
   * @param {import('discord.js').Message} [params.message]
   */
  constructor({ client, guild, channel, member, user, options, interaction = null, message = null }) {
    this.client = client;
    this.guild = guild;
    this.channel = channel;
    this.member = member;
    this.user = user;
    this.options = options;
    this.interaction = interaction;
    this.message = message;
  }

  /** true si la commande provient d'une interaction slash. */
  get isSlash() {
    return this.interaction !== null;
  }

  /**
   * Répond à l'utilisateur, quel que soit le point d'entrée.
   * `ephemeral` n'a d'effet que pour les commandes slash (concept inexistant
   * pour les messages classiques).
   * @param {{ content?: string, embeds?: import('discord.js').EmbedBuilder[], ephemeral?: boolean }} payload
   */
  async reply({ content, embeds, ephemeral = false } = {}) {
    if (this.interaction) {
      const payload = { content, embeds };
      if (ephemeral) payload.flags = MessageFlags.Ephemeral;
      if (this.interaction.deferred || this.interaction.replied) {
        return this.interaction.followUp(payload);
      }
      return this.interaction.reply(payload);
    }
    return this.message.reply({ content, embeds, allowedMentions: { repliedUser: false } });
  }
}

module.exports = { CommandContext };
