/**
 * Permissions requises par commande.
 *
 * - `user` : permissions Discord que l'auteur de la commande doit posséder.
 *            Elles sont aussi appliquées nativement aux commandes slash via
 *            `default_member_permissions` (intégration Discord native).
 * - `bot`  : permissions que le bot doit posséder pour exécuter l'action.
 *
 * Pour ajouter une restriction à une nouvelle commande, il suffit d'ajouter
 * une entrée ici : le middleware de permissions la prendra en compte
 * automatiquement, sans modifier le code des commandes existantes.
 */
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  ban: {
    user: [PermissionFlagsBits.BanMembers],
    bot: [PermissionFlagsBits.BanMembers],
  },
  unban: {
    user: [PermissionFlagsBits.BanMembers],
    bot: [PermissionFlagsBits.BanMembers],
  },
  kick: {
    user: [PermissionFlagsBits.KickMembers],
    bot: [PermissionFlagsBits.KickMembers],
  },
  mute: {
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [PermissionFlagsBits.ManageRoles],
  },
  unmute: {
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [PermissionFlagsBits.ManageRoles],
  },
  timeout: {
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [PermissionFlagsBits.ModerateMembers],
  },
  untimeout: {
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [PermissionFlagsBits.ModerateMembers],
  },
  warn: {
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [],
  },
  warnings: {
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [],
  },
  purge: {
    user: [PermissionFlagsBits.ManageMessages],
    bot: [PermissionFlagsBits.ManageMessages],
  },
  logs: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [PermissionFlagsBits.ManageChannels],
  },
  bumpenable: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  bump: {
    user: [],
    bot: [PermissionFlagsBits.CreateInstantInvite],
  },
  say: {
    user: [PermissionFlagsBits.ManageMessages],
    bot: [],
  },
  setticket: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [PermissionFlagsBits.ManageChannels],
  },
};
