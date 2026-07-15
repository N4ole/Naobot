const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCategoryInput } = require('../utils/helpers/logCategoryParser');
const logCategories = require('../utils/constants/logCategories');

test('parseCategoryInput : "tout" retourne toutes les catégories', () => {
  assert.deepEqual(parseCategoryInput('tout').keys, Object.keys(logCategories));
  assert.deepEqual(parseCategoryInput('all').keys, Object.keys(logCategories));
});

test('parseCategoryInput : plusieurs catégories, séparateurs variés', () => {
  assert.deepEqual(parseCategoryInput('sanctions moderation').keys, ['sanctions', 'moderation']);
  assert.deepEqual(parseCategoryInput('sanctions, moderation').keys, ['sanctions', 'moderation']);
});

test('parseCategoryInput : tolère les accents et les doublons', () => {
  assert.deepEqual(parseCategoryInput('modération').keys, ['moderation']);
  assert.deepEqual(parseCategoryInput('messages-supprimés').keys, ['messages-supprimes']);
  assert.deepEqual(parseCategoryInput('roles roles').keys, ['roles']);
});

test('parseCategoryInput : erreurs explicites', () => {
  assert.equal(parseCategoryInput('').error, 'missing');
  assert.equal(parseCategoryInput('   ').error, 'missing');
  const unknown = parseCategoryInput('inexistante');
  assert.equal(unknown.error, 'unknown');
  assert.equal(unknown.token, 'inexistante');
});
