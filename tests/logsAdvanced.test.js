const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AuditLogEvent } = require('discord.js');

const logStore = require('../database/logStoreRepository');
const logThrottle = require('../services/logs/logThrottle');
const auditLogService = require('../services/logs/auditLogService');
const logService = require('../services/logs/logService');
const settingsRepository = require('../database/logSettingsRepository');

const STORE_FILE = path.join(__dirname, '..', 'database', 'data', 'logStore.json');
const SETTINGS_FILE = path.join(__dirname, '..', 'database', 'data', 'logSettings.json');
const clean = () => { fs.rmSync(STORE_FILE, { force: true }); fs.rmSync(SETTINGS_FILE, { force: true }); };
before(clean);
after(clean);

// --- Journal borné + filtres -------------------------------------------------
test('logStore : append, stats et filtres (catégorie/user/date/recherche)', () => {
  const G = 'g-store';
  logStore.clear(G);
  logStore.append(G, { category: 'moderation', title: 'Salon créé', moderatorId: 'm1', moderatorTag: 'Mod#1' });
  logStore.append(G, { category: 'roles', title: 'Rôle « Staff » créé', userId: 'u1', userTag: 'User#1' });
  logStore.append(G, { category: 'moderation', title: 'Message supprimé', userId: 'u2', userTag: 'User#2' });

  assert.deepEqual(logStore.statsByCategory(G), { moderation: 2, roles: 1 });
  assert.equal(logStore.query(G, { category: 'roles' }).length, 1);
  assert.equal(logStore.query(G, { userId: 'u1' }).length, 1);
  assert.equal(logStore.query(G, { userId: 'm1' }).length, 1); // aussi côté modérateur
  assert.equal(logStore.query(G, { query: 'staff' }).length, 1); // insensible à la casse
  assert.equal(logStore.query(G, { query: 'supprimé' }).length, 1);
  // Plus récentes d'abord.
  assert.equal(logStore.query(G)[0].title, 'Message supprimé');
});

test('logStore : tampon borné (éviction des plus anciennes)', () => {
  const G = 'g-cap';
  logStore.clear(G);
  for (let i = 0; i < logStore.MAX_PER_GUILD + 25; i++) logStore.append(G, { category: 'moderation', title: `#${i}` });
  assert.equal(logStore.all(G).length, logStore.MAX_PER_GUILD);
  // La plus ancienne conservée n'est pas #0.
  assert.notEqual(logStore.all(G)[0].title, '#0');
});

// --- Anti-doublon ------------------------------------------------------------
test('logThrottle : un doublon rapproché est ignoré, une autre signature passe', () => {
  logThrottle._reset();
  assert.equal(logThrottle.shouldLog('a'), true);
  assert.equal(logThrottle.shouldLog('a'), false); // doublon
  assert.equal(logThrottle.shouldLog('b'), true); // signature différente
});

// --- Audit log (modérateur) + cache -----------------------------------------
test('auditLogService : résout l’exécuteur et met en cache (une seule requête)', async () => {
  auditLogService._clearCache();
  let fetches = 0;
  const guild = {
    id: 'g-audit',
    members: { me: { permissions: { has: () => true } } },
    fetchAuditLogs: async () => {
      fetches += 1;
      return { entries: new Map([['e1', { targetId: 'chan1', executor: { id: 'mod1', tag: 'Mod#1' }, reason: 'ménage', createdTimestamp: Date.now(), createdAt: new Date() }]]) };
    },
  };
  const a = await auditLogService.resolveExecutor(guild, { type: AuditLogEvent.ChannelDelete, targetId: 'chan1' });
  assert.equal(a.executor.id, 'mod1');
  assert.equal(a.reason, 'ménage');
  // Deuxième appel : servi par le cache (pas de nouvelle requête).
  await auditLogService.resolveExecutor(guild, { type: AuditLogEvent.ChannelDelete, targetId: 'chan1' });
  assert.equal(fetches, 1);
});

test('auditLogService : null si le bot n’a pas la permission', async () => {
  auditLogService._clearCache();
  const guild = { id: 'g-noperm', members: { me: { permissions: { has: () => false } } }, fetchAuditLogs: async () => { throw new Error('should not be called'); } };
  const a = await auditLogService.resolveExecutor(guild, { type: AuditLogEvent.ChannelDelete, targetId: 'x' });
  assert.equal(a, null);
});

// --- record : persistance + envoi + anti-doublon -----------------------------
test('logService.record : consigne dans le salon et persiste au journal', async () => {
  logThrottle._reset();
  const G = 'g-record';
  settingsRepository.saveSettings(G, { categoryId: 'cat', enabled: { moderation: true }, channels: { moderation: 'chan-mod' }, meta: {} });

  const sent = [];
  const guild = {
    id: G,
    channels: { cache: new Map([['chan-mod', { type: 0, send: async (p) => sent.push(p) }]]) },
  };
  const user = { id: 'u1', tag: 'User#1', displayAvatarURL: () => 'https://x/a.png' };
  const mod = { id: 'mod1', tag: 'Mod#1', displayAvatarURL: () => 'https://x/m.png' };

  // Le salon en cache est de type GuildText (0) ; dispatch l'utilise tel quel.
  await logService.record(guild, 'salons', {
    title: 'Salon créé', emoji: 'thumb', user, moderator: mod, signature: 'once',
  });
  assert.equal(sent.length, 1); // envoyé
  const entries = logStore.query(G);
  assert.equal(entries[0].title, 'Salon créé');
  assert.equal(entries[0].moderatorTag, 'Mod#1');

  // Même signature rapprochée → ignorée (ni envoi, ni persistance).
  await logService.record(guild, 'salons', { title: 'Salon créé', emoji: 'thumb', user, moderator: mod, signature: 'once' });
  assert.equal(sent.length, 1);
});

test('logService.record : ne fait rien si la catégorie est désactivée', async () => {
  logThrottle._reset();
  const G = 'g-disabled';
  settingsRepository.saveSettings(G, { categoryId: null, enabled: { moderation: false }, channels: {}, meta: {} });
  const guild = { id: G, channels: { cache: new Map() } };
  await logService.record(guild, 'salons', { title: 'X', signature: 's' });
  assert.equal(logStore.all(G).length, 0);
});
