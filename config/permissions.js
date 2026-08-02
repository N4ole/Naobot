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
 * Le **moindre privilège vaut aussi pour `user`** : exiger la permission qui
 * gouverne réellement la ressource touchée, jamais `Administrator` par
 * confort. La convention du projet :
 *   - action de modération → la permission de modération correspondante
 *     (`BanMembers`, `KickMembers`, `ModerateMembers`, `ManageMessages`…) ;
 *   - configuration d'une fonctionnalité du bot → `ManageGuild` ;
 *   - configuration portant sur des salons → `ManageChannels` ;
 *   - `Administrator` **uniquement** quand la commande réécrit la structure du
 *     serveur (`backup load`).
 * Deux familles doivent rester cohérentes entre elles : toutes les protections
 * (antispam/antilink/antibot/antipub/antisensitive/protections) et toutes les
 * commandes de tickets exigent la même chose.
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
    // `bulkDelete(n)` récupère d'abord les n derniers messages (lecture de
    // l'historique) puis les supprime en masse : les deux permissions sont
    // utilisées à chaque exécution.
    bot: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory],
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
  // Configuration des tickets (catégories + panneaux) : « Gérer le serveur »,
  // comme ticketstats — c'est de la configuration de serveur, pas une action
  // privilégiée. Ces commandes n'enregistrent qu'une configuration et publient un panneau
  // (un simple message) : le bot n'a besoin d'aucune permission. Les salons de
  // tickets sont créés **plus tard**, à l'ouverture d'un ticket par un membre
  // (voir FEATURE_PERMISSIONS).
  ticketcategory: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  ticketpanel: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
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
  // Anti-publicité (invitations Discord) : même famille que antispam/antilink,
  // donc même exigence — « Gérer le serveur », et non Administrateur.
  antipub: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  // Anti-contenus sensibles (sites adultes/violents) : même famille que les
  // autres protections, donc « Gérer le serveur ».
  antisensitive: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  // Accès (admin OU propriétaire OU owner) contrôlé dans la commande ;
  // seule la permission du bot est vérifiée par le pipeline.
  // Le verrouillage modifie les **permissions des salons** (refus d'envoyer
  // des messages à @everyone) : l'API Discord exige « Gérer les rôles » pour
  // modifier une permission de salon, et non « Gérer les salons » (aucun
  // salon n'est créé, modifié ni supprimé).
  urgence: {
    user: [],
    bot: [PermissionFlagsBits.ManageRoles],
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
  // Seule commande à exiger Administrateur de l'utilisateur : une restauration
  // réécrit la structure entière du serveur.
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
  // Configuration des salons vocaux temporaires : « Gérer les salons » — la
  // permission qui gouverne la ressource configurée. Ces quatre commandes ne font qu'enregistrer une configuration : elles
  // **désignent** un salon générateur existant (sélecteur natif), elles n'en
  // créent, ne renomment ni ne suppriment aucun. La création du salon
  // temporaire, la synchronisation de ses permissions, le déplacement du
  // membre et la suppression à la déconnexion sont **différés** à l'écouteur
  // vocal (voir FEATURE_PERMISSIONS).
  voicecreate: {
    user: [PermissionFlagsBits.ManageChannels],
    bot: [],
  },
  voiceedit: {
    user: [PermissionFlagsBits.ManageChannels],
    bot: [],
  },
  voicelist: {
    user: [PermissionFlagsBits.ManageChannels],
    bot: [],
  },
  // Supprime l'enregistrement du générateur, pas le salon Discord.
  voicedelete: {
    user: [PermissionFlagsBits.ManageChannels],
    bot: [],
  },
  // renamevoice : accès (propriétaire du salon temporaire) vérifié dans la
  // commande ; seule la permission du bot (renommage) est requise.
  renamevoice: {
    user: [],
    bot: [PermissionFlagsBits.ManageChannels],
  },
  // Niveaux : configuration de serveur (« Gérer le serveur »). Les rôles de
  // récompense sont attribués plus tard, au passage de niveau (différé).
  // rank/level/leaderboard restent ouverts à tous.
  levelconfig: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [],
  },
  // Captcha à l'arrivée : configuration de serveur (« Gérer le serveur »).
  // L'attribution des rôles, la restriction du salon et l'expulsion des échecs
  // ont lieu à l'arrivée d'un membre (différé).
  captcha: {
    user: [PermissionFlagsBits.ManageGuild],
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
  // Ouverture d'un ticket par un membre : création du salon (Gérer les salons)
  // puis ajout/retrait de participants, qui modifie ses permissions (Gérer les
  // rôles). Rien de tout cela n'a lieu au moment de la configuration.
  ticketcategory: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles],
  ticketpanel: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles],
  // Salon vocal temporaire : création à l'entrée dans le générateur,
  // synchronisation de ses permissions sur la catégorie (Gérer les rôles),
  // déplacement du membre, puis suppression une fois vide.
  voicecreate: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.MoveMembers],
  // Suppression du message d'appel en mode préfixe (jamais en slash).
  say: [PermissionFlagsBits.ManageMessages],
  // Suppression des messages détectés par les protections automatiques.
  antispam: [PermissionFlagsBits.ManageMessages],
  antilink: [PermissionFlagsBits.ManageMessages],
  antipub: [PermissionFlagsBits.ManageMessages],
  // L'anti-contenus sensibles supprime le message et applique un timeout natif.
  antisensitive: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers],
};

/**
 * Permissions demandées dans le **lien d'invitation** du bot (`invite`).
 *
 * C'est la seule liste qu'un administrateur voit au moment d'ajouter NaoBot :
 * elle doit être exactement l'union de ce que le bot utilise vraiment — ni
 * plus (on ne fait pas cocher une case inutile), ni moins (une permission
 * absente rend la fonctionnalité inopérante sans que personne comprenne
 * pourquoi). `tests/permissionsLeastPrivilege.test.js` vérifie les deux sens.
 */
const INVITE_PERMISSIONS = [
  // Socle : lire un salon, y répondre en embed et joindre un fichier
  // (transcripts de tickets, pièces jointes de `say`).
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  // Modération.
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  // Structure du serveur : rôles (mute, récompenses, permissions de salon),
  // salons (tickets, logs, surveillance, vocaux temporaires) et déplacement
  // vers un salon vocal temporaire.
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
  // Invitations du bump, et résolution du modérateur responsable dans les
  // logs (`auditLogService`, `antibotService`, capture des bans).
  PermissionFlagsBits.CreateInstantInvite,
  PermissionFlagsBits.ViewAuditLog,
];

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
Object.defineProperty(module.exports, 'INVITE_PERMISSIONS', {
  value: INVITE_PERMISSIONS,
  enumerable: false,
});
