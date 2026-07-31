/**
 * Routeur de l'API REST de l'interface web.
 *
 * **Modulaire et extensible** : les routes ne sont pas écrites ici mais
 * découvertes automatiquement dans `web/api/modules/` (même principe que les
 * loaders de commandes et d'événements). Ajouter une section = déposer un
 * fichier, aucun fichier d'infrastructure à modifier.
 *
 * Chaque module exporte :
 *   { name: 'dashboard', routes: { 'GET /api/dashboard': (ctx) => data, … } }
 * Les segments `:param` sont extraits dans `ctx.params`. Le handler renvoie la
 * charge utile JSON (ou `{ status, body }` pour maîtriser le code HTTP).
 *
 * **Sécurité — invariant du projet** : l'interface est réservée aux **owners
 * du bot**. La vérification est faite **ici, une seule fois, pour toutes les
 * routes** : aucun module ne peut l'oublier. Les administrateurs de serveurs
 * n'ont jamais accès à l'interface.
 */
const fs = require('node:fs');
const path = require('node:path');
const ownerService = require('../../services/owners/ownerService');
const webLog = require('../../services/web/webLog');

const MODULES_DIR = path.join(__dirname, 'modules');
/** Taille maximale d'un corps de requête (protège la mémoire du processus). */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

// ---------------------------------------------------------------------------
// Chargement des modules de routes
// ---------------------------------------------------------------------------

/** Compile un motif « GET /api/x/:id » en matcher. */
function compile(pattern) {
  const [method, template] = pattern.split(/\s+/);
  const segments = template.split('/').filter(Boolean);
  return {
    method: method.toUpperCase(),
    segments,
    match(reqMethod, pathSegments) {
      if (reqMethod !== this.method || pathSegments.length !== segments.length) return null;
      const params = {};
      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(pathSegments[i]);
        else if (segment !== pathSegments[i]) return null;
      }
      return params;
    },
  };
}

/** Découvre et compile les routes de tous les modules (une fois au chargement). */
function loadRoutes() {
  const compiled = [];
  if (!fs.existsSync(MODULES_DIR)) return compiled;
  for (const file of fs.readdirSync(MODULES_DIR).filter((f) => f.endsWith('.js')).sort()) {
    let module;
    try {
      module = require(path.join(MODULES_DIR, file));
    } catch (error) {
      console.error(`[web] Module d'API ignoré (${file}) :`, error.message);
      continue;
    }
    for (const [pattern, handler] of Object.entries(module.routes ?? {})) {
      compiled.push({ ...compile(pattern), handler, module: module.name ?? file.replace(/\.js$/, '') });
    }
  }
  // **Spécificité d'abord** : une route littérale l'emporte toujours sur une
  // route à paramètre de même forme (`/api/guilds/:id/logs` doit gagner contre
  // `/api/guilds/:id/:section`), quel que soit l'ordre de déclaration.
  compiled.sort((a, b) => {
    const params = (route) => route.segments.filter((segment) => segment.startsWith(':')).length;
    return params(a) - params(b);
  });
  console.log(`[web] ${compiled.length} route(s) d'API chargée(s) depuis ${MODULES_DIR}.`);
  return compiled;
}

const routes = loadRoutes();

/** Sections exposées (utile au frontend pour construire sa navigation). */
function sections() {
  return [...new Set(routes.map((route) => route.module))];
}

// ---------------------------------------------------------------------------
// Corps de requête
// ---------------------------------------------------------------------------

/**
 * Lit et analyse un corps JSON, borné en taille.
 * @returns {Promise<{ ok: true, body: object } | { ok: false, code: string }>}
 */
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve({ ok: false, code: 'payload_too_large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({ ok: true, body: {} });
      try {
        return resolve({ ok: true, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        return resolve({ ok: false, code: 'invalid_json' });
      }
    });
    req.on('error', () => resolve({ ok: false, code: 'read_error' }));
  });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Traite une requête d'API.
 * @returns {Promise<boolean>|boolean} true si la requête a été prise en charge
 */
async function handle(req, res, { client, session, pathname, searchParams }) {
  // --- Authentification : session obligatoire ---
  if (!session) {
    json(res, 401, { error: 'unauthenticated' });
    return true;
  }
  // --- Autorisation : owners du bot uniquement, sur TOUTES les routes ---
  if (!ownerService.isOwner(session.userId)) {
    webLog.error(`Accès API refusé (non-owner) : ${session.tag ?? session.userId}`);
    json(res, 403, { error: 'forbidden' });
    return true;
  }

  const pathSegments = pathname.split('/').filter(Boolean);
  const method = req.method.toUpperCase();

  // Une route existe-t-elle pour ce chemin, quelle que soit la méthode ?
  let pathExists = false;
  for (const route of routes) {
    const params = route.match(method, pathSegments);
    if (!params) {
      if (route.match(route.method, pathSegments)) pathExists = true;
      continue;
    }

    let body = {};
    if (method !== 'GET') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) {
        json(res, parsed.code === 'payload_too_large' ? 413 : 400, { error: parsed.code });
        return true;
      }
      body = parsed.body;
    }

    try {
      const result = await route.handler({ client, session, params, searchParams, body, req, res });
      // `undefined` : le handler a déjà répondu lui-même (flux, redirection…).
      if (result === undefined) return true;
      if (result && typeof result === 'object' && 'status' in result && 'body' in result) {
        json(res, result.status, result.body);
        return true;
      }
      json(res, 200, result);
      return true;
    } catch (error) {
      webLog.error(`Erreur API ${method} ${pathname} : ${error.message}`);
      json(res, 500, { error: 'server_error' });
      return true;
    }
  }

  json(res, pathExists ? 405 : 404, { error: pathExists ? 'method_not_allowed' : 'not_found' });
  return true;
}

/**
 * Point d'entrée appelé par le serveur HTTP.
 * @returns {Promise<boolean>|boolean} true si le chemin relève de l'API
 */
function route(req, res, context) {
  if (!context.pathname.startsWith('/api/')) return false;
  // Traitement asynchrone : le serveur sait que la requête est prise en charge.
  handle(req, res, context).catch(() => {
    if (!res.headersSent) json(res, 500, { error: 'server_error' });
  });
  return true;
}

module.exports = { route, json, sections, readJsonBody, MAX_BODY_BYTES };
