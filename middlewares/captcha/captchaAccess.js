/**
 * Middleware du captcha : la configuration (enable/disable/setup) est réservée
 * aux administrateurs. La résolution du captcha, elle, est ouverte au membre
 * concerné (vérifiée par identifiant dans la commande).
 */
const { PermissionFlagsBits } = require('discord.js');

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

module.exports = { isAdmin };
