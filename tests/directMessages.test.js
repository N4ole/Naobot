const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

const dmService = require('../services/directMessages/dmService');

after(() => fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'dmSelections.json'), { force: true }));

test('isDirect / dmMode : reflète le flag dm de la commande', () => {
  assert.equal(dmService.isDirect({ dm: 'direct' }), true);
  assert.equal(dmService.isDirect({}), false);
  assert.equal(dmService.isDirect({ dm: 'select' }), false); // seul 'direct' est exécutable sans serveur
  assert.equal(dmService.dmMode({ dm: 'direct' }), 'direct');
  assert.equal(dmService.dmMode({}), null);
});

test('sharedGuilds : serveurs partagés (membre en cache)', () => {
  const g1 = { id: 'g1', name: 'A', members: { cache: new Collection([['u1', {}]]) } };
  const g2 = { id: 'g2', name: 'B', members: { cache: new Collection() } };
  const client = { guilds: { cache: new Collection([['g1', g1], ['g2', g2]]) } };
  const shared = dmService.sharedGuilds(client, 'u1');
  assert.equal(shared.length, 1);
  assert.equal(shared[0].id, 'g1');
});

test('buildServerPicker : menu des serveurs, ou null si aucun', () => {
  const g1 = { id: 'g1', name: 'A', memberCount: 3, members: { cache: new Collection([['u1', {}]]) } };
  const client = { guilds: { cache: new Collection([['g1', g1]]) } };
  const row = dmService.buildServerPicker(client, 'u1');
  const menu = row.toJSON().components[0];
  assert.equal(menu.custom_id, 'servers:pick:u1');
  assert.equal(menu.options.length, 1);
  assert.equal(menu.options[0].value, 'g1');

  const empty = { guilds: { cache: new Collection([['g1', { id: 'g1', name: 'A', members: { cache: new Collection() } }]]) } };
  assert.equal(dmService.buildServerPicker(empty, 'u1'), null);
});

test('persistance : dernière sélection de serveur', () => {
  assert.equal(dmService.getLastGuild('userX'), null);
  dmService.setLastGuild('userX', 'g42');
  assert.equal(dmService.getLastGuild('userX'), 'g42');
});
