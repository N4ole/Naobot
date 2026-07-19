const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const logService = require('../services/logs/logService');
logService.log = async () => {};

const levelService = require('../services/levels/levelService');
const repository = require('../database/levelRepository');

const G = 'test-guild-levels';
after(() => fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'levels.json'), { force: true }));

const curve = { base: 50, offset: 50 };

test('courbe : XP requis par niveau (exemple 100 / 250 / 500)', () => {
  assert.equal(levelService.xpToReach(1, curve), 100);
  assert.equal(levelService.xpToReach(2, curve), 250);
  assert.equal(levelService.xpToReach(3, curve), 500);
  assert.equal(levelService.xpToReach(0, curve), 0);
});

test('levelForXp : niveau selon l’XP totale', () => {
  assert.equal(levelService.levelForXp(99, curve), 0);
  assert.equal(levelService.levelForXp(100, curve), 1);
  assert.equal(levelService.levelForXp(250, curve), 2);
  assert.equal(levelService.levelForXp(499, curve), 2);
  assert.equal(levelService.levelForXp(500, curve), 3);
});

test('progress : progression dans le niveau courant', () => {
  const p = levelService.progress({ level: 2, xp: 300 }, curve);
  assert.equal(p.into, 50); // 300 - 250
  assert.equal(p.needed, 250); // 500 - 250
  assert.ok(p.ratio > 0 && p.ratio < 1);
});

test('addXp : accumulation, montée de niveau et classement', async () => {
  const c = repository.getConfig(G);
  c.enabled = true;
  repository.saveConfig(G, c);
  const guild = { id: G, name: 'T', roles: { cache: new Map() }, members: { me: { roles: { highest: { position: 10 } } } }, channels: { cache: new Map() } };
  const member = { id: 'u1', user: { id: 'u1', tag: 'u#1', bot: false }, roles: { cache: { has: () => false } } };

  let last;
  for (let i = 0; i < 10; i += 1) last = await levelService.addXp(guild, member, 30, { incMessages: 1 });
  assert.equal(last.level, 2); // 300 XP → niveau 2

  const data = levelService.buildRankData(guild, 'u1');
  assert.equal(data.xp, 300);
  assert.equal(data.messages, 10);
  assert.equal(data.rank, 1);
  assert.equal(data.level, 2);

  const lb = levelService.leaderboard(G);
  assert.equal(lb.length, 1);
  assert.equal(lb[0].userId, 'u1');
  assert.equal(lb[0].rank, 1);
});

test('config par défaut : désactivé, valeurs saines', () => {
  const c = repository.defaultConfig();
  assert.equal(c.enabled, false);
  assert.equal(c.xpPerMessage, 15);
  assert.equal(c.curve.base, 50);
  assert.equal(c.excludeBots, true);
});
