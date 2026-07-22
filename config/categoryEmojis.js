/**
 * Émojis **logos des catégories de commandes** — volontairement des émojis
 * Discord **standards (Unicode)**, sobres et universels.
 *
 * Règle de marque : les émojis **personnalisés** de NaoBot (`config/emojis.js`)
 * servent à donner de la personnalité aux **messages** du bot (succès, erreurs,
 * confirmations, sanctions, logs, captcha, niveaux, réputation, bienvenue…) et
 * **jamais** de logo permanent de catégorie. Les catégories (commande `help`,
 * menus déroulants, interface web, onglets, navigation) restent en Unicode.
 *
 * Les clés correspondent aux **dossiers** de `commands/` (c'est `command.category`
 * qui est utilisé pour le regroupement). Modifier un logo = changer une valeur
 * ici ; une catégorie absente retombe sur l'émoji de `utils/constants/categories.js`.
 * L'audit des émojis (`services/audit/emojiAuditService.js`) signale tout émoji
 * personnalisé réintroduit comme logo de catégorie.
 */
module.exports = {
  moderation: '🛡️',
  tickets: '🎫',
  watch: '👁️',
  protections: '🔒',
  antipub: '📢',
  antisensitive: '🔞',
  captcha: '🤖',
  bump: '📢',
  reactionRoles: '🏷️',
  levels: '⭐',
  reputation: '📊',
  memberFiles: '🗂️',
  forms: '📋',
  temporaryVoice: '🎙️',
  polls: '📈',
  reminders: '⏰',
  welcome: '👋',
  emergency: '🚨',
  backup: '💾',
  contact: '✉️',
  snipe: '🔍',
  logs: '📄',
  administration: '⚙️',
  dm: '✉️',
  utility: '🧰',
  fun: '🎉',
  owner: '👑',
};
