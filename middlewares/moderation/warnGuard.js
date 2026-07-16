/**
 * Middleware du système de warns : validation transverse d'une action de
 * warn sur une cible (membre présent, hiérarchie Discord). Réutilise
 * checkTargetHierarchy afin de ne pas dupliquer la logique de hiérarchie.
 *
 * Les commandes de simple consultation (warnings, warncount) et de retrait
 * (unwarn, clearwarns) acceptent un utilisateur éventuellement absent du
 * serveur : elles n'utilisent pas ce garde de hiérarchie.
 */
const { checkTargetHierarchy } = require('../permissions/checkPermissions');
const { t } = require('../../utils/helpers/i18n');

/**
 * Vérifie qu'un membre peut être averti (cible valide + hiérarchie).
 * @param {import('../../utils/helpers/commandContext').CommandContext} ctx
 * @param {import('discord.js').GuildMember} member
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function checkWarnable(ctx, member) {
  if (member.user.bot) return { ok: false, error: t('warns.errors.botTarget') };
  return checkTargetHierarchy(ctx, member);
}

module.exports = { checkWarnable };
