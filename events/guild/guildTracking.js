/**
 * Suivi des arrivées et départs du bot sur les serveurs (même famille,
 * même fichier) : historique persistant, recalcul de la réputation et
 * notification privée détaillée à tous les owners.
 */
const { Events } = require('discord.js');
const statsService = require('../../services/tracking/guildStatsService');
const reputationService = require('../../services/reputation/reputationService');
const ownerNotifier = require('../../services/tracking/ownerNotifier');

const botJoinedGuild = {
  name: Events.GuildCreate,
  async execute(guild) {
    statsService.recordJoin(guild);
    reputationService.recalculate(guild, { reason: 'auto' });
    await ownerNotifier.notifyGuildJoin(guild.client, guild).catch((error) => {
      console.error('[tracking] Échec de la notification d\'arrivée :', error);
    });
  },
};

const botLeftGuild = {
  name: Events.GuildDelete,
  async execute(guild) {
    statsService.recordLeave(guild);
    reputationService.recalculate(guild, { reason: 'auto' });
    await ownerNotifier
      .notifyGuildLeave(guild.client, guild, statsService.getStats(guild.id))
      .catch((error) => {
        console.error('[tracking] Échec de la notification de départ :', error);
      });
  },
};

module.exports = [botJoinedGuild, botLeftGuild];
