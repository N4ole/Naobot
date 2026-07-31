/**
 * Module d'API **Logs du bot** — journal interne, distinct des logs de
 * modération des serveurs (`/api/guilds/:id/logs`, module `guilds`).
 *
 * Trois flux : commandes exécutées, erreurs internes, événements système.
 * Recherche, filtres et pagination sont assurés par `botLogService`.
 */
const botLogService = require('../../../services/web/botLogService');
const webLog = require('../../../services/web/webLog');

/** Construit les options de requête à partir des paramètres d'URL. */
function filtersFrom(searchParams) {
  const get = (key) => searchParams?.get(key) || undefined;
  return {
    page: Number(get('page')) || 1,
    pageSize: Number(get('pageSize')) || 25,
    query: get('q'),
    guildId: get('guildId'),
    userId: get('userId'),
    type: get('type'),
    event: get('event'),
    command: get('command'),
    status: get('status'),
    since: get('since'),
    until: get('until'),
  };
}

module.exports = {
  name: 'logs',
  routes: {
    /** Compteurs des trois flux + valeurs distinctes pour les listes de filtres. */
    'GET /api/logs/summary': () => ({
      ...botLogService.summary(),
      filters: {
        commands: botLogService.distinct('commands', 'command'),
        errorTypes: botLogService.distinct('errors', 'type'),
        systemEvents: botLogService.distinct('system', 'event'),
      },
    }),

    /** Journal des commandes exécutées (date, utilisateur, serveur, durée, résultat). */
    'GET /api/logs/commands': ({ searchParams }) => botLogService.query('commands', filtersFrom(searchParams)),

    /** Journal des erreurs internes (type, module, fichier, pile complète). */
    'GET /api/logs/errors': ({ searchParams }) => botLogService.query('errors', filtersFrom(searchParams)),

    /** Journal système (démarrage, arrêt, reconnexion, synchronisation…). */
    'GET /api/logs/system': ({ searchParams }) => botLogService.query('system', filtersFrom(searchParams)),

    /** Journal de l'interface web elle-même (connexions, authentifications). */
    'GET /api/logs/web': ({ searchParams }) => ({ entries: webLog.recent(Number(searchParams?.get('limit')) || 80) }),
  },
};
