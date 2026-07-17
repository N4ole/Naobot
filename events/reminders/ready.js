/**
 * Au démarrage : lance le planificateur de rappels (exécute les rappels
 * échus, y compris ceux arrivés à terme pendant l'arrêt du bot) et indique
 * le nombre de rappels en attente. Les rappels sont persistés
 * (database/data/reminders.json) et survivent aux redémarrages.
 */
const { Events } = require('discord.js');
const reminderService = require('../../services/reminders/reminderService');
const reminderRepository = require('../../database/reminderRepository');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    reminderService.startScheduler(client);
    console.log(`[reminders] ${Object.keys(reminderRepository.getAll()).length} rappel(s) planifié(s).`);
  },
};
