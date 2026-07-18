/**
 * Middleware des logs : la configuration du système de logs est réservée aux
 * membres pouvant « Gérer le serveur ». Utilisé par la commande logs et ses
 * composants (panneau interactif).
 */
const { PermissionFlagsBits } = require('discord.js');

function canManageLogs(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

module.exports = { canManageLogs };
