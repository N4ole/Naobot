/**
 * Middleware du système de snipe : consultation réservée aux administrateurs,
 * aux modérateurs autorisés (permission « Modérer les membres ») et aux owners
 * du bot. Sert aussi bien à la commande qu'à ses composants (boutons).
 */
const { PermissionFlagsBits } = require('discord.js');
const ownerService = require('../../services/owners/ownerService');
const { t } = require('../../utils/helpers/i18n');

/** true si le membre peut consulter le snipe (admin, modérateur ou owner). */
function canSnipe(member) {
  if (!member) return false;
  if (ownerService.isOwner(member.id)) return true;
  return member.permissions.any([PermissionFlagsBits.Administrator, PermissionFlagsBits.ModerateMembers]);
}

/** @returns {{ ok: true } | { ok: false, error: string }} */
function checkSnipeAccess(member) {
  if (canSnipe(member)) return { ok: true };
  return { ok: false, error: t('snipe.noPermission') };
}

module.exports = { canSnipe, checkSnipeAccess };
