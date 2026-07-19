/**
 * Écouteurs de la protection anti-contenus sensibles (sites adultes, violents,
 * gore, choquants).
 *
 * - MessageCreate : messages classiques, réponses et relais.
 * - MessageUpdate : messages modifiés (lien sensible ajouté après coup, ou
 *   révélé par un embed de prévisualisation).
 *
 * Le moteur (services/antisensitive) ne réagit que si la protection est activée
 * sur le serveur ; il gère exemptions, permissions du bot et logs.
 */
const { Events } = require('discord.js');
const antisensitiveService = require('../../services/antisensitive/antisensitiveService');

async function ensureFull(message) {
  if (!message?.partial) return message;
  return message.fetch().catch(() => null);
}

module.exports = [
  {
    name: Events.MessageCreate,
    async execute(message) {
      await antisensitiveService.handleMessage(message).catch(() => null);
    },
  },
  {
    name: Events.MessageUpdate,
    async execute(_oldMessage, newMessage) {
      const message = await ensureFull(newMessage);
      if (message) await antisensitiveService.handleMessage(message).catch(() => null);
    },
  },
];
