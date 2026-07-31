/**
 * Module d'API **Tableau de bord** : session courante, serveurs et
 * statistiques globales du bot.
 *
 * Consomme uniquement des services partagés (`webStats`, `webAuth`,
 * `webService`) : aucune logique métier n'est réécrite ici.
 */
const webStats = require('../../../services/web/webStats');
const webService = require('../../../services/web/webService');
const webAuth = require('../../../services/web/webAuth');
const ownerService = require('../../../services/owners/ownerService');

module.exports = {
  name: 'dashboard',
  routes: {
    /** Session courante + serveurs accessibles (amorçage du frontend). */
    'GET /api/me': ({ session, client }) => ({
      user: { id: session.userId, tag: session.tag, avatar: session.avatar, botOwner: ownerService.isOwner(session.userId) },
      guilds: webAuth.accessibleGuilds(session, client),
    }),

    /** Toutes les métriques du tableau de bord, en un seul appel. */
    'GET /api/dashboard': ({ client }) => webStats.dashboard(client),

    /** Compatibilité : ancien point d'entrée des statistiques. */
    'GET /api/stats': ({ client }) => webService.globalStats(client),

    /** Liste des serveurs où le bot est présent. */
    'GET /api/guilds': ({ session, client }) => ({ guilds: webAuth.accessibleGuilds(session, client) }),
  },
};
