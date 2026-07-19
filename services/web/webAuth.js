/**
 * Authentification de l'interface web : OAuth2 Discord (via fetch natif, sans
 * dépendance), sessions signées (cookie HMAC → session en mémoire) et contrôle
 * d'accès par serveur.
 *
 * Accès **réservé aux owners du bot** (owner principal du `.env` + owners
 * secondaires en base). Les administrateurs de serveurs n'ont plus accès : toute
 * connexion d'un non-owner est refusée. Séparé de la logique Discord.
 */
const crypto = require('node:crypto');
const config = require('../../config/config');
const ownerService = require('../owners/ownerService');

const DISCORD_API = 'https://discord.com/api';
const PERM_ADMINISTRATOR = 1n << 3n;
const PERM_MANAGE_GUILD = 1n << 5n;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Sessions en mémoire (perdues au redémarrage : reconnexion requise). */
const sessions = new Map();

/**
 * URI de redirection OAuth2 : celle déclarée explicitement (DISCORD_REDIRECT_URI)
 * ou, à défaut, dérivée de l'URL de base (<baseUrl>/callback). DOIT être
 * identique à celle enregistrée dans le portail Discord.
 */
function redirectUri() {
  return config.web.redirectUri || `${config.web.baseUrl}/callback`;
}

/** Chemin de rappel servi par le serveur, extrait de l'URI de redirection. */
function callbackPath() {
  try {
    return new URL(redirectUri()).pathname || '/callback';
  } catch {
    return '/callback';
  }
}

/** URL d'autorisation Discord (scopes identify + guilds). */
function authUrl(state) {
  const params = new URLSearchParams({
    client_id: config.web.clientId ?? '',
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });
  return `${DISCORD_API}/oauth2/authorize?${params.toString()}`;
}

/** Échange un code d'autorisation contre un jeton d'accès. */
async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.web.clientId ?? '',
    client_secret: config.web.clientSecret ?? '',
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
  });
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`token exchange failed (${response.status})`);
  return response.json();
}

async function apiGet(path, accessToken) {
  const response = await fetch(`${DISCORD_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`${path} failed (${response.status})`);
  return response.json();
}

const fetchUser = (accessToken) => apiGet('/users/@me', accessToken);
const fetchUserGuilds = (accessToken) => apiGet('/users/@me/guilds', accessToken);

// --- Sessions ---

function sign(value) {
  const mac = crypto.createHmac('sha256', config.web.sessionSecret ?? 'insecure').update(value).digest('base64url');
  return `${value}.${mac}`;
}

function unsign(signed) {
  if (typeof signed !== 'string' || !signed.includes('.')) return null;
  const index = signed.lastIndexOf('.');
  const value = signed.slice(0, index);
  const expected = sign(value);
  // Comparaison à temps constant.
  const a = Buffer.from(signed);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? value : null;
}

function createSession(user, guilds, accessToken) {
  const id = crypto.randomBytes(24).toString('base64url');
  sessions.set(id, {
    userId: user.id,
    tag: user.global_name || `${user.username}${user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : ''}`,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
    guilds: (guilds ?? []).map((g) => ({ id: g.id, name: g.name, owner: Boolean(g.owner), permissions: String(g.permissions ?? '0') })),
    accessToken,
    createdAt: Date.now(),
  });
  return sign(id);
}

/** Récupère la session à partir de la valeur du cookie signé. */
function getSession(cookieValue) {
  const id = unsign(cookieValue);
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return session;
}

function destroySession(cookieValue) {
  const id = unsign(cookieValue);
  if (id) sessions.delete(id);
}

// --- Permissions ---

function hasAdminPermission(permissionsString) {
  let bits;
  try {
    bits = BigInt(permissionsString);
  } catch {
    return false;
  }
  return (bits & PERM_ADMINISTRATOR) === PERM_ADMINISTRATOR || (bits & PERM_MANAGE_GUILD) === PERM_MANAGE_GUILD;
}

/** true si la session appartient à un owner du bot (seul accès autorisé). */
function isBotOwner(session) {
  return Boolean(session) && ownerService.isOwner(session.userId);
}

/**
 * Accès à un serveur : réservé aux **owners du bot**, et le bot doit être
 * présent sur le serveur. Les administrateurs de serveurs n'ont plus accès.
 */
function canAccessGuild(session, guildId, client) {
  if (!isBotOwner(session)) return false;
  return Boolean(client?.guilds?.cache?.has(guildId)); // le bot doit y être
}

/** Serveurs où le bot est présent (réservés aux owners du bot). */
function accessibleGuilds(session, client) {
  if (!isBotOwner(session) || !client?.guilds?.cache) return [];
  return [...client.guilds.cache.values()]
    .map((guild) => ({ id: guild.id, name: guild.name, icon: guild.iconURL?.({ size: 64 }) ?? null, members: guild.memberCount ?? 0 }));
}

module.exports = {
  SESSION_TTL_MS,
  redirectUri,
  callbackPath,
  authUrl,
  exchangeCode,
  fetchUser,
  fetchUserGuilds,
  createSession,
  getSession,
  destroySession,
  isBotOwner,
  canAccessGuild,
  accessibleGuilds,
  hasAdminPermission,
};
