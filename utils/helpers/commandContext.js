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
   * pour les messages classiques). `components` accepte les lignes de
   * composants interactifs (boutons, menus…).
   * @param {{ content?: string, embeds?: import('discord.js').EmbedBuilder[], components?: import('discord.js').ActionRowBuilder[], ephemeral?: boolean }} payload
   */
  async reply({ content, embeds, components, ephemeral = false } = {}) {
    if (this.interaction) {
      const payload = { content, embeds, components };
      if (ephemeral) payload.flags = MessageFlags.Ephemeral;
      if (this.interaction.deferred && !this.interaction.replied) {
        return this.interaction.editReply(payload);
      }
      if (this.interaction.replied) {
        return this.interaction.followUp(payload);
      }
      return this.interaction.reply(payload);
    }
    return this.message.reply({ content, embeds, components, allowedMentions: { repliedUser: false } });
  }

  /**
   * Signale que la réponse va prendre du temps (ex. : création de plusieurs
   * salons). En slash : diffère la réponse (évite l'expiration des 3 s) ;
   * en préfixe : affiche l'indicateur de saisie.
   */
  async defer() {
    if (this.interaction) {
      if (!this.interaction.deferred && !this.interaction.replied) {
        await this.interaction.deferReply();
      }
      return;
    }
    await this.channel.sendTyping().catch(() => null);
  }
}

module.exports = { CommandContext };
