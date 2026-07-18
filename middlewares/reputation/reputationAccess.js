/**
 * Confidentialité de la réputation globale.
 *
 * Un utilisateur classique ne peut voir QUE sa propre réputation. La
 * réputation d'un autre utilisateur n'est accessible qu'aux :
 *  - owners du bot ;
 *  - administrateurs d'un serveur (partagé avec NaoBot) où la cible est
 *    présente.
 *
 * Les statistiques globales et l'historique complet sont réservés aux owners.
 */
const { PermissionFlagsBits } = require('discord.js');
const ownerService = require('../../services/owners/ownerService');

/**
 * @param {import('discord.js').User} viewer
 * @param {string} targetId
 * @param {import('discord.js').Client} client
 * @returns {boolean}
 */
function canViewReputation(viewer, targetId, client) {
  if (viewer.id === targetId) return true; // sa propre réputation
  if (ownerService.isOwner(viewer.id)) return true; // owner du bot

  // Administrateur d'un serveur (commun) où la cible est présente.
  for (const guild of client.guilds.cache.values()) {
    const target = guild.members.cache.get(targetId);
    const admin = guild.members.cache.get(viewer.id);
    if (target && admin?.permissions.has(PermissionFlagsBits.Administrator)) return true;
  }
  return false;
}

module.exports = { canViewReputation };
