/**
 * Routeur de l'API REST du tableau de bord (JSON, lecture seule).
 *
 * Toutes les routes exigent une session authentifiée. Les routes rattachées à
 * un serveur vérifient l'accès (admin serveur / propriétaire / owner du bot)
 * via webAuth.canAccessGuild. Les endpoints d'administration (écriture) sont
 * prévus mais non exposés dans cette itération.
 */
const webService = require('../../services/web/webService');
const webAuth = require('../../services/web/webAuth');
const webLog = require('../../services/web/webLog');
const ownerService = require('../../services/owners/ownerService');

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/**
 * @returns {boolean} true si la requête a été prise en charge (chemin /api/*)
 */
function route(req, res, { client, session, pathname }) {
  if (!pathname.startsWith('/api/')) return false;
  if (req.method !== 'GET') {
    json(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  if (!session) {
    json(res, 401, { error: 'unauthenticated' });
    return true;
  }

  const parts = pathname.split('/').filter(Boolean); // ['api', ...]

  // /api/me
  if (parts.length === 2 && parts[1] === 'me') {
    return void json(res, 200, {
      user: { id: session.userId, tag: session.tag, avatar: session.avatar, botOwner: ownerService.isOwner(session.userId) },
      guilds: webAuth.accessibleGuilds(session, client),
    }) || true;
  }

  // /api/stats
  if (parts.length === 2 && parts[1] === 'stats') {
    return void json(res, 200, webService.globalStats(client)) || true;
  }

  // /api/guilds
  if (parts.length === 2 && parts[1] === 'guilds') {
    return void json(res, 200, { guilds: webAuth.accessibleGuilds(session, client) }) || true;
  }

  // /api/logs (owner du bot uniquement — journal global sensible)
  if (parts.length === 2 && parts[1] === 'logs') {
    if (!ownerService.isOwner(session.userId)) {
      json(res, 403, { error: 'forbidden' });
      return true;
    }
    return void json(res, 200, { entries: webLog.recent(80) }) || true;
  }

  // /api/guilds/:id/*
  if (parts.length >= 4 && parts[1] === 'guilds') {
    const guildId = parts[2];
    if (!webAuth.canAccessGuild(session, guildId, client)) {
      json(res, 403, { error: 'forbidden' });
      return true;
    }
    const section = parts[3];
    if (section === 'overview') return void json(res, 200, webService.guildOverview(client, guildId) ?? { error: 'not_found' }) || true;
    if (section === 'moderation') return void json(res, 200, webService.moderation(guildId)) || true;
    if (section === 'tickets') return void json(res, 200, webService.tickets(guildId)) || true;
    if (section === 'profile' && parts[4]) return void json(res, 200, webService.profile(client, guildId, parts[4])) || true;
  }

  json(res, 404, { error: 'not_found' });
  return true;
}

module.exports = { route, json };
