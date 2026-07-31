/**
 * Module d'API **Archives** : serveurs quittés par le bot, dont les données
 * restent consultables.
 *
 * Ces routes sont volontairement **distinctes** de `/api/guilds/:id/*` : ce
 * dernier applique `webAuth.canAccessGuild`, qui exige que le bot soit
 * **présent** sur le serveur. Un serveur archivé échouerait donc toujours. La
 * garde propre aux archives est l'inverse : le serveur doit être connu **et**
 * absent du client (`webArchives.isArchived`).
 *
 * La protection owner reste assurée, comme pour toutes les routes, une seule
 * fois dans `web/api/router.js`.
 */
const webArchives = require('../../../services/web/webArchives');

const notFound = { status: 404, body: { error: 'not_archived' } };

module.exports = {
  name: 'archives',
  routes: {
    /** Compteurs (serveurs archivés / actifs / connus). */
    'GET /api/archives/summary': ({ client }) => webArchives.summary(client),

    /** Liste paginée : recherche `q`, tri `sort` (recent | name | data). */
    'GET /api/archives': ({ client, searchParams }) =>
      webArchives.list(client, {
        query: searchParams?.get('q') || undefined,
        page: Number(searchParams?.get('page')) || 1,
        pageSize: Number(searchParams?.get('pageSize')) || 20,
        sort: searchParams?.get('sort') || 'recent',
      }),

    /** Données retenues d'un serveur quitté (toutes sections). */
    'GET /api/archives/:id': ({ client, params }) => webArchives.detail(client, params.id) ?? notFound,

    /** Journal de modération conservé (mêmes filtres qu'un serveur actif). */
    'GET /api/archives/:id/logs': ({ client, params, searchParams }) =>
      webArchives.logs(client, params.id, {
        category: searchParams?.get('category') || undefined,
        userId: searchParams?.get('userId') || undefined,
        since: searchParams?.get('since') || undefined,
        until: searchParams?.get('until') || undefined,
        query: searchParams?.get('q') || undefined,
      }) ?? notFound,
  },
};
