/**
 * Au démarrage : lance le planificateur des tickets (fermeture automatique
 * par inactivité et suppression automatique des tickets fermés, selon la
 * configuration de chaque catégorie). Les tickets sont persistés.
 */
const { Events } = require('discord.js');
const ticketService = require('../../services/tickets/ticketService');
const ticketRepository = require('../../database/ticketRepository');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    ticketService.startScheduler(client);
    const open = client.guilds.cache.reduce((sum, guild) => sum + ticketRepository.listOpenTickets(guild.id).length, 0);
    console.log(`[tickets] ${open} ticket(s) ouvert(s).`);
  },
};
