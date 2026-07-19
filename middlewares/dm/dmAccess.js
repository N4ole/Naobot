/**
 * Middleware de la compatibilité en messages privés.
 *
 * Centralise la règle « cette commande nécessite-t-elle un serveur en DM ? ».
 * La détection DM elle-même se fait via l'absence de `ctx.guild` /
 * `interaction.inCachedGuild()` dans les points d'entrée.
 */
const dmService = require('../../services/directMessages/dmService');

/** true si la commande peut s'exécuter en DM sans serveur. */
function isDirect(command) {
  return dmService.isDirect(command);
}

/** true si la commande nécessite un serveur (donc une sélection en DM). */
function requiresGuild(command) {
  return !dmService.isDirect(command);
}

module.exports = { isDirect, requiresGuild };
