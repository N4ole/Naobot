/**
 * Middleware owner : vérifie qu'un utilisateur est owner du bot
 * (système global, indépendant des permissions Discord).
 *
 * Utilisé :
 * - par le pipeline commun (commandes slash et préfixées) pour toute
 *   commande déclarant `ownerOnly: true` ;
 * - directement par les handleComponent des commandes owner (boutons,
 *   menus…) via checkOwner(interaction.user.id).
 */
const ownerService = require('../../services/owners/ownerService');
const { t } = require('../../utils/helpers/i18n');

/**
 * @param {string} userId
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function checkOwner(userId) {
  if (ownerService.isOwner(userId)) return { ok: true };
  return { ok: false, error: t('owners.errors.notOwner') };
}

module.exports = { checkOwner };
