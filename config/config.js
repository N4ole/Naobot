/**
 * Configuration centrale du bot.
 * Toutes les valeurs proviennent des variables d'environnement (fichier .env)
 * afin de ne jamais committer de secret dans le dépôt.
 */
require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  // Si défini, les commandes slash sont enregistrées sur ce serveur uniquement
  // (utile en développement : mise à jour instantanée).
  guildId: process.env.GUILD_ID || null,
  prefix: process.env.PREFIX || '!',
  locale: process.env.LOCALE || 'fr',
  // Salon de logs de modération. À défaut, un salon nommé "mod-logs" est recherché.
  modLogChannelId: process.env.MODLOG_CHANNEL_ID || null,
  modLogChannelName: 'mod-logs',
  // Nom du rôle appliqué par la commande mute.
  mutedRoleName: process.env.MUTED_ROLE_NAME || 'Muted',
};
