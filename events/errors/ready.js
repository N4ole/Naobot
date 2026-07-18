/**
 * Au démarrage : initialise la journalisation des erreurs internes du bot
 * (création du salon #bot-errors sur le serveur dédié, branchement des
 * gestionnaires globaux d'erreurs). La logique vit dans services/errors.
 */
const { Events } = require('discord.js');
const errorLogService = require('../../services/errors/errorLogService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await errorLogService.init(client).catch(() => null);
  },
};
