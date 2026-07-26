/**
 * Module d'API **Serveurs** : vue par serveur (configuration, modération,
 * tickets, protections, niveaux…) et données globales rattachées à un
 * utilisateur (réputation, dossiers membres).
 *
 * Ces routes existaient avant la refonte modulaire ; elles sont regroupées ici
 * sans changement de contrat, pour ne rien casser côté frontend.
 */
const webService = require('../../../services/web/webService');
const webAuth = require('../../../services/web/webAuth');

/** Sections simples : nom de section → fonction du service. */
const SECTIONS = {
  overview: (client, guildId) => webService.guildOverview(client, guildId) ?? { error: 'not_found' },
  moderation: (_client, guildId) => webService.moderation(guildId),
  tickets: (_client, guildId) => webService.tickets(guildId),
  tempvoice: (_client, guildId) => webService.tempVoice(guildId),
  captcha: (_client, guildId) => webService.captcha(guildId),
  antipub: (_client, guildId) => webService.antipub(guildId),
  snipe: (_client, guildId) => webService.snipe(guildId),
  antisensitive: (_client, guildId) => webService.antisensitive(guildId),
  levels: (_client, guildId) => webService.levels(guildId),
};

/** Refus si le serveur n'est pas accessible à la session (défense en profondeur). */
function guard(session, guildId, client) {
  return webAuth.canAccessGuild(session, guildId, client) ? null : { status: 403, body: { error: 'forbidden' } };
}

module.exports = {
  name: 'guilds',
  routes: {
    /** Section d'un serveur (overview, moderation, tickets, levels…). */
    'GET /api/guilds/:id/:section': ({ client, session, params }) => {
      const denied = guard(session, params.id, client);
      if (denied) return denied;
      const section = SECTIONS[params.section];
      if (!section) return { status: 404, body: { error: 'unknown_section' } };
      return section(client, params.id);
    },

    /** Journal de modération d'un serveur (filtres catégorie/membre/date/recherche). */
    'GET /api/guilds/:id/logs': ({ client, session, params, searchParams }) => {
      const denied = guard(session, params.id, client);
      if (denied) return denied;
      return webService.serverLogs(params.id, {
        category: searchParams?.get('category') || undefined,
        userId: searchParams?.get('userId') || undefined,
        since: searchParams?.get('since') || undefined,
        until: searchParams?.get('until') || undefined,
        query: searchParams?.get('q') || undefined,
      });
    },

    /** Profil d'un membre sur un serveur. */
    'GET /api/guilds/:id/profile/:userId': ({ client, session, params }) => {
      const denied = guard(session, params.id, client);
      if (denied) return denied;
      return webService.profile(client, params.id, params.userId);
    },

    /** Réputation globale : statistiques et pondérations. */
    'GET /api/reputation': () => webService.reputationOverview(),

    /** Réputation globale d'un utilisateur. */
    'GET /api/reputation/:userId': ({ params }) => webService.reputationProfile(params.userId) ?? { status: 404, body: { error: 'not_found' } },

    /** Dossier membre global (inter-serveurs). */
    'GET /api/files/:userId': ({ params }) => webService.memberFile(params.userId) ?? { status: 404, body: { error: 'not_found' } },
  },
};
