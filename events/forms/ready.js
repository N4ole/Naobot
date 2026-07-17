/**
 * Au démarrage : indique le nombre total de formulaires persistés. Les
 * formulaires et leurs soumissions vivent dans database/data/forms.json et
 * restent opérationnels après un redémarrage (routage par customId).
 */
const { Events } = require('discord.js');
const formService = require('../../services/forms/formService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    let total = 0;
    for (const guild of client.guilds.cache.values()) total += formService.getForms(guild.id).length;
    console.log(`[forms] ${total} formulaire(s) actif(s).`);
  },
};
