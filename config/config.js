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
  // Contact affiché aux serveurs bannis pour un éventuel recours
  // (URL de serveur de support, adresse…). Donnée statique globale.
  supportContact: process.env.SUPPORT_CONTACT || null,

  // Interface web (tableau de bord). Données STATIQUES uniquement (jamais de
  // configuration dynamique de serveur). Désactivée par défaut : elle ne
  // démarre que si activée ET correctement configurée (OAuth2 + secret de
  // session). L'identifiant client réutilise CLIENT_ID.
  web: {
    enabled: /^(1|true|on|yes)$/i.test(process.env.WEB_ENABLED || ''),
    port: Number.parseInt(process.env.WEB_PORT || '3000', 10),
    // URL publique de base du site (pour la redirection OAuth2).
    baseUrl: (process.env.WEB_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    clientId: process.env.CLIENT_ID || null,
    clientSecret: process.env.DISCORD_CLIENT_SECRET || null,
    // Secret de signature des sessions (cookies signés HMAC).
    sessionSecret: process.env.WEB_SESSION_SECRET || null,
  },
};
