const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const logService = require('../services/logs/logService');
logService.log = async () => {};

const antisensitiveService = require('../services/antisensitive/antisensitiveService');
const repository = require('../database/antisensitiveRepository');

const user = (id) => ({ id, tag: `${id}#0001`, displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' });
const G = 'test-guild-antisensitive';
after(() => fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'antisensitive.json'), { force: true }));

const emptyConfig = { enabled: true, exemptChannels: [], exemptRoles: [], exemptUsers: [], blockedDomains: [], allowedDomains: [] };

test('analyze : détecte les domaines sensibles et leurs sous-domaines', () => {
  assert.equal(antisensitiveService.analyze('lien xvideos.com/abc', emptyConfig).category, 'adult');
  assert.equal(antisensitiveService.analyze('va sur m.xhamster.com', emptyConfig).category, 'adult');
  assert.equal(antisensitiveService.analyze('gore bestgore.fun/x', emptyConfig).category, 'gore');
});

test('analyze : révèle les liens obfusqués', () => {
  assert.ok(antisensitiveService.analyze('regarde xvideos . com', emptyConfig));
  assert.ok(antisensitiveService.analyze('xvideos(dot)com', emptyConfig));
});

test('analyze : ignore les domaines ordinaires', () => {
  assert.equal(antisensitiveService.analyze('coucou example.com', emptyConfig), null);
  assert.equal(antisensitiveService.analyze('https://github.com/x', emptyConfig), null);
  assert.equal(antisensitiveService.analyze('', emptyConfig), null);
});

test('analyze : domaines autorisés (whitelist) et bloqués (configurable)', () => {
  const withAllow = { ...emptyConfig, allowedDomains: ['pornhub.com'] };
  assert.equal(antisensitiveService.analyze('https://pornhub.com/x', withAllow), null);
  const withBlock = { ...emptyConfig, blockedDomains: ['badsite.net'] };
  assert.equal(antisensitiveService.analyze('badsite.net/x', withBlock).category, 'shock');
});

test('setEnabled / whitelist : persistants', async () => {
  const guild = { id: G, name: 'T' };
  assert.equal(antisensitiveService.isEnabled(G), false);
  await antisensitiveService.setEnabled(guild, true, user('admin1'));
  assert.equal(antisensitiveService.isEnabled(G), true);
  assert.equal(repository.getConfig(G).lastModifiedBy, 'admin1');

  const add = await antisensitiveService.addExemptChannel(guild, { id: 'c1' }, user('admin1'));
  assert.equal(add.added, true);
  assert.deepEqual(antisensitiveService.listExemptChannels(G), ['c1']);
  const rm = await antisensitiveService.removeExemptChannel(guild, 'c1', user('admin1'));
  assert.equal(rm.removed, true);
});

test('checkOutgoing : bloque selon l\'état et les exemptions', async () => {
  const guild = { id: G, name: 'T' };
  await antisensitiveService.setEnabled(guild, false, user('admin1'));
  assert.equal(antisensitiveService.checkOutgoing(guild, { id: 'c' }, 'xvideos.com'), null);
  await antisensitiveService.setEnabled(guild, true, user('admin1'));
  assert.ok(antisensitiveService.checkOutgoing(guild, { id: 'c' }, 'xvideos.com'));
  assert.equal(antisensitiveService.checkOutgoing(guild, { id: 'c' }, 'du texte'), null);
  await antisensitiveService.addExemptChannel(guild, { id: 'nsfw' }, user('admin1'));
  assert.equal(antisensitiveService.checkOutgoing(guild, { id: 'nsfw' }, 'xvideos.com'), null);
});
