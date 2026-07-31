/**
 * Tests de la refonte de l'interface web : journal interne du bot, agrégation
 * du tableau de bord, analyse, messagerie et routeur d'API modulaire.
 *
 * L'invariant le plus important est vérifié explicitement : l'interface est
 * **strictement réservée aux owners du bot**.
 */
const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const botLogService = require('../services/web/botLogService');
const webNotifier = require('../services/web/webNotifier');
const webStats = require('../services/web/webStats');
const webAnalytics = require('../services/web/webAnalytics');
const webMessaging = require('../services/web/webMessaging');
const apiRouter = require('../web/api/router');
const ownerService = require('../services/owners/ownerService');
const webAuth = require('../services/web/webAuth');

const DATA = path.join(__dirname, '..', 'database', 'data');
const CONTACT_FILE = path.join(DATA, 'contact.json');
after(() => fs.rmSync(CONTACT_FILE, { force: true }));

// --- Journal interne du bot ------------------------------------------------

test('botLogService : enregistre commandes, erreurs et événements système', () => {
  botLogService.reset();
  botLogService.recordCommand({ command: 'ban', user: { id: 'u1', tag: 'Alice' }, guild: { id: 'g1', name: 'S' }, channel: { id: 'c1', name: 'general' }, type: 'slash', durationMs: 12, ok: true });
  botLogService.recordCommand({ command: 'kick', user: { id: 'u2', tag: 'Bob' }, guild: { id: 'g1', name: 'S' }, type: 'prefix', durationMs: 4, ok: false, error: 'boom' });
  botLogService.recordError({ type: 'commandError', error: new Error('cassé'), module: 'm', command: 'ban' });
  botLogService.recordSystem('startup', 'Bot démarré');

  const summary = botLogService.summary();
  assert.equal(summary.commands.total, 2);
  assert.equal(summary.commands.errors, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.system, 1);

  const command = botLogService.query('commands').entries.find((entry) => entry.command === 'ban');
  assert.equal(command.type, 'slash');
  assert.equal(command.durationMs, 12);
  assert.equal(command.guild.name, 'S');

  const error = botLogService.query('errors').entries[0];
  assert.equal(error.message, 'cassé');
  assert.ok(error.stack, 'la pile complète doit être conservée (copie depuis l’interface)');
  assert.ok(error.file, 'le fichier d’origine doit être extrait de la pile');
});

test('botLogService : filtres, recherche et pagination', () => {
  botLogService.reset();
  for (let i = 0; i < 12; i += 1) {
    botLogService.recordCommand({ command: i % 2 ? 'ban' : 'help', user: { id: `u${i}`, tag: `U${i}` }, guild: { id: 'g1', name: 'S' }, type: 'slash', durationMs: i, ok: i % 3 !== 0 });
  }
  assert.equal(botLogService.query('commands', { command: 'ban' }).total, 6);
  assert.equal(botLogService.query('commands', { status: 'error' }).total, 4);
  assert.equal(botLogService.query('commands', { query: 'help' }).total, 6);
  assert.equal(botLogService.query('commands', { guildId: 'inexistant' }).total, 0);

  const paged = botLogService.query('commands', { pageSize: 5, page: 2 });
  assert.equal(paged.entries.length, 5);
  assert.equal(paged.pages, 3);
  assert.equal(paged.page, 2);
  assert.equal(botLogService.query('commands').entries[0].id, 12, 'les plus récentes d’abord');
});

test('botLogService : les tampons restent bornés (bot public, mémoire maîtrisée)', () => {
  botLogService.reset();
  for (let i = 0; i < botLogService.LIMITS.system + 50; i += 1) botLogService.recordSystem('tick', `n${i}`);
  assert.equal(botLogService.summary().system, botLogService.LIMITS.system);
});

