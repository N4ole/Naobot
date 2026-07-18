/**
 * Écouteurs de la protection anti-publicité (invitations Discord).
 *
 * - MessageCreate : messages classiques, réponses et relais.
 * - MessageUpdate : messages modifiés (une invitation ajoutée après coup, ou
 *   révélée par l'apparition d'un embed de prévisualisation).
 *
 * Le moteur (services/antipub) ne réagit que si la protection est activée sur
 * le serveur ; il gère lui-même exemptions, permissions du bot et logs.
 */
const { Events } = require('discord.js');
const antipubService = require('../../services/antipub/antipubService');

/** Récupère un message potentiellement partiel (modification hors cache). */
async function ensureFull(message) {
  if (!message?.partial) return message;
  return message.fetch().catch(() => null);
}

module.exports = [
  {
    name: Events.MessageCreate,
    async execute(message) {
      await antipubService.handleMessage(message).catch(() => null);
    },
  },
  {
    name: Events.MessageUpdate,
    async execute(_oldMessage, newMessage) {
      const message = await ensureFull(newMessage);
      if (message) await antipubService.handleMessage(message).catch(() => null);
    },
  },
];
