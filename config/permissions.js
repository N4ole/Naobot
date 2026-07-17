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
    // Le bot peut avoir à appliquer timeout/mute/kick/ban selon l'échelle.
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [PermissionFlagsBits.ModerateMembers],
  },
  unwarn: {
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [],
  },
  warnings: {
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [],
  },
  warncount: {
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [],
  },
  clearwarns: {
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [],
  },
  setwarnsanction: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  reactionrole: {
    user: [PermissionFlagsBits.ManageRoles],
    bot: [PermissionFlagsBits.ManageRoles],
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
  // Accès (admin OU modérateur OU owner) contrôlé dans la commande via
  // middlewares/watch/watchAccess : pas de permission `user` déclarative
  // ici, sinon le pipeline bloquerait les owners sans permission Discord.
  // Seules les permissions du bot sont vérifiées par le pipeline.
  watch: {
    user: [],
    bot: [PermissionFlagsBits.ManageChannels],
  },
  stopwatch: {
    user: [],
    bot: [],
  },
  // Protections automatiques : configuration réservée à « Gérer le serveur ».
  antispam: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [PermissionFlagsBits.ManageMessages],
  },
  antilink: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [PermissionFlagsBits.ManageMessages],
  },
  antibot: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  protections: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  // Accès (admin OU propriétaire OU owner) contrôlé dans la commande ;
  // seule la permission du bot est vérifiée par le pipeline.
  urgence: {
    user: [],
    bot: [PermissionFlagsBits.ManageChannels],
  },
  setwelcome: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [PermissionFlagsBits.ManageRoles],
  },
  welcomestatus: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  welcomepreview: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  backup: {
    user: [PermissionFlagsBits.Administrator],
    bot: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles],
  },
  form: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  // Création de sondages réservée à « Gérer les messages ». La fermeture
  // (pollclose) est vérifiée dans la commande (créateur OU gestionnaire) ;
  // la consultation (pollresults / polllist) reste ouverte à tous.
  poll: {
    user: [PermissionFlagsBits.ManageMessages],
    bot: [],
  },
};
