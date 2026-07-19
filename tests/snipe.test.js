const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const logService = require('../services/logs/logService');
logService.log = async () => {};

const snipeService = require('../services/snipe/snipeService');
const snipeCategories = require('../utils/constants/snipeCategories');
const repository = require('../database/snipeRepository');

const G = 'test-guild-snipe';
const guild = { id: G, name: 'T' };
after(() => fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'snipe.json'), { force: true }));

test('snipeCategories : sept catégories, chacune avec une commande', () => {
  const keys = Object.keys(snipeCategories);
  assert.deepEqual(keys, ['deleted', 'edited', 'members', 'roles', 'sanctions', 'tickets', 'protections']);
  for (const def of Object.values(snipeCategories)) assert.equal(typeof def.command, 'string');
});

test('record + query : le plus récent en tête, filtres utilisateur et salon', () => {
  snipeService.record(guild, 'deleted', { type: 'delete', userId: 'u1', channelId: 'c1', oldContent: 'a' });
  snipeService.record(guild, 'deleted', { type: 'delete', userId: 'u2', channelId: 'c2', oldContent: 'b' });
  snipeService.record(guild, 'deleted', { type: 'delete', userId: 'u1', channelId: 'c2', oldContent: 'c' });

  const all = snipeService.query(G, 'deleted');
  assert.equal(all.length, 3);
  assert.equal(all[0].oldContent, 'c'); // le plus récent en tête
  assert.equal(snipeService.query(G, 'deleted', { userId: 'u1' }).length, 2);
  assert.equal(snipeService.query(G, 'deleted', { channelId: 'c2' }).length, 2);
  assert.equal(snipeService.query(G, 'deleted', { userId: 'u1', channelId: 'c1' }).length, 1);
});

test('record : catégorie inconnue ignorée', () => {
  snipeService.record(guild, 'inexistante', { type: 'x' });
  assert.equal(snipeService.query(G, 'inexistante').length, 0);
});

test('limites : nombre maximal d’éléments respecté', () => {
  repository.setConfig(G, { maxItems: 3 });
  for (let i = 0; i < 10; i += 1) snipeService.record(guild, 'edited', { type: 'edit', userId: 'u', newContent: `e${i}` });
  const items = snipeService.query(G, 'edited');
  assert.equal(items.length, 3); // borné
  assert.equal(items[0].newContent, 'e9'); // le plus récent conservé
});

test('purge : les événements expirés sont retirés', () => {
  const P = 'test-guild-snipe-purge';
  const g = { id: P, name: 'P' };
  snipeService.record(g, 'roles', { type: 'roleAdd', userId: 'u', extra: { added: ['r1'], removed: [] } });
  assert.equal(snipeService.query(P, 'roles').length, 1);
  // Durée de conservation négative : tout événement est immédiatement expiré.
  repository.setConfig(P, { maxAgeMs: -1 });
  snipeService.purgeAll();
  assert.equal(snipeService.query(P, 'roles').length, 0);
});
