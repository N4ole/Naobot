/**
 * Module d'API **Messagerie** : conversations owners du bot ↔ propriétaires de
 * serveurs. L'envoi est **délégué** à `contactService` via `webMessaging` : le
 * site emprunte exactement le même chemin que les commandes Discord
 * `contactowner` / `respond`, sans dupliquer la logique d'envoi.
 */
const webMessaging = require('../../../services/web/webMessaging');
const webLog = require('../../../services/web/webLog');

/** Codes d'erreur du service → statut HTTP. */
const STATUS_BY_CODE = {
  guildNotFound: 404,
  notFound: 404,
  ownerUnreachable: 502,
  dmClosed: 502,
  attachmentTooLarge: 413,
  invalidAttachment: 400,
  missingGuild: 400,
  missingTitle: 400,
  missingMessage: 400,
  invalidStatus: 400,
};

function failure(result) {
  return { status: STATUS_BY_CODE[result.code] ?? 400, body: { error: result.code } };
}

module.exports = {
  name: 'messaging',
  routes: {
    /** Compteurs (total, par statut, en attente de réponse). */
    'GET /api/messaging/summary': () => webMessaging.summary(),

    /** Liste paginée : filtres `status`/`guildId`, recherche `q`. */
    'GET /api/messaging/conversations': ({ searchParams }) =>
      webMessaging.list({
        page: Number(searchParams?.get('page')) || 1,
        pageSize: Number(searchParams?.get('pageSize')) || 20,
        status: searchParams?.get('status') || undefined,
        guildId: searchParams?.get('guildId') || undefined,
        query: searchParams?.get('q') || undefined,
      }),

    /** Fil complet d'une conversation. */
    'GET /api/messaging/conversations/:id': ({ params }) =>
      webMessaging.conversation(params.id) ?? { status: 404, body: { error: 'not_found' } },

    /**
     * Envoie un message officiel au propriétaire d'un serveur.
     * Corps : { guildId, title, message, attachment?: { name, data(base64) },
     *           conversationId? }
     */
    'POST /api/messaging/send': async ({ client, session, body }) => {
      const author = { id: session.userId, tag: session.tag };
      const result = await webMessaging.send(client, author, body);
      if (!result.ok) return failure(result);
      webLog.record('messagerie', `${session.tag} → serveur ${body.guildId} : ${String(body.title).slice(0, 80)}`);
      return { ok: true, conversationId: result.conversation.id };
    },

    /** Change le statut d'une conversation (ouverte / traitée / fermée). */
    'POST /api/messaging/conversations/:id/status': async ({ client, session, params, body }) => {
      const result = await webMessaging.setStatus(client, params.id, String(body.status ?? ''), { id: session.userId, tag: session.tag });
      if (!result.ok) return failure(result);
      return { ok: true, status: result.conversation.status };
    },
  },
};
