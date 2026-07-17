/**
 * Au démarrage : lance la tâche de cohérence des rôles de warn (réconcilie
 * périodiquement les rôles automatiques avec le nombre réel de warns de
 * chaque membre, et corrige les écarts). La configuration est persistée.
 */
const { Events } = require('discord.js');
const warnRoleService = require('../../services/warnings/warnRoleService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    warnRoleService.startScheduler(client);
    console.log('[warnRoles] Tâche de cohérence des rôles de warn démarrée.');
  },
};
