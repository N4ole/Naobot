/**
 * Tests des **archives** : un serveur quitté par le bot doit rester consultable
 * dans l'interface web, sans qu'aucune donnée ne soit perdue ni exposée à tort.
 */
const test = require('node:test');
const { after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const webArchives = require('../services/web/webArchives');
const apiRouter = require('../web/api/router');
const ownerService = require('../services/owners/ownerService');

const DATA = path.join(__dirname, '..', 'database', 'data');
const FILES = ['guildStats', 'warns', 'tickets', 'levels', 'logStore', 'serverBans'];
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

function seed() {
  fs.mkdirSync(DATA, { recursive: true });
  const write = (name, content) => fs.writeFileSync(path.join(DATA, `${name}.json`), JSON.stringify(content));
  write('guildStats', {
    g1: { name: 'Actif', joinCount: 1 },
    g2: { name: 'Ancien Serveur', firstJoinedAt: iso(60), lastJoinedAt: iso(60), lastLeftAt: iso(5), joinCount: 1, leaveCount: 1, commandCount: 120, sanctionCount: 4, reputation: { score: 72 } },
    g3: { name: 'Serveur Banni', lastLeftAt: iso(20), joinCount: 1, leaveCount: 1 },
  });
  write('warns', { g2: { u1: [{ id: 'a', reason: 'spam', createdAt: iso(6) }], u2: [{ id: 'b', reason: 'pub', createdAt: iso(7) }] } });
  write('tickets', { g2: { tickets: {}, archived: [], stats: { cat1: { total: 9, closed: 9, totalHandlingMs: 900000 } } } });
  write('levels', { g2: { users: { u1: { xp: 400, level: 3, messages: 80, voiceMs: 0 } } } });
  write('logStore', { g2: [{ at: iso(6), category: 'moderation', title: 'Ban', userTag: 'U#1' }, { at: iso(7), category: 'sanctions', title: 'Warn' }] });
  write('serverBans', { bannedServers: [{ id: 'g3', name: 'Serveur Banni', reason: 'raid', bannedBy: 'OWNER1' }] });
  // Les repositories mettent leur fichier en cache : forcer un rechargement.
  for (const key of Object.keys(require.cache)) if (key.includes(`${path.sep}database${path.sep}`)) delete require.cache[key];
}

function cleanup() {
  for (const name of FILES) fs.rmSync(path.join(DATA, `${name}.json`), { force: true });
}

/** Client Discord factice : seul `g1` est encore présent. */
function fakeClient({ ready = true } = {}) {
  const guild = { id: 'g1', name: 'Actif', memberCount: 5, channels: { cache: { size: 2 } } };
  const cache = new Map([['g1', guild]]);
  cache.reduce = Array.prototype.reduce.bind([guild]);
  return { isReady: () => ready, commands: { size: 1 }, guilds: { cache } };
}

beforeEach(seed);
after(cleanup);

test('archives : un serveur quitté est listé, un serveur actif ne l’est pas', () => {
  const archives = require('../services/web/webArchives');
  const list = archives.list(fakeClient(), {});
  assert.equal(list.ready, true);
  const ids = list.archives.map((a) => a.id);
  assert.ok(ids.includes('g2'), 'le serveur quitté doit apparaître');
  assert.ok(ids.includes('g3'));
  assert.ok(!ids.includes('g1'), 'un serveur toujours actif ne doit jamais être archivé');
  // Tri par départ le plus récent.
  assert.equal(list.archives[0].id, 'g2');
});

test('archives : le volume de données conservé est rapporté', () => {
  const archive = webArchives.list(fakeClient(), {}).archives.find((a) => a.id === 'g2');
  assert.equal(archive.retained.warns, 2);
  assert.equal(archive.retained.tickets, 9);
  assert.equal(archive.retained.members, 1);
  assert.equal(archive.retained.logEntries, 2);
  assert.equal(archive.commandCount, 120);
});

test('archives : un serveur sur liste noire est signalé', () => {
  const archive = webArchives.list(fakeClient(), {}).archives.find((a) => a.id === 'g3');
  assert.equal(archive.banned, true);
  assert.equal(webArchives.list(fakeClient(), {}).archives.find((a) => a.id === 'g2').banned, false);
});

test('archives : recherche et tri', () => {
  const client = fakeClient();
  assert.equal(webArchives.list(client, { query: 'Ancien' }).total, 1);
  assert.equal(webArchives.list(client, { query: 'introuvable' }).total, 0);
  assert.equal(webArchives.list(client, { query: 'g3' }).total, 1, 'la recherche porte aussi sur l’identifiant');
  assert.equal(webArchives.list(client, { sort: 'data' }).archives[0].id, 'g2', 'tri par volume de données');
  assert.equal(webArchives.list(client, { sort: 'name' }).archives[0].name, 'Ancien Serveur');
});

test('archives : détail complet d’un serveur quitté, aucune donnée perdue', () => {
  const detail = webArchives.detail(fakeClient(), 'g2');
  assert.ok(detail, 'le détail doit être disponible');
  assert.equal(detail.name, 'Ancien Serveur');
  assert.equal(detail.stay.commandCount, 120);
  assert.equal(detail.stay.sanctionCount, 4);
  assert.equal(detail.reputation.score, 72, 'la réputation persistée reste lisible');
  assert.equal(detail.moderation.totalWarns, 2);
  assert.equal(detail.tickets.closed, 9, 'les tickets fermés viennent des compteurs persistants');
  assert.equal(detail.levels.leaderboard.length, 1);
  assert.equal(detail.retained.logEntries, 2);
});

test('archives : le journal de modération reste filtrable', () => {
  const client = fakeClient();
  assert.equal(webArchives.logs(client, 'g2', {}).entries.length, 2);
  assert.equal(webArchives.logs(client, 'g2', { category: 'moderation' }).entries.length, 1);
  assert.equal(webArchives.logs(client, 'g2', { query: 'introuvable' }).entries.length, 0);
});

test('archives : un serveur actif ou inconnu n’est jamais servi comme archive', () => {
  const client = fakeClient();
  assert.equal(webArchives.isArchived(client, 'g1'), false, 'serveur actif');
  assert.equal(webArchives.isArchived(client, 'gInconnu'), false, 'serveur jamais vu');
  assert.equal(webArchives.detail(client, 'g1'), null);
  assert.equal(webArchives.detail(client, 'gInconnu'), null);
  assert.equal(webArchives.logs(client, 'g1', {}), null);
});

test('archives : client non prêt → aucune conclusion hâtive', () => {
  // Cache Discord encore vide au démarrage : tout paraîtrait archivé.
  const client = fakeClient({ ready: false });
  const list = webArchives.list(client, {});
  assert.equal(list.ready, false);
  assert.equal(list.total, 0, 'ne jamais présenter les serveurs actifs comme archivés');
  assert.equal(webArchives.detail(client, 'g2'), null);
  assert.equal(webArchives.summary(client).ready, false);
});

test('archives : compteurs de synthèse', () => {
  const summary = webArchives.summary(fakeClient());
  assert.equal(summary.total, 2);
  assert.equal(summary.active, 1);
  assert.equal(summary.known, 3);
});

// --- API --------------------------------------------------------------------

function startApi(sessionUserId) {
  const client = fakeClient();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const session = sessionUserId ? { userId: sessionUserId, tag: sessionUserId } : null;
    if (!apiRouter.route(req, res, { client, session, pathname: url.pathname, searchParams: url.searchParams })) res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, port: server.address().port })));
}

