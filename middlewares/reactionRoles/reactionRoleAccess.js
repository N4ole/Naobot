/**
 * Middleware des rôles réactions : sécurité d'attribution des rôles.
 *
 * - Gestion des panneaux : réservée via config/permissions.js
 *   (Gérer les rôles) — appliqué par le pipeline commun.
 * - roleAssignable : vérifie, avant toute attribution, que le bot peut
 *   gérer le rôle (permission Gérer les rôles, rôle non géré, pas
 *   @everyone) et que le rôle est **inférieur** au rôle le plus haut du
 *   bot (hiérarchie Discord). Le bot ne tente jamais d'attribuer un rôle
 *   supérieur ou égal au sien.
 */
const { PermissionFlagsBits } = require('discord.js');

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Role|null} role
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
function roleAssignable(guild, role) {
  if (!role) return { ok: false, code: 'notFound' };
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return { ok: false, code: 'botNoPerm' };
  if (role.id === guild.roles.everyone.id) return { ok: false, code: 'everyone' };
  if (role.managed) return { ok: false, code: 'managed' };
  if (me.roles.highest.comparePositionTo(role) <= 0) return { ok: false, code: 'tooHigh' };
  return { ok: true };
}

module.exports = { roleAssignable };