test('webNotifier : publie vers les abonnés sans jamais lever', () => {
  const received = [];
  const unsubscribeOk = webNotifier.subscribe((n) => received.push(n.type));
  const unsubscribeKo = webNotifier.subscribe(() => { throw new Error('abonné défaillant'); });
  botLogService.reset();
  botLogService.recordSystem('startup', 'ok'); // relayé par botLogService
  webNotifier.publish('guildJoin', { guild: { id: 'g1', name: 'S' } });
  assert.ok(received.includes('system'));
  assert.ok(received.includes('guildJoin'));
  unsubscribeOk();
  unsubscribeKo();
});

// --- Statistiques et analyse ------------------------------------------------

function fakeClient() {
  const guild = { id: 'g1', name: 'S', memberCount: 100, channels: { cache: { size: 20 } } };
  const cache = new Map([['g1', guild]]);
  cache.reduce = Array.prototype.reduce.bind([guild]);
  return { isReady: () => true, uptime: 1000, ws: { ping: 30 }, commands: { size: 118 }, guilds: { cache } };
}

test('webStats : agrège tous les compteurs demandés au tableau de bord', () => {
  const data = webStats.dashboard(fakeClient());
  assert.equal(data.discord.servers, 1);
  assert.equal(data.discord.users, 100);
  assert.equal(data.discord.channels, 20);
  for (const key of ['tickets', 'moderation', 'engagement', 'protections', 'system', 'botLogs']) {
    assert.ok(key in data, `rubrique ${key} attendue`);
  }
  for (const key of ['open', 'closed']) assert.equal(typeof data.tickets[key], 'number');
  for (const key of ['warns', 'sanctions', 'timeouts', 'bans']) assert.equal(typeof data.moderation[key], 'number');
  for (const key of ['bumps', 'tempVoiceActive', 'captchas']) assert.equal(typeof data.engagement[key], 'number');
  for (const key of ['antispam', 'antilink', 'antipub', 'antisensitive']) assert.equal(typeof data.protections[key], 'number');
  assert.equal(typeof data.system.memory.rssBytes, 'number');
  assert.equal(typeof data.system.cpu.percent, 'number');
  assert.equal(data.system.ping, 30);
  assert.ok(data.system.version, 'la version du bot doit être exposée');
});

test('webStats : le cache évite de recalculer les agrégats coûteux', () => {
  webStats.invalidate();
  const first = webStats.ticketCounts();
  assert.strictEqual(webStats.ticketCounts(), first, 'même référence tant que le cache est valide');
  webStats.invalidate();
  assert.notStrictEqual(webStats.ticketCounts(), first, 'recalcul après invalidation');
});

test('webAnalytics : séries journalières et répartitions', () => {
  const events = [
    { action: 'warn', date: new Date().toISOString() },
    { action: 'ban', date: new Date().toISOString() },
    { action: 'warn', date: new Date(Date.now() - 86400000).toISOString() },
  ];
  const serie = webAnalytics.dailySeries(events, (e) => e.date, 3);
  assert.equal(serie.labels.length, 3);
  assert.equal(serie.series[0].values.reduce((a, b) => a + b, 0), 3);

  const grouped = webAnalytics.dailySeries(events, (e) => e.date, 3, (e) => e.action);
  assert.deepEqual(grouped.series.map((s) => s.name).sort(), ['ban', 'warn']);

  // Les événements hors fenêtre sont ignorés.
  const old = webAnalytics.dailySeries([{ date: new Date(Date.now() - 40 * 86400000).toISOString() }], (e) => e.date, 3);
  assert.equal(old.series[0].values.reduce((a, b) => a + b, 0), 0);

  assert.deepEqual(webAnalytics.distribution({ a: 5, b: 12, c: 1 }, 2).items, [{ label: 'b', value: 12 }, { label: 'a', value: 5 }]);
});

