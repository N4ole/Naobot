/**
 * Écouteur de messages pour les protections anti-spam et anti-link.
 * Chaque moteur ne s'active que si sa protection est activée sur le serveur
 * et gère lui-même exemptions, permissions du bot et journalisation.
 * Un message supprimé par l'anti-link n'est plus analysé par l'anti-spam.
 */
const { Events } = require('discord.js');
const antispamService = require('../../services/antispam/antispamService');
const antilinkService = require('../../services/antilink/antilinkService');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    const linkHandled = await antilinkService.handleMessage(message).catch(() => false);
    if (linkHandled) return;
    await antispamService.handleMessage(message).catch(() => null);
  },
};
