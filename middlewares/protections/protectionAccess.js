/**
 * Middleware des protections automatiques.
 *
 * - Configuration (antispam/antilink/antibot/protections) : réservée via
 *   config/permissions.js (Gérer le serveur) — appliqué par le pipeline.
 * - isExempt : un membre exempté n'est jamais sanctionné automatiquement
 *   (bots, membres pouvant gérer les messages / administrateurs, et membres
 *   d'un rang supérieur ou égal au bot — respect de la hiérarchie Discord).
 * - canModerateMessages : le bot doit pouvoir gérer les messages pour agir.
 */
const { PermissionFlagsBits } = require('discord.js');

/** true si le membre échappe aux protections automatiques. */
function isExempt(member) {
  if (!member || member.user?.bot) return true;
  if (member.permissions.any([PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageGuild])) {
    return true;
  }
  // Hiérarchie : le bot n'agit jamais sur un membre de rang supérieur ou égal.
  const me = member.guild.members.me;
  if (me && me.roles.highest.comparePositionTo(member.roles.highest) <= 0) return true;
  return false;
}

/** true si le bot peut supprimer/modérer les messages du salon. */
function canModerateMessages(guild, channel) {
  const me = guild.members.me;
  return Boolean(me && channel && me.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages));
}

module.exports = { isExempt, canModerateMessages };
