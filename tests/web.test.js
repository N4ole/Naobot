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

// --- Web : contrôle d'accès par serveur ---
test('webAuth.canAccessGuild : admin autorisé, non-membre du bot refusé', () => {
  const client = { guilds: { cache: new Map([['g1', {}]]) } };
  const adminSession = { userId: 'u1', guilds: [{ id: 'g1', owner: false, permissions: '8' }] };
  const memberSession = { userId: 'u2', guilds: [{ id: 'g1', owner: false, permissions: '1024' }] };

  assert.equal(webAuth.canAccessGuild(adminSession, 'g1', client), true);
  assert.equal(webAuth.canAccessGuild(memberSession, 'g1', client), false); // pas admin
  assert.equal(webAuth.canAccessGuild(adminSession, 'gX', client), false); // bot absent
  assert.equal(webAuth.canAccessGuild(null, 'g1', client), false);
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
