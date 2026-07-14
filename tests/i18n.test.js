const test = require('node:test');
const assert = require('node:assert/strict');
const { t } = require('../utils/helpers/i18n');

test('t : traduit une clé existante', () => {
  assert.equal(typeof t('errors.guildOnly'), 'string');
  assert.notEqual(t('errors.guildOnly'), 'errors.guildOnly');
});

test('t : interpole les variables', () => {
  const result = t('errors.cooldown', { seconds: 5 });
  assert.ok(result.includes('5'));
});

test('t : retourne la clé si la traduction est absente', () => {
  assert.equal(t('cle.totalement.inconnue'), 'cle.totalement.inconnue');
});

test('t : conserve les placeholders sans variable fournie', () => {
  const result = t('errors.cooldown', {});
  assert.ok(result.includes('{seconds}'));
});
