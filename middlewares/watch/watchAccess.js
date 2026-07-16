/**
 * Middleware du système de surveillance : réservé aux administrateurs du
 * serveur, aux membres disposant de la permission dédiée (Modérer les
 * membres) et aux owners du bot.
 *
 * Le contrôle est déclaratif via config/permissions.js pour les permissions
 * Discord ; ce helper ajoute la porte owner et sert aussi aux composants.
 */
const { PermissionFlagsBits } = require('discord.js');
const ownerService = require('../../services/owners/ownerService');
const { t } = require('../../utils/helpers/i18n');

/** true si le membre peut utiliser la surveillance (admin, modérateur ou owner). */
function canWatch(member) {
  if (ownerService.isOwner(member.id)) return true;
  return member.permissions.any([
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ModerateMembers,
  ]);
}

/**
 * @param {import('discord.js').GuildMember} member
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function checkWatchAccess(member) {
  if (canWatch(member)) return { ok: true };
  return { ok: false, error: t('watch.errors.noPermission') };
}

module.exports = { canWatch, checkWatchAccess };
