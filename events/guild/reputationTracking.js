/**
 * Événements sensibles alimentant le système de réputation (même famille,
 * même fichier) : suppressions de salons et bannissements. Chaque événement
 * est enregistré (fenêtre glissante 24 h) puis la réputation du serveur est
 * recalculée automatiquement.
 */
const { Events } = require('discord.js');
const statsService = require('../../services/tracking/guildStatsService');
const reputationService = require('../../services/reputation/reputationService');

const channelDeletionTracking = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild) return;
    statsService.recordChannelDeletion(channel.guild.id);
    reputationService.recalculate(channel.guild, { reason: 'auto' });
  },
};

const banTracking = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    statsService.recordBan(ban.guild.id);
    reputationService.recalculate(ban.guild, { reason: 'auto' });
  },
};

module.exports = [channelDeletionTracking, banTracking];
