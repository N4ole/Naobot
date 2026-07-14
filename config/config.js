/**
 * Configuration centrale du bot.
 * Toutes les valeurs proviennent des variables d'environnement (fichier .env)
 * afin de ne jamais committer de secret dans le dépôt.
 */
require('dotenv').config();

module.exports = {
  // BOT_TOKEN est le nom officiel ; DISCORD_TOKEN reste accepté (héritage).
  token: process.env.BOT_TOKEN || process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  // Si défini, les commandes slash sont enregistrées sur ce serveur uniquement
  // (utile en développement : mise à jour instantanée).
  guildId: process.env.GUILD_ID || null,
  prefix: process.env.PREFIX || '!',
  locale: process.env.LOCALE || 'fr',
  // Repli historique du salon de logs de modération, par NOM uniquement :
  // aucune configuration par serveur ne vit dans le .env (bot multi-serveurs).
  modLogChannelName: 'mod-logs',
  // Nom du rôle appliqué par la commande mute.
  mutedRoleName: process.env.MUTED_ROLE_NAME || 'Muted',
  // Owner principal du bot : tous les privilèges, non supprimable par commande.
  // Les owners secondaires sont gérés via addowner/rmowner (database/data/owners.json).
  ownerId: process.env.OWNER_ID || null,
  // Nom du rôle décoratif attribué automatiquement aux owners sur les serveurs.
  ownerRoleName: process.env.OWNER_ROLE_NAME || 'Owner NaoBot',
};
