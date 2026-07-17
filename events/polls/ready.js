/**
 * Au démarrage : lance le planificateur de sondages (ferme les sondages
 * expirés, y compris pendant l'arrêt du bot) et indique le nombre de
 * sondages ouverts. Les sondages sont persistés (database/data/polls.json).
 */
const { Events } = require('discord.js');
const pollService = require('../../services/polls/pollService');
const pollRepository = require('../../database/pollRepository');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    pollService.startScheduler(client);
    console.log(`[polls] ${pollRepository.getAllOpenPolls().length} sondage(s) ouvert(s).`);
  },
};
