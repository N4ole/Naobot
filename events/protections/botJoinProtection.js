/**
 * Écouteur d'arrivée de membre pour la protection anti-bot : délègue au
 * moteur antibot, qui n'agit que si la protection est activée sur le serveur.
 */
const { Events } = require('discord.js');
const antibotService = require('../../services/antibot/antibotService');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await antibotService.handleMemberAdd(member).catch(() => null);
  },
};