test('webAnalytics : vue complète et échantillonnage de performance', () => {
  const client = fakeClient();
  webAnalytics.samplePerformance(client);
  const overview = webAnalytics.overview({ days: 7 });
  for (const key of ['activity', 'moderation', 'protections', 'tickets', 'bumps', 'levels', 'performance']) {
    assert.ok(key in overview, `section ${key} attendue`);
  }
  assert.ok(overview.performance.samples >= 1);
  assert.equal(overview.performance.cpu.series[0].values.length, overview.performance.samples);
  assert.ok(Array.isArray(overview.activity.perHour.series[0].values));
  assert.equal(overview.activity.perHour.series[0].values.length, 24);
});

// --- Messagerie -------------------------------------------------------------

test('webMessaging : validation et assainissement des pièces jointes', () => {
  assert.deepEqual(webMessaging.decodeAttachment(null), { ok: true, attachment: null });
  const decoded = webMessaging.decodeAttachment({ name: '../../etc/passwd', data: Buffer.from('abc').toString('base64') });
  assert.equal(decoded.attachment.name, 'passwd', 'le chemin doit être retiré du nom de fichier');
  assert.equal(decoded.attachment.data.toString(), 'abc');
  assert.equal(webMessaging.decodeAttachment({ name: 'x', data: 'A'.repeat(12_000_000) }).code, 'attachmentTooLarge');
  assert.equal(webMessaging.decodeAttachment({ name: 'x', data: 42 }).code, 'invalidAttachment');
});

test('webMessaging : envoi délégué à contactService, historique et recherche', async () => {
  fs.rmSync(CONTACT_FILE, { force: true });
  const sent = [];
  const guild = {
    id: 'g1', name: 'Serveur Test', memberCount: 3, channels: { cache: new Map() },
    fetchOwner: async () => ({ id: 'go1', user: { id: 'go1', tag: 'Proprio#1', send: async (p) => sent.push(p) } }),
  };
  const client = { user: { id: 'bot', username: 'NaoBot' }, users: { fetch: async () => ({ send: async () => {} }) }, guilds: { cache: new Map([['g1', guild]]) } };
  const author = { id: 'ow1', tag: 'Owner#1' };

  assert.equal((await webMessaging.send(client, author, { guildId: '', title: 't', message: 'm' })).code, 'missingGuild');
  assert.equal((await webMessaging.send(client, author, { guildId: 'g1', title: '', message: 'm' })).code, 'missingTitle');
  assert.equal((await webMessaging.send(client, author, { guildId: 'g1', title: 't', message: '' })).code, 'missingMessage');
  assert.equal((await webMessaging.send(client, author, { guildId: 'inconnu', title: 't', message: 'm' })).code, 'guildNotFound');

  const result = await webMessaging.send(client, author, { guildId: 'g1', title: 'Annonce', message: 'Bonjour' });
  assert.equal(result.ok, true);
  assert.equal(sent.length, 1, 'un MP doit partir vers le propriétaire du serveur');
  assert.match(sent[0].embeds[0].data.footer.text, /Message officiel de l['’]équipe NaoBot/);

  const list = webMessaging.list({});
  assert.equal(list.total, 1);
  assert.equal(list.conversations[0].guildName, 'Serveur Test');
  assert.equal(webMessaging.list({ query: 'Annonce' }).total, 1);
  assert.equal(webMessaging.list({ query: 'introuvable' }).total, 0);
  assert.equal(webMessaging.conversation(result.conversation.id).messages.length, 1);
  assert.equal(webMessaging.conversation('CONTACT-999999'), null);
  assert.equal(webMessaging.summary().total, 1);
  fs.rmSync(CONTACT_FILE, { force: true });
});

// --- API : sécurité et routage ---------------------------------------------

/** Démarre un serveur d'API éphémère avec la session fournie. */
function startApi(sessionUserId) {
  const client = fakeClient();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const session = sessionUserId ? { userId: sessionUserId, tag: sessionUserId } : null;
    if (!apiRouter.route(req, res, { client, session, pathname: url.pathname, searchParams: url.searchParams })) {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, port: server.address().port })));
}

