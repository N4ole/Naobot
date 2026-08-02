/**
 * Middleware du système de contact.
 *
 * - checkContactAccess : la commande contactowner est ouverte à l'**équipe du
 *   serveur** — propriétaire, administrateurs et modérateurs (voir
 *   `utils/constants/contactPositions.js`) — sur un serveur non blacklisté (le
 *   pipeline refuse déjà toute commande sur un serveur banni, cette
 *   vérification est une double sécurité explicite). Le **poste** occupé est
 *   renvoyé : il est ensuite affiché aux owners, qui savent ainsi à quel titre
 *   le membre écrit.
 * - Les commandes de réponse/gestion sont réservées aux **owners du bot**
 *   via le mécanisme standard `ownerOnly: true`.
 *
 * L'anti-usurpation repose sur ces contrôles : jamais le compte Discord
 * d'un owner n'est exposé, et toute communication transite par le bot.
 */
const serverBanRepository = require('../../database/serverBanRepository');
const contactPositionService = require('../../services/contact/contactPositionService');
const { t } = require('../../utils/helpers/i18n');

/**
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @returns {{ ok: true, position: object } | { ok: false, error: string }}
 */
function checkContactAccess(ctx) {
  if (serverBanRepository.isBanned(ctx.guild.id)) {
    return { ok: false, error: t('contact.errors.banned') };
  }
  const position = contactPositionService.resolve(ctx.guild, ctx.member);
  if (!position) {
    return { ok: false, error: t('contact.errors.notStaff') };
  }
  return { ok: true, position };
}

module.exports = { checkContactAccess };
