/**
 * Libellés français des catégories de commandes (dossiers de commands/).
 *
 * L'ordre ci-dessous est aussi l'ordre d'affichage dans le menu déroulant de
 * la commande help. Ajouter une catégorie = déposer un dossier dans commands/
 * et (facultatif) ajouter une entrée ici pour un libellé/emoji soigné ; sans
 * entrée, le menu affiche le nom du dossier avec un emoji générique.
 */
module.exports = {
  moderation: { label: 'Modération', emoji: '🛡️' },
  protections: { label: 'Protections', emoji: '🚧' },
  antipub: { label: 'Anti-publicité', emoji: '📢' },
  antisensitive: { label: 'Anti-contenus sensibles', emoji: '🔞' },
  captcha: { label: 'Captcha', emoji: '🤖' },
  tickets: { label: 'Tickets', emoji: '🎫' },
  watch: { label: 'Surveillance', emoji: '👁️' },
  snipe: { label: 'Snipe', emoji: '🔍' },
  reactionRoles: { label: 'Rôles réactions', emoji: '📌' },
  levels: { label: 'Niveaux', emoji: '⭐' },
  reputation: { label: 'Réputation', emoji: '🌐' },
  memberFiles: { label: 'Dossiers membres', emoji: '🗂️' },
  temporaryVoice: { label: 'Salons vocaux', emoji: '🔊' },
  welcome: { label: 'Bienvenue', emoji: '👋' },
  forms: { label: 'Formulaires', emoji: '📝' },
  polls: { label: 'Sondages', emoji: '📊' },
  reminders: { label: 'Rappels', emoji: '⏰' },
  bump: { label: 'Bump', emoji: '📣' },
  emergency: { label: 'Mode urgence', emoji: '🚨' },
  backup: { label: 'Sauvegardes', emoji: '💾' },
  contact: { label: 'Contact', emoji: '✉️' },
  logs: { label: 'Logs', emoji: '📄' },
  administration: { label: 'Administration', emoji: '⚙️' },
  dm: { label: 'Messages privés', emoji: '✉️' },
  utility: { label: 'Utilitaire', emoji: '🧰' },
  fun: { label: 'Fun', emoji: '🎉' },
  owner: { label: 'Owner', emoji: '👑' },
};
