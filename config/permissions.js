/**
 * Permissions requises par commande.
 *
 * - `user` : permissions Discord que l'auteur de la commande doit posséder.
 *            Elles sont aussi appliquées nativement aux commandes slash via
 *            `default_member_permissions` (intégration Discord native).
 * - `bot`  : permissions **indispensables à l'exécution de la commande
 *            elle-même**. Le pipeline bloque la commande si elles manquent.
 *
 * ⚠️ **Règle de moindre privilège** (exigée par la vérification Discord) : ne
 * déclarer dans `bot` que ce que la commande exécute **réellement et
 * systématiquement**. Ne jamais y mettre une permission utile :
 *   - à une action **conditionnelle** (ex. l'escalade d'un `warn` en timeout —
 *     elle n'a lieu qu'à certains paliers, et réclame selon le cas
 *     `ModerateMembers`, `ManageRoles`, `KickMembers` ou `BanMembers`) ;
 *   - à une action **différée**, exécutée plus tard par un écouteur
 *     d'événement (attribution d'un rôle de niveau, expulsion au captcha,
 *     suppression d'un message par une protection…).
 *
 * Ces besoins-là se déclarent dans `FEATURE_PERMISSIONS` (voir plus bas) :
 * ils sont **documentés et affichés**, mais ne bloquent aucune commande. La
 * vérification a lieu au moment de l'action, qui échoue proprement si la
 * permission manque.
 *
 * Pour ajouter une restriction à une nouvelle commande, il suffit d'ajouter
 * une entrée ici : le middleware de permissions la prendra en compte
 * automatiquement, sans modifier le code des commandes existantes.
 */
const { PermissionFlagsBits } = require('discord.js');

const COMMAND_PERMISSIONS = {
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
    // Un avertissement est un enregistrement + un MP + un log : le bot n'a
    // besoin d'AUCUNE permission Discord pour cela. La sanction du palier
    // (timeout/mute/kick/ban) est conditionnelle et vérifiée à l'exécution
    // par sanctionService, qui échoue proprement si elle est impossible —
    // l'avertissement, lui, reste enregistré.
    user: [PermissionFlagsBits.ModerateMembers],
    bot: [],
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
  // Le panneau se crée sans permission ; l'attribution des rôles a lieu plus
  // tard, à la réaction d'un membre.
  reactionrole: {
    user: [PermissionFlagsBits.ManageRoles],
    bot: [],
  },
  purge: {
    user: [PermissionFlagsBits.ManageMessages],
    bot: [PermissionFlagsBits.ManageMessages],
  },
  // `logs status`/`stats` ne font que lire : seules `setup` et `enable`
  // créent des salons, et vérifient la permission au moment de le faire.
  logs: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  bumpenable: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  bump: {
    user: [],
    bot: [PermissionFlagsBits.CreateInstantInvite],
  },
  // Accès (admin serveur OU propriétaire du serveur OU owner du bot) vérifié
  // dans la commande : pas de permission `user` déclarative ici, sinon le
  // pipeline bloquerait les owners du bot sans permission Discord.
  say: {
    user: [],
    bot: [],
  },
  // Préfixe : accès (admin / propriétaire du serveur / owner du bot) vérifié
  // dans la commande. `prefix` (consultation) est ouvert à tous.
  setprefix: {
    user: [],
    bot: [],
  },
  prefix: {
    user: [],
    bot: [],
  },
  // Configuration des tickets (catégories + panneaux) : administrateurs.
  // Le bot crée des salons/catégories et gère les permissions.
  ticketcategory: {
    user: [PermissionFlagsBits.Administrator],
    bot: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles],
  },
  ticketpanel: {
    user: [PermissionFlagsBits.Administrator],
    bot: [PermissionFlagsBits.ManageChannels],
  },
  ticketstats: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  // Les commandes de gestion d'un ticket (ticketclose, ticketclaim…) ne sont
  // pas déclarées ici : leur accès (créateur / assigné / équipe) est vérifié
  // dans la commande via middlewares/tickets/ticketAccess, sinon le pipeline
  // bloquerait le créateur d'un ticket sans permission Discord.
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
    bot: [],
  },
  antilink: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  antibot: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  protections: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  // Anti-publicité (invitations Discord) : configuration réservée aux
  // administrateurs. Le bot supprime les messages contenant des invitations.
  antipub: {
    user: [PermissionFlagsBits.Administrator],
    bot: [],
  },
  // Anti-contenus sensibles (sites adultes/violents) : configuration réservée
  // aux administrateurs. Le bot supprime les messages contenant des liens.
  antisensitive: {
    user: [PermissionFlagsBits.Administrator],
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
    bot: [],
  },
  welcomestatus: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  welcomepreview: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  // `backup create`/`list` ne font que lire la structure du serveur ; seule
  // la restauration (`load`) recrée salons et rôles, et vérifie alors.
  backup: {
    user: [PermissionFlagsBits.Administrator],
    bot: [],
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
  // Configuration des salons vocaux temporaires : administrateurs. Le bot crée
  // les salons et déplace les membres.
  voicecreate: {
    user: [PermissionFlagsBits.Administrator],
    // La commande crée le salon générateur ; « Déplacer les membres » n'est
    // utilisée que plus tard, par l'écouteur vocal.
    bot: [PermissionFlagsBits.ManageChannels],
  },
  voiceedit: {
    user: [PermissionFlagsBits.Administrator],
    bot: [PermissionFlagsBits.ManageChannels],
  },
  voicelist: {
    user: [PermissionFlagsBits.Administrator],
    bot: [],
  },
  voicedelete: {
    user: [PermissionFlagsBits.Administrator],
    bot: [PermissionFlagsBits.ManageChannels],
  },
  // renamevoice : accès (propriétaire du salon temporaire) vérifié dans la
  // commande ; seule la permission du bot (renommage) est requise.
  renamevoice: {
    user: [],
    bot: [PermissionFlagsBits.ManageChannels],
  },
  // Niveaux : configuration réservée aux administrateurs. Le bot attribue les
  // rôles de récompense (ManageRoles). rank/level/leaderboard restent ouverts.
  levelconfig: {
    user: [PermissionFlagsBits.Administrator],
    bot: [],
  },
  // Captcha à l'arrivée : configuration réservée aux administrateurs. Le bot
  // attribue les rôles, restreint l'accès au salon et expulse les échecs.
  captcha: {
    user: [PermissionFlagsBits.Administrator],
    bot: [],
  },
  // addperm (owner) : crée/attribue un rôle administrateur. Le bot doit donc
  // lui-même posséder Administrateur (impossible d'accorder une permission
  // qu'on ne détient pas). L'accès owner est géré par ownerOnly.
  addperm: {
    user: [],
    bot: [PermissionFlagsBits.Administrator],
  },
};

