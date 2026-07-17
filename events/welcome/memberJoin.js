/**
 * Écouteur d'arrivée de membre pour le système de bienvenue. Délègue au
 * service, qui n'agit que si la bienvenue est activée sur le serveur.
 */
const { Events } = require('discord.js');
const welcomeService = require('../../services/welcome/welcomeService');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await welcomeService.handleMemberJoin(member).catch(() => null);
  },
};
