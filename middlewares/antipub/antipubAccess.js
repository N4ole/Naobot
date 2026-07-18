/**
 * Middleware de la protection anti-publicité.
 *
 * - Configuration (commande `antipub`) : réservée via config/permissions.js
 *   (Administrateur) — appliqué par le pipeline de commandes ; `canConfigure`
 *   protège en plus les composants interactifs (boutons du panneau).
 * - Exemptions : un salon exempté (invitations autorisées), un membre du
 *   staff (bots, administrateurs / gestionnaires, hiérarchie), un rôle ou un
 *   utilisateur exempté (extensions prévues) échappent à la suppression.
 *
 * La détection de permission du bot réutilise le socle des protections
 * (`canModerateMessages`), afin de rester cohérent avec les autres protections.
 */
const { PermissionFlagsBits } = require('discord.js');
const { isExempt, canModerateMessages } = require('../protections/protectionAccess');

/** true si le membre peut configurer l'anti-publicité (Administrateur). */
function canConfigure(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
}

/** true si le salon est exempté (invitations autorisées, aucune suppression). */
function isExemptChannel(config, channelId) {
  if (!channelId) return false;
  return config.exemptChannels.includes(channelId);
}

/**
 * true si le membre échappe à l'anti-publicité :
 * - staff / hiérarchie (via le socle des protections) ;
 * - rôle exempté (extension future) ;
 * - utilisateur exempté (extension future).
 */
function isExemptMember(config, member) {
  if (isExempt(member)) return true;
  if (config.exemptUsers.includes(member?.id)) return true;
  if (member?.roles?.cache && config.exemptRoles.some((roleId) => member.roles.cache.has(roleId))) return true;
  return false;
}

module.exports = { canConfigure, isExemptChannel, isExemptMember, canModerateMessages };
