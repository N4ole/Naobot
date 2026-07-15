const test = require('node:test');
const assert = require('node:assert/strict');
const { remainingCooldown, rankOf, COOLDOWN_MS } = require('../services/bump/bumpService');

test('remainingCooldown : aucun bump précédent = disponible', () => {
  assert.equal(remainingCooldown(null), 0);
  assert.equal(remainingCooldown(undefined), 0);
});

test('remainingCooldown : bump récent = temps restant', () => {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const remaining = remainingCooldown(oneHourAgo, now);
  assert.equal(remaining, COOLDOWN_MS - 60 * 60 * 1000);
});

test('remainingCooldown : cooldown écoulé = 0', () => {
  const now = Date.now();
  const sevenHoursAgo = new Date(now - 7 * 60 * 60 * 1000).toISOString();
  assert.equal(remainingCooldown(sevenHoursAgo, now), 0);
});

test('rankOf : classement décroissant', () => {
  const counts = { a: 5, b: 12, c: 1 };
  assert.deepEqual(rankOf(counts, 'b'), { rank: 1, total: 3 });
  assert.deepEqual(rankOf(counts, 'a'), { rank: 2, total: 3 });
  assert.deepEqual(rankOf(counts, 'c'), { rank: 3, total: 3 });
});

test('rankOf : identifiant absent = non classé', () => {
  assert.deepEqual(rankOf({ a: 5 }, 'z'), { rank: null, total: 1 });
  assert.deepEqual(rankOf({}, 'z'), { rank: null, total: 0 });
});
