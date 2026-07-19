const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Neutralise la journalisation (aucun salon Discord réel en test).
const logService = require('../services/logs/logService');
logService.log = async () => {};

const prefixService = require('../services/prefix/prefixService');

const user = (id) => ({ id, tag: `${id}#0001`, displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' });
const G = 'test-guild-prefix';
after(() => fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'prefixes.json'), { force: true }));

test('validate : accepte les préfixes valides', () => {
  assert.deepEqual(prefixService.validate('?'), { ok: true, value: '?' });
  assert.deepEqual(prefixService.validate('nao!'), { ok: true, value: 'nao!' });
  assert.deepEqual(prefixService.validate('  ?  '), { ok: true, value: '?' }); // rogné
});

test('validate : rejette vide, trop long et caractères interdits', () => {
  assert.equal(prefixService.validate('').code, 'empty');
  assert.equal(prefixService.validate('   ').code, 'empty');
  assert.equal(prefixService.validate('troplong').code, 'tooLong');
  assert.equal(prefixService.validate('a b').code, 'forbidden'); // espace
  assert.equal(prefixService.validate('@x').code, 'forbidden'); // mention
  assert.equal(prefixService.validate('a/b').code, 'forbidden'); // slash
});

test('getPrefix : préfixe par défaut tant qu’aucun préfixe personnalisé', () => {
  assert.equal(prefixService.getPrefix(G), prefixService.DEFAULT_PREFIX);
  const conf = prefixService.getConfig(G);
  assert.equal(conf.isCustom, false);
  assert.equal(conf.prefix, prefixService.DEFAULT_PREFIX);
});

test('setPrefix : persistant, immédiat, avec auteur et date', async () => {
  const guild = { id: G, name: 'T' };
  const result = await prefixService.setPrefix(guild, '?', user('admin1'));
  assert.deepEqual({ ok: result.ok, prefix: result.prefix, before: result.before }, { ok: true, prefix: '?', before: prefixService.DEFAULT_PREFIX });
  assert.equal(prefixService.getPrefix(G), '?');
  const conf = prefixService.getConfig(G);
  assert.equal(conf.isCustom, true);
  assert.equal(conf.updatedBy, 'admin1');
  assert.ok(conf.updatedAt);
});

test('setPrefix : refuse un préfixe invalide (sans persister)', async () => {
  const guild = { id: G, name: 'T' };
  await prefixService.setPrefix(guild, '<<', user('admin1'));
  const res = await prefixService.setPrefix(guild, 'a b', user('admin1'));
  assert.equal(res.ok, false);
  assert.equal(res.code, 'forbidden');
});

test('resetPrefix : retour au préfixe par défaut', async () => {
  const guild = { id: G, name: 'T' };
  await prefixService.setPrefix(guild, '?', user('admin1'));
  const reset = await prefixService.resetPrefix(guild, user('admin1'));
  assert.equal(reset.prefix, prefixService.DEFAULT_PREFIX);
  assert.equal(prefixService.getPrefix(G), prefixService.DEFAULT_PREFIX);
  assert.equal(prefixService.getConfig(G).isCustom, false);
});
