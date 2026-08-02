/**
 * Applique le statut du bot au démarrage.
 * La présence est déjà envoyée à l'IDENTIFY (options du client, voir
 * `services/presence/presenceService.initialPresence`) ; ce rappel garantit
 * le statut même si le client est créé sans options de présence.
 */
const { Events } = require('discord.js');
const presenceService = require('../../services/presence/presenceService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    const applied = presenceService.apply(client);
    console.log(
      applied
        ? `[presence] Statut : « ${presenceService.statusText()} ».`
        : "[presence] Statut non appliqué (client non prêt).",
    );
  },
};
