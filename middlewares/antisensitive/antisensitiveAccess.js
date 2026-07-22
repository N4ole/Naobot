/**
 * Middleware de la protection anti-contenus sensibles.
 *
 * - Configuration (commande `antisensitive`) : réservée aux administrateurs
 *   (config/permissions.js) ; `canConfigure` protège aussi les composants.
 * - Exemptions : salon exempté, membre du staff (bots, administrateurs /
 *   gestionnaires, hiérarchie), rôle ou utilisateur exempté (extensions).
 *
 * Réutilise le socle des protections (`canModerateMessages`, `isExempt`).
 */
const { PermissionFlagsBits } = require('discord.js');
const { isExempt, canModerateMessages } = require('../protections/protectionAccess');

/** true si le membre peut configurer l'anti-contenus sensibles (Administrateur). */
function canConfigure(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
}

/** true si le salon est exempté (liens sensibles tolérés). */
function isExemptChannel(config, channelId) {
  if (!channelId) return false;
  return config.exemptChannels.includes(channelId);
}

/** true si la catégorie parente du salon est exemptée. */
function isExemptCategory(config, parentId) {
  if (!parentId) return false;
  return (config.exemptCategories ?? []).includes(parentId);
}

/** true si le membre échappe à la protection (staff, rôle ou utilisateur exempté). */
function isExemptMember(config, member) {
  if (isExempt(member)) return true;
  if (config.exemptUsers.includes(member?.id)) return true;
  if (member?.roles?.cache && config.exemptRoles.some((roleId) => member.roles.cache.has(roleId))) return true;
  return false;
}

module.exports = { canConfigure, isExemptChannel, isExemptCategory, isExemptMember, canModerateMessages };
