/**
 * Événement ready : enregistre les commandes slash auprès de Discord.
 * - GUILD_ID défini : enregistrement sur ce serveur uniquement (instantané,
 *   idéal en développement).
 * - Sinon : enregistrement global (propagation jusqu'à ~1 h).
 */
const { Events } = require('discord.js');
const config = require('../../config/config');
const ownerService = require('../../services/owners/ownerService');
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

    // Chargement des owners (env + JSON) et attribution du rôle décoratif
    // aux owners déjà présents sur les serveurs.
    console.log(`[owners] ${ownerService.getAllOwnerIds().length} owner(s) chargé(s).`);
    await ownerService.syncAllGuilds(client).catch((error) => {
      console.error('[owners] Échec de la synchronisation des rôles :', error);
    });

    console.log(`[client] Connecté en tant que ${client.user.tag}.`);
  },
};
