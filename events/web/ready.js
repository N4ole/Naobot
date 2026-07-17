/**
 * Au démarrage : lance l'interface web si elle est activée (config.web.enabled)
 * et correctement configurée. Le serveur web est totalement séparé de la
 * logique Discord : il ne reçoit que le client (lecture seule) pour les
 * statistiques temps réel. Désactivée, cette fonctionnalité n'a aucun effet.
 */
const { Events } = require('discord.js');
const webServer = require('../../web/backend/server');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    webServer.start(client);
  },
};