/**
 * Permissions dont une **fonctionnalité** a besoin *plus tard* — jamais la
 * commande elle-même.
 *
 * Elles ne sont **pas** vérifiées par le pipeline et ne bloquent aucune
 * commande : les configurer reste possible même sans elles. Elles servent à
 * **informer** (commande `help`, panneaux de statut) pour qu'un administrateur
 * sache ce qu'il devra accorder au bot pour que la fonctionnalité opère.
 *
 * C'est la contrepartie de la règle de moindre privilège : ce qui n'est pas
 * exigé à l'exécution de la commande doit au moins rester documenté.
 */
const FEATURE_PERMISSIONS = {
  // La sanction du palier atteint : le type dépend de l'échelle configurée.
  warn: [
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
  ],
  // Création automatique des salons de logs.
  logs: [PermissionFlagsBits.ManageChannels],
  // Restauration d'une sauvegarde (`backup load`).
  backup: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles],
  // Rôle temporaire/vérifié et expulsion en cas d'échec, à l'arrivée.
  captcha: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageChannels],
  // Rôles de récompense attribués au passage de niveau.
  levelconfig: [PermissionFlagsBits.ManageRoles],
  // Rôle automatique attribué à l'arrivée d'un membre.
  setwelcome: [PermissionFlagsBits.ManageRoles],
  // Attribution/retrait des rôles à la réaction.
  reactionrole: [PermissionFlagsBits.ManageRoles],
  // Déplacement d'un membre vers son salon vocal temporaire.
  voicecreate: [PermissionFlagsBits.MoveMembers],
  // Suppression des messages détectés par les protections automatiques.
  antispam: [PermissionFlagsBits.ManageMessages],
  antilink: [PermissionFlagsBits.ManageMessages],
  antipub: [PermissionFlagsBits.ManageMessages],
  // L'anti-contenus sensibles supprime le message et applique un timeout natif.
  antisensitive: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers],
};

/**
 * L'export par défaut reste la table **par commande** : tout le code existant
 * (`permissionsConfig[command.name]`) fonctionne sans changement, et les
 * parcours de clés (audit de parité) n'y voient que des noms de commandes.
 *
 * `FEATURE_PERMISSIONS` est attaché en propriété **non énumérable** pour ne
 * pas être confondu avec une commande.
 */
module.exports = COMMAND_PERMISSIONS;
Object.defineProperty(module.exports, 'FEATURE_PERMISSIONS', {
  value: FEATURE_PERMISSIONS,
  enumerable: false,
});
