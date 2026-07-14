const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration, formatDuration } = require('../utils/helpers/durationParser');

test('parseDuration : unités simples', () => {
  assert.equal(parseDuration('30s'), 30 * 1000);
  assert.equal(parseDuration('10m'), 10 * 60 * 1000);
  assert.equal(parseDuration('2h'), 2 * 60 * 60 * 1000);
  assert.equal(parseDuration('1d'), 24 * 60 * 60 * 1000);
  assert.equal(parseDuration('1w'), 7 * 24 * 60 * 60 * 1000);
});

test('parseDuration : unités combinées', () => {
  assert.equal(parseDuration('1h30m'), 90 * 60 * 1000);
  assert.equal(parseDuration('2d12h'), 60 * 60 * 60 * 1000);
});

test('parseDuration : insensible à la casse et aux espaces', () => {
  assert.equal(parseDuration(' 10M '), 10 * 60 * 1000);
});

test('parseDuration : entrées invalides', () => {
  assert.equal(parseDuration('abc'), null);
  assert.equal(parseDuration('10'), null);
  assert.equal(parseDuration('m10'), null);
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration('0s'), null);
  assert.equal(parseDuration(42), null);
});

test('formatDuration : formatage lisible', () => {
  assert.equal(formatDuration(90 * 60 * 1000), '1 h 30 min');
  assert.equal(formatDuration(24 * 60 * 60 * 1000), '1 j');
  assert.equal(formatDuration(45 * 1000), '45 s');
  assert.equal(formatDuration(0), '0 s');
});
