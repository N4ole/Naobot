/**
 * Serveur HTTP de l'interface web (module natif `http`, sans dépendance).
 *
 * Sert le frontend statique, l'API REST (web/api), le flux temps réel SSE
 * (web/websocket) et le tunnel d'authentification OAuth2 Discord
 * (/login, /callback, /logout). Démarré au ClientReady si `config.web.enabled`
 * et la configuration OAuth2 est complète. Entièrement séparé de la logique
 * Discord : il ne reçoit que le `client` (lecture seule) pour les statistiques.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../../config/config');
const apiRouter = require('../api/router');
const realtime = require('../websocket/realtime');
const webAuth = require('../../services/web/webAuth');
const webService = require('../../services/web/webService');
const webLog = require('../../services/web/webLog');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const SESSION_COOKIE = 'nao_session';
const STATE_COOKIE = 'nao_state';
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const index = pair.indexOf('=');
      return [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim())];
    }),
  );
}

function setCookie(res, name, value, { maxAge, clear } = {}) {
  const secure = config.web.baseUrl.startsWith('https://');
  const parts = [`${name}=${clear ? '' : encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  if (clear) parts.push('Max-Age=0');
  else if (maxAge) parts.push(`Max-Age=${maxAge}`);
  const existing = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', existing ? [...(Array.isArray(existing) ? existing : [existing]), parts.join('; ')] : parts.join('; '));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(FRONTEND_DIR, rel);
  // Anti-traversée : le fichier doit rester dans FRONTEND_DIR.
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Repli SPA : sert index.html pour les routes inconnues.
      fs.readFile(path.join(FRONTEND_DIR, 'index.html'), (err2, index) => {
        if (err2) return res.writeHead(404).end('Not found');
        res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'] });
        return res.end(index);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  });
}

async function handleCallback(req, res, url, cookies, client) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== cookies[STATE_COOKIE]) {
    webLog.error('OAuth callback invalide (state manquant ou incohérent)');
    return redirect(res, '/?error=state');
  }
  try {
    const token = await webAuth.exchangeCode(code);
    const user = await webAuth.fetchUser(token.access_token);
    const guilds = await webAuth.fetchUserGuilds(token.access_token).catch(() => []);
    const cookie = webAuth.createSession(user, guilds, token.access_token);
    setCookie(res, SESSION_COOKIE, cookie, { maxAge: Math.floor(webAuth.SESSION_TTL_MS / 1000) });
    setCookie(res, STATE_COOKIE, '', { clear: true });
    const tag = user.global_name || user.username;
    webLog.connection(tag);
    webLog.authentication(tag, true);
    return redirect(res, '/');
  } catch (error) {
    webLog.authentication('inconnu', false);
    webLog.error(`OAuth échec : ${error.message}`);
    return redirect(res, '/?error=auth');
  }
}

function createServer(client) {
  // Chemin de rappel OAuth2 (dérivé de DISCORD_REDIRECT_URI, défaut /callback).
  const callbackPath = webAuth.callbackPath();
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, config.web.baseUrl);
      const pathname = url.pathname;
      const cookies = parseCookies(req);
      const session = webAuth.getSession(cookies[SESSION_COOKIE]);

      // --- OAuth2 ---
      if (pathname === '/login') {
        const state = crypto.randomBytes(16).toString('hex');
        setCookie(res, STATE_COOKIE, state, { maxAge: 600 });
        return redirect(res, webAuth.authUrl(state));
      }
      if (pathname === callbackPath) return handleCallback(req, res, url, cookies, client);
      if (pathname === '/logout') {
        webAuth.destroySession(cookies[SESSION_COOKIE]);
        setCookie(res, SESSION_COOKIE, '', { clear: true });
        return redirect(res, '/');
      }

      // --- Temps réel (SSE) ---
      if (pathname === '/events') {
        if (!session) return res.writeHead(401).end();
        return realtime.addClient(res);
      }

      // --- API ---
      if (apiRouter.route(req, res, { client, session, pathname })) return undefined;

      // --- Frontend statique ---
      return serveStatic(res, pathname);
    } catch (error) {
      webLog.error(`Erreur serveur : ${error.message}`);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'server_error' }));
    }
  });
}

/**
 * Démarre l'interface web si elle est activée et correctement configurée.
 * @returns {import('node:http').Server | null}
 */
function start(client) {
  const { enabled, clientId, clientSecret, sessionSecret, port } = config.web;
  if (!enabled) return null;
  if (!clientId || !clientSecret || !sessionSecret) {
    console.warn('[web] Interface web activée mais configuration OAuth2 incomplète (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / WEB_SESSION_SECRET). Serveur non démarré.');
    return null;
  }

  const server = createServer(client);
  server.on('error', (error) => console.error('[web] Erreur du serveur HTTP :', error.message));
  server.listen(port, () => {
    console.log(`[web] Tableau de bord NaoBot démarré sur ${config.web.baseUrl} (port ${port}).`);
    console.log(`[web] OAuth2 — URI de redirection à déclarer dans le portail Discord : ${webAuth.redirectUri()}`);
  });

  // Temps réel : pousse les statistiques globales et relaie le journal web.
  realtime.start({ onTick: (broadcast) => broadcast('stats', webService.globalStats(client)) });
  webLog.subscribe((entry) => realtime.broadcast('log', entry));
  return server;
}

module.exports = { start, createServer };
