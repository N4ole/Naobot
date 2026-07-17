/**
 * Middleware des sauvegardes : opérations réservées aux administrateurs du
 * serveur (la configuration déclarative vit dans config/permissions.js ;
 * ce helper sert aux composants — confirmations — qui contournent le
 * pipeline).
 */
const { PermissionFlagsBits } = require('discord.js');

function isBackupAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

module.exports = { isBackupAdmin };
