/**
 * Garde de la liste noire : quand un serveur banni invite le bot, aucune
 * initialisation normale n'a lieu — le propriétaire est prévenu en MP,
 * la tentative est tracée, les owners sont notifiés et le bot quitte
 * immédiatement le serveur. Les autres écouteurs GuildCreate et le
 * pipeline de commandes vérifient eux aussi isBanned.
 */
const { Events } = require('discord.js');
const serverManagementService = require('../../services/serverManagement/serverManagementService');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    await serverManagementService.handleBannedGuildJoin(guild).catch((error) => {
      console.error('[serverban] Échec du traitement du serveur banni :', error);
    });
  },
};
