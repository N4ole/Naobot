/**
 * Middleware des formulaires.
 *
 * - canManageForms : création/édition/suppression et traitement des
 *   soumissions réservés à « Gérer le serveur ».
 * - canFillForm : un membre peut remplir un formulaire si celui-ci n'a
 *   aucune restriction de rôle, ou s'il possède l'un des rôles autorisés.
 */
const { PermissionFlagsBits } = require('discord.js');

function canManageForms(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function canFillForm(member, form) {
  if (!form.allowedRoleIds?.length) return true;
  return form.allowedRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

module.exports = { canManageForms, canFillForm };
