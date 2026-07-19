const test = require('node:test');
const assert = require('node:assert/strict');

// Secret de session déterministe AVANT de charger webAuth.
const config = require('../config/config');
config.web.sessionSecret = 'test-secret-web';

// --- Web : permissions Discord ---
const webAuth = require('../services/web/webAuth');

test('webAuth.hasAdminPermission : ADMINISTRATOR ou MANAGE_GUILD', () => {
  assert.equal(webAuth.hasAdminPermission('8'), true); // ADMINISTRATOR (1<<3)
  assert.equal(webAuth.hasAdminPermission('32'), true); // MANAGE_GUILD (1<<5)
  assert.equal(webAuth.hasAdminPermission('40'), true); // les deux
  assert.equal(webAuth.hasAdminPermission('1024'), false); // ViewChannel seul
  assert.equal(webAuth.hasAdminPermission('0'), false);
  assert.equal(webAuth.hasAdminPermission('pasunnombre'), false);
});

// --- Web : sessions signées ---
test('webAuth : session signée valide, falsifiée rejetée', () => {
  const cookie = webAuth.createSession(
    { id: 'u1', username: 'Alice', discriminator: '0', avatar: null, global_name: 'Alice' },
    [{ id: 'g1', owner: false, permissions: '8' }],
    'token',
  );
  const session = webAuth.getSession(cookie);
  assert.ok(session && session.userId === 'u1', 'session valide retrouvée');
  assert.equal(webAuth.getSession(`${cookie}x`), null, 'signature falsifiée → null');
  assert.equal(webAuth.getSession('nimportequoi'), null, 'valeur invalide → null');
});

// --- Web : accès réservé aux owners du bot ---
test('webAuth.canAccessGuild / isBotOwner : owners uniquement', () => {
  const previousOwner = config.ownerId;
  config.ownerId = 'ownerBot';
  const client = { guilds: { cache: new Map([['g1', {}]]) } };
  const ownerSession = { userId: 'ownerBot', guilds: [] };
  const adminSession = { userId: 'u1', guilds: [{ id: 'g1', owner: true, permissions: '8' }] };

  assert.equal(webAuth.isBotOwner(ownerSession), true);
  assert.equal(webAuth.isBotOwner(adminSession), false);
  // Owner du bot : accès à tout serveur où le bot est présent.
  assert.equal(webAuth.canAccessGuild(ownerSession, 'g1', client), true);
  assert.equal(webAuth.canAccessGuild(ownerSession, 'gX', client), false); // bot absent
  // Admin de serveur (non-owner du bot) : accès refusé.
  assert.equal(webAuth.canAccessGuild(adminSession, 'g1', client), false);
  assert.equal(webAuth.canAccessGuild(null, 'g1', client), false);
  // Serveurs accessibles : tous pour l'owner, aucun pour l'admin.
  assert.equal(webAuth.accessibleGuilds(ownerSession, client).length, 1);
  assert.equal(webAuth.accessibleGuilds(adminSession, client).length, 0);
  config.ownerId = previousOwner;
});

// --- Web : statistiques globales (structure) ---
const webService = require('../services/web/webService');

test('webService.globalStats : structure et comptage des serveurs', () => {
  const client = {
    isReady: () => true,
    uptime: 1000,
    ws: { ping: 12 },
    commands: { size: 5 },
    guilds: { cache: new Map([['g1', { memberCount: 10 }]]) },
  };
  const stats = webService.globalStats(client);
  assert.equal(stats.servers, 1);
  assert.equal(typeof stats.tickets, 'number');
  assert.equal(typeof stats.bumps, 'number');
  assert.equal(stats.status.ready, true);
  assert.equal(stats.status.ping, 12);
});
