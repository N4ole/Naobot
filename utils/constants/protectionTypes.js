/**
 * Types de protections automatiques, activables indépendamment par serveur.
 *
 * Ajouter une protection = une entrée ici (+ un service de détection et son
 * branchement dans events/protections) ; la commande protections, les
 * bascules et la persistance la prennent en compte automatiquement.
 */
module.exports = {
  antispam: {
    key: 'antispam',
    label: 'Anti-spam',
    emoji: '🚫',
    description: 'Détection intelligente du spam (flood, répétitions, mentions, raids…)',
    statKey: 'spamDetections',
  },
  antilink: {
    key: 'antilink',
    label: 'Anti-link',
    emoji: '🔗',
    description: 'Suppression des liens externes, invitations, raccourcisseurs et domaines suspects',
    statKey: 'linksRemoved',
  },
  antibot: {
    key: 'antibot',
    label: 'Anti-bot',
    emoji: '🤖',
    description: 'Surveillance des arrivées de bots et détection des raids de bots',
    statKey: 'botsJoined',
  },
};
