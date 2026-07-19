/**
 * Au démarrage : signale que le système de dossiers membres est opérationnel.
 * Les dossiers étant globaux et persistés (database/data/memberFiles.json),
 * aucune reconstruction n'est nécessaire au lancement ; ce point d'entrée reste
 * le hook naturel pour de futures tâches (rappels, purge de brouillons, etc.).
 */
const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute() {
    console.log('[memberFiles] Dossiers membres (globaux) opérationnels.');
  },
};
