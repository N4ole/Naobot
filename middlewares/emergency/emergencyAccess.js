/**
 * Middleware du mode urgence : accès réservé aux administrateurs, au
 * propriétaire du serveur et aux owners du bot. Indépendant d'une
 * permission Discord unique (d'où le contrôle dans la commande plutôt que
 * déclaratif) afin d'autoriser aussi les owners sans permission Discord.
 */
const { PermissionFlagsBits } = require('discord.js');
const ownerService = require('../../services/owners/ownerService');
const { t } = require('../../utils/helpers/i18n');

/**
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function checkEmergencyAccess(ctx) {
  if (ownerService.isOwner(ctx.user.id)) return { ok: true };
  if (ctx.user.id === ctx.guild.ownerId) return { ok: true };
  if (ctx.member.permissions.has(PermissionFlagsBits.Administrator)) return { ok: true };
  return { ok: false, error: t('emergency.errors.noPermission') };
}

module.exports = { checkEmergencyAccess };
