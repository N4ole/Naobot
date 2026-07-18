/**
 * Catégories de logs — **sept catégories fixes**, réellement utiles à la
 * modération et à l'administration. Le système n'autorise PAS la création de
 * nouvelles catégories : en ajouter une nécessite une modification explicite
 * de ce fichier (et, si besoin, de la table d'alias de services/logs/logService).
 *
 * Les anciennes clés de logs (warns, surveillance, urgence, arrivees-departs,
 * roles-reactions, captcha, repglobale, messages-*, salons, serveur…) sont
 * fusionnées ou supprimées : la correspondance vit dans LEGACY_ALIASES
 * (services/logs/logService), qui route chaque ancienne clé vers l'une de ces
 * sept catégories (ou l'ignore).
 *
 * Chaque catégorie : { label, description, channelName, emoji }.
 */
module.exports = {
  moderation: {
    label: 'Modération',
    description: 'Kick, ban, unban, mute, unmute, timeout, retrait de timeout, suppressions massives, renommage de salons, commandes de modération',
    channelName: 'moderation-logs',
    emoji: '🛠️',
  },
  sanctions: {
    label: 'Sanctions',
    description: 'Warns, retrait/remise à zéro des warns, rôles de warn automatiques, évolution de la réputation globale, sanctions automatiques',
    channelName: 'sanctions-logs',
    emoji: '📛',
  },
  members: {
    label: 'Arrivées et départs',
    description: 'Arrivée, départ volontaire, expulsion, bannissement, validation et échec du captcha',
    channelName: 'members-logs',
    emoji: '🚪',
  },
  roles: {
    label: 'Rôles',
    description: 'Ajout/retrait de rôle, rôles réactions, rôles automatiques, rôles de niveaux, rôles de sanctions',
    channelName: 'roles-logs',
    emoji: '🎭',
  },
  tickets: {
    label: 'Tickets',
    description: 'Ouverture, fermeture, suppression, transfert, attribution, renommage, transcript',
    channelName: 'tickets-logs',
    emoji: '🎫',
  },
  watch: {
    label: 'Surveillance',
    description: 'Lancement, arrêt, expiration automatique, reprise, statistiques',
    channelName: 'watch-logs',
    emoji: '👁️',
  },
  protections: {
    label: 'Protections',
    description: 'Détection de spam/raid/liens/bots, mode urgence, événements captcha, actions automatiques des protections',
    channelName: 'protection-logs',
    emoji: '🛡️',
  },
};