const call = async (port, route) => {
  const response = await fetch(`http://127.0.0.1:${port}${route}`);
  return { status: response.status, data: await response.json().catch(() => null) };
};

test('API archives : routes disponibles pour les owners', async () => {
  const saved = ownerService.isOwner;
  ownerService.isOwner = (id) => id === 'OWNER1';
  const { server, port } = await startApi('OWNER1');
  try {
    assert.equal((await call(port, '/api/archives/summary')).status, 200);
    assert.equal((await call(port, '/api/archives')).data.total, 2);
    assert.equal((await call(port, '/api/archives/g2')).data.name, 'Ancien Serveur');
    assert.equal((await call(port, '/api/archives/g2/logs')).data.entries.length, 2);
    // Un serveur actif n'est pas une archive : 404, jamais les données d'un autre.
    assert.equal((await call(port, '/api/archives/g1')).status, 404);
    assert.equal((await call(port, '/api/archives/gInconnu')).status, 404);
  } finally {
    server.close();
    ownerService.isOwner = saved;
  }
});

test('API archives : réservées aux owners du bot', async () => {
  const saved = ownerService.isOwner;
  ownerService.isOwner = (id) => id === 'OWNER1';
  try {
    const admin = await startApi('ADMIN_SERVEUR');
    for (const route of ['/api/archives', '/api/archives/summary', '/api/archives/g2', '/api/archives/g2/logs']) {
      assert.equal((await call(admin.port, route)).status, 403, `${route} doit être refusée à un non-owner`);
    }
    admin.server.close();

    const anonymous = await startApi(null);
    assert.equal((await call(anonymous.port, '/api/archives')).status, 401);
    anonymous.server.close();
  } finally {
    ownerService.isOwner = saved;
  }
});
