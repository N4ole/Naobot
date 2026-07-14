/**
 * Événement ready : enregistre les commandes slash auprès de Discord.
 * - GUILD_ID défini : enregistrement sur ce serveur uniquement (instantané,
 *   idéal en développement).
 * - Sinon : enregistrement global (propagation jusqu'à ~1 h).
 */
const { Events } = require('discord.js');
const config = require('../../config/config');
const { buildSlashCommand } = require('../../utils/helpers/slashBuilder');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    const definitions = client.commands.map(buildSlashCommand);

    try {
      if (config.guildId) {
        await client.application.commands.set(definitions, config.guildId);
        console.log(`[slash] ${definitions.length} commande(s) enregistrée(s) sur le serveur ${config.guildId}.`);
      } else {
        await client.application.commands.set(definitions);
        console.log(`[slash] ${definitions.length} commande(s) enregistrée(s) globalement.`);
      }
    } catch (error) {
      console.error('[slash] Échec de l\'enregistrement des commandes :', error);
    }

    console.log(`[client] Connecté en tant que ${client.user.tag}.`);
  },
};
