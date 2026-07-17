/**
 * Au démarrage : indique le nombre total de sauvegardes de serveurs
 * persistées. Les sauvegardes vivent dans database/data/backups.json et
 * restent accessibles via la commande backup après un redémarrage.
 */
const { Events } = require('discord.js');
const backupService = require('../../services/backup/backupService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    let total = 0;
    for (const guild of client.guilds.cache.values()) total += backupService.getBackups(guild.id).length;
    console.log(`[backup] ${total} sauvegarde(s) de serveur(s) disponible(s).`);
  },
};