async function call(port, route, { method = 'GET', body } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

test('API : interface strictement réservée aux owners du bot', async () => {
  const savedIsOwner = ownerService.isOwner;
  ownerService.isOwner = (id) => id === 'OWNER1';
  try {
    // Administrateur de serveur (non-owner du bot) : refusé sur TOUTES les routes.
    const admin = await startApi('ADMIN_SERVEUR');
    for (const route of ['/api/me', '/api/dashboard', '/api/logs/commands', '/api/analytics', '/api/messaging/conversations', '/api/settings', '/api/guilds/g1/overview']) {
      assert.equal((await call(admin.port, route)).status, 403, `${route} doit être refusée à un non-owner`);
    }
    assert.equal((await call(admin.port, '/api/messaging/send', { method: 'POST', body: { guildId: 'g1', title: 't', message: 'm' } })).status, 403);
    admin.server.close();

    // Non authentifié : 401 partout.
    const anonymous = await startApi(null);
    assert.equal((await call(anonymous.port, '/api/dashboard')).status, 401);
    assert.equal((await call(anonymous.port, '/api/me')).status, 401);
    anonymous.server.close();
  } finally {
    ownerService.isOwner = savedIsOwner;
  }
});

test('API : routage modulaire, spécificité des routes et codes HTTP', async () => {
  const savedIsOwner = ownerService.isOwner;
  const savedAccess = webAuth.canAccessGuild;
  ownerService.isOwner = (id) => id === 'OWNER1';
  webAuth.canAccessGuild = () => true;
  const { server, port } = await startApi('OWNER1');
  try {
    for (const route of ['/api/me', '/api/dashboard', '/api/logs/summary', '/api/analytics/levels', '/api/messaging/summary', '/api/settings']) {
      assert.equal((await call(port, route)).status, 200, `${route} doit répondre`);
    }

    // Une route littérale l'emporte sur une route à paramètre de même forme.
    const logs = await call(port, '/api/guilds/g1/logs');
    assert.equal(logs.status, 200);
    assert.ok('categories' in logs.data, '/api/guilds/:id/logs doit gagner sur /:section');
    assert.equal((await call(port, '/api/guilds/g1/xyz')).data.error, 'unknown_section');

    // 404 (chemin inconnu) vs 405 (méthode non autorisée sur un chemin connu).
    assert.equal((await call(port, '/api/inconnu')).status, 404);
    assert.equal((await call(port, '/api/logs/summary', { method: 'POST', body: {} })).status, 405);

    // Corps JSON invalide → 400 (jamais une erreur 500).
    const bad = await fetch(`http://127.0.0.1:${port}/api/messaging/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    assert.equal(bad.status, 400);

    // Toutes les sections attendues sont exposées (navigation du frontend).
    const { data } = await call(port, '/api/settings/sections');
    for (const section of ['dashboard', 'guilds', 'logs', 'analytics', 'messaging', 'settings']) {
      assert.ok(data.sections.includes(section), `section ${section} attendue`);
    }
  } finally {
    server.close();
    ownerService.isOwner = savedIsOwner;
    webAuth.canAccessGuild = savedAccess;
  }
});

test('API : les réglages n’exposent aucun secret', async () => {
  const savedIsOwner = ownerService.isOwner;
  ownerService.isOwner = () => true;
  const { server, port } = await startApi('OWNER1');
  try {
    const { data } = await call(port, '/api/settings');
    const serialized = JSON.stringify(data);
    assert.ok(!serialized.includes('clientSecret'), 'aucun secret OAuth2 ne doit fuiter');
    assert.ok(!serialized.includes('sessionSecret'), 'aucun secret de session ne doit fuiter');
    assert.equal(typeof data.web.oauthConfigured, 'boolean');
  } finally {
    server.close();
    ownerService.isOwner = savedIsOwner;
  }
});
