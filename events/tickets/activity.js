/**
 * Suit l'activité des salons de tickets : chaque message (hors bot) met à
 * jour l'horodatage d'activité du ticket, ce qui repousse la fermeture
 * automatique par inactivité. Les salons non-tickets sont ignorés
 * immédiatement (simple lecture en mémoire).
 */
const { Events } = require('discord.js');
const ticketService = require('../../services/tickets/ticketService');

module.exports = {
  name: Events.MessageCreate,
  execute(message) {
    if (message.author?.bot || !message.inGuild()) return;
    ticketService.touchActivity(message.guild.id, message.channel.id);
  },
};
