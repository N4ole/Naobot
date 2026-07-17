/**
 * Middleware du système de contact.
 *
 * - checkServerOwner : la commande contactowner est réservée au
 *   **propriétaire du serveur** (et non aux administrateurs), serveur non
 *   blacklisté (le pipeline refuse déjà toute commande sur un serveur
 *   banni, cette vérification est une double sécurité explicite).
 * - Les commandes de réponse/gestion sont réservées aux **owners du bot**
 *   via le mécanisme standard `ownerOnly: true`.
 *
 * L'anti-usurpation repose sur ces contrôles : jamais le compte Discord
 * d'un owner n'est exposé, et toute communication transite par le bot.
 */
const serverBanRepository = require('../../database/serverBanRepository');
const { t } = require('../../utils/helpers/i18n');

/**
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function checkServerOwner(ctx) {
  if (serverBanRepository.isBanned(ctx.guild.id)) {
    return { ok: false, error: t('contact.errors.banned') };
  }
  if (ctx.user.id !== ctx.guild.ownerId) {
    return { ok: false, error: t('contact.errors.notServerOwner') };
  }
  return { ok: true };
}

module.exports = { checkServerOwner };
