/**
 * Middleware des dossiers membres : contrôle d'accès à des données sensibles
 * (notes de modération globales). Chaque accès est vérifié avant lecture ou
 * écriture ; les membres classiques n'ont jamais accès.
 *
 * - Ajout (`file`) : administrateurs, modérateurs (Modérer les membres) ou
 *   owners du bot.
 * - Consultation (`fileinfo` / `filelist`) : administrateurs ou owners du bot.
 * - Suppression (`filedelete`) : owner du bot, auteur de la note, ou
 *   administrateur du serveur ayant créé la note.
 */
const { PermissionFlagsBits } = require('discord.js');
const ownerService = require('../../services/owners/ownerService');
const { t } = require('../../utils/helpers/i18n');

function isAdmin(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
}

/** Ajouter une note : admin, modérateur, ou owner du bot. */
function canAddFile(member) {
  if (!member) return false;
  if (ownerService.isOwner(member.id)) return true;
  return member.permissions.any([PermissionFlagsBits.Administrator, PermissionFlagsBits.ModerateMembers]);
}

/** Consulter un dossier : admin ou owner du bot. */
function canViewFiles(member) {
  if (!member) return false;
  return ownerService.isOwner(member.id) || isAdmin(member);
}

/**
 * Supprimer une note : owner du bot, auteur de la note, ou administrateur du
 * serveur d'origine de la note.
 */
function canDeleteNote(member, note) {
  if (!member || !note) return false;
  if (ownerService.isOwner(member.id)) return true;
  if (member.id === note.authorId) return true;
  return isAdmin(member) && member.guild?.id === note.guildId;
}

function checkView(member) {
  return canViewFiles(member) ? { ok: true } : { ok: false, error: t('memberFiles.noPermission.view') };
}

function checkAdd(member) {
  return canAddFile(member) ? { ok: true } : { ok: false, error: t('memberFiles.noPermission.add') };
}

module.exports = { canAddFile, canViewFiles, canDeleteNote, checkView, checkAdd, isAdmin };
