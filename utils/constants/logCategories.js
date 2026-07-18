/**
 * Catégories du système de logs.
 *
 * Chaque entrée définit une catégorie activable/désactivable indépendamment :
 * - `label` / `description` : affichage (panneau, statut, menus) ;
 * - `channelName` : salon créé/réutilisé automatiquement à l'activation
 *   (deux catégories peuvent partager un même salon, ex. : messages
 *   supprimés et modifiés) ;
 * - `emoji` : icône dans les interfaces.
 *
 * Ajouter une catégorie = ajouter une entrée ici puis appeler
 * logService.log(guild, '<clé>', embed) depuis le code concerné.
 * Le reste (commande logs, panneau, persistance, création de salon)
 * la prend en compte automatiquement.
 */
module.exports = {
  moderation: {
    label: 'Modération',
    description: 'Actions de modération générales (purge…)',
    channelName: 'logs-moderation',
    emoji: '🛡️',
  },
  sanctions: {
    label: 'Sanctions',
    description: 'Sanctions appliquées via le bot (ban, kick, mute, timeout, warn…)',
    channelName: 'logs-sanctions',
    emoji: '⚖️',
  },
  'messages-supprimes': {
    label: 'Messages supprimés',
    description: 'Suppressions de messages (unitaires et en masse)',
    channelName: 'logs-messages',
    emoji: '🗑️',
  },
  'messages-modifies': {
    label: 'Messages modifiés',
    description: 'Modifications de messages (avant / après)',
    channelName: 'logs-messages',
    emoji: '✏️',
  },
  'arrivees-departs': {
    label: 'Arrivées et départs',
    description: 'Arrivées et départs de membres',
    channelName: 'logs-arrivees-departs',
    emoji: '🚪',
  },
  roles: {
    label: 'Changements de rôles',
    description: 'Rôles ajoutés ou retirés aux membres',
    channelName: 'logs-roles',
    emoji: '🎭',
  },
  salons: {
    label: 'Salons',
    description: 'Salons créés, modifiés ou supprimés',
    channelName: 'logs-salons',
    emoji: '📺',
  },
  serveur: {
    label: 'Serveur',
    description: 'Événements liés au serveur (nom, icône, émojis…)',
    channelName: 'logs-serveur',
    emoji: '🏠',
  },
  commandes: {
    label: 'Commandes exécutées',
    description: 'Commandes du bot exécutées par les membres',
    channelName: 'logs-commandes',
    emoji: '⌨️',
  },
  erreurs: {
    label: 'Erreurs du bot',
    description: 'Erreurs survenues pendant l’exécution des commandes',
    channelName: 'logs-erreurs',
    emoji: '🐞',
  },
  bumps: {
    label: 'Bumps',
    description: 'Système de bump : activation, salon, bumps envoyés, erreurs, invitations',
    channelName: 'logs-bumps',
    emoji: '📣',
  },
  'gestion-serveurs': {
    label: 'Gestion globale des serveurs',
    description: 'Actions globales du bot : départs manuels, liste noire, départs automatiques',
    channelName: 'logs-gestion-serveurs',
    emoji: '🌐',
  },
  tickets: {
    label: 'Tickets',
    description: 'Système de tickets : ouverture, fermeture, réouverture, suppression, renommage, assignation, transfert, membres, erreurs',
    channelName: 'logs-tickets',
    emoji: '🎫',
  },
  surveillance: {
    label: 'Surveillance',
    description: 'Système de surveillance : démarrage, arrêt, reprise, expiration automatique, erreurs',
    channelName: 'logs-surveillance',
    emoji: '👁️',
  },
  warns: {
    label: 'Avertissements',
    description: 'Système de warns : ajout, suppression, remise à zéro, sanction automatique, règles',
    channelName: 'logs-warns',
    emoji: '📛',
  },
  'roles-reactions': {
    label: 'Rôles réactions',
    description: 'Panneaux de rôles réactions : création, modification, suppression, rôles, mode, erreurs',
    channelName: 'logs-roles-reactions',
    emoji: '📌',
  },
  contact: {
    label: 'Contact owners',
    description: 'Communication propriétaires ↔ owners : ouverture, réponse, statut, fermeture, erreurs',
    channelName: 'logs-contact',
    emoji: '✉️',
  },
  protections: {
    label: 'Protections',
    description: 'Protections automatiques : activation, détection de spam, lien supprimé, bot, raid, erreurs',
    channelName: 'logs-protections',
    emoji: '🛡️',
  },
  urgence: {
    label: 'Mode urgence',
    description: 'Verrouillage d’urgence : activation, désactivation, restauration, erreurs',
    channelName: 'logs-urgence',
    emoji: '🚨',
  },
  bienvenue: {
    label: 'Bienvenue',
    description: 'Système de bienvenue : arrivées, rôles automatiques, réponses aux questions, erreurs',
    channelName: 'logs-bienvenue',
    emoji: '👋',
  },
  sauvegardes: {
    label: 'Sauvegardes',
    description: 'Sauvegardes du serveur : création, restauration, suppression, erreurs',
    channelName: 'logs-sauvegardes',
    emoji: '💾',
  },
  formulaires: {
    label: 'Formulaires',
    description: 'Formulaires : création, modification, suppression, soumission, traitement, erreurs',
    channelName: 'logs-formulaires',
    emoji: '📝',
  },
  rappels: {
    label: 'Rappels',
    description: 'Rappels personnels : création, modification, suppression, exécution',
    channelName: 'logs-rappels',
    emoji: '⏰',
  },
  sondages: {
    label: 'Sondages',
    description: 'Sondages : création, fermeture, résultats, erreurs',
    channelName: 'logs-sondages',
    emoji: '📊',
  },
  web: {
    label: 'Interface web',
    description: 'Tableau de bord web : connexions, authentifications, modifications via le site, erreurs',
    channelName: 'logs-web',
    emoji: '🌐',
  },
  vocaux: {
    label: 'Vocaux temporaires',
    description: 'Salons vocaux temporaires : création, suppression, changement de nom, configuration, erreurs',
    channelName: 'logs-vocaux',
    emoji: '🔊',
  },
};
