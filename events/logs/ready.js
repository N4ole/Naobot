/**
 * Au démarrage : migre automatiquement l'ancien système de logs (nombreuses
 * catégories) vers les sept catégories actuelles. La configuration existante
 * est remappée et les catégories obsolètes supprimées (opération idempotente).
 */
const { Events } = require('discord.js');
const logMigration = require('../../services/logs/logMigration');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute() {
    const migrated = logMigration.migrateAll();
    if (migrated > 0) console.log(`[logs] Migration vers 7 catégories : ${migrated} serveur(s) mis à jour.`);
  },
};
