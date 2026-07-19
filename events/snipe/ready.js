/**
 * Au démarrage : lance la purge périodique des événements de snipe expirés
 * (au-delà de la durée de conservation configurée par serveur). La logique
 * vit dans services/snipe.
 */
const { Events } = require('discord.js');
const snipeService = require('../../services/snipe/snipeService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute() {
    snipeService.startPurgeScheduler();
    console.log('[snipe] Purge automatique des événements de snipe démarrée.');
  },
};
