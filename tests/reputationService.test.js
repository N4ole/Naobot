const test = require('node:test');
const assert = require('node:assert/strict');
const { computeScore, levelFor, BASE_SCORE } = require('../services/reputation/reputationService');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Instantané neutre : aucun critère ne s'applique fortement. */
function neutralInput(overrides = {}) {
  return {
    ageMs: 10 * DAY_MS,
    memberCount: 10,
    botRatio: null,
    verificationLevel: 1,
    sanctionCount: 0,
    commandCount: 0,
    joinCount: 1,
    shortStayCount: 0,
    recentChannelDeletions: 0,
    recentBans: 0,
    ...overrides,
  };
}

test('levelFor : bornes des niveaux', () => {
  assert.equal(levelFor(100), 'excellent');
  assert.equal(levelFor(80), 'excellent');
  assert.equal(levelFor(79), 'bon');
  assert.equal(levelFor(60), 'bon');
  assert.equal(levelFor(40), 'moyen');
  assert.equal(levelFor(20), 'suspect');
  assert.equal(levelFor(0), 'dangereux');
});

test('computeScore : instantané neutre = score de base', () => {
  const { score, level, breakdown } = computeScore(neutralInput());
  assert.equal(score, BASE_SCORE);
  assert.equal(level, 'moyen');
  assert.ok(Array.isArray(breakdown) && breakdown.length > 0);
});

test('computeScore : serveur ancien, actif et vérifié = bien noté', () => {
  const { score, level } = computeScore(
    neutralInput({
      ageMs: 2 * 365 * DAY_MS,
      memberCount: 5000,
      botRatio: 0.05,
      verificationLevel: 3,
      commandCount: 300,
    }),
  );
  assert.ok(score >= 80, `score ${score} attendu >= 80`);
  assert.equal(level, 'excellent');
});

test('computeScore : signaux dangereux = mal noté', () => {
  const { score, level } = computeScore(
    neutralInput({
      ageMs: 2 * DAY_MS,
      memberCount: 4,
      botRatio: 0.7,
      verificationLevel: 0,
      recentChannelDeletions: 12,
      recentBans: 12,
      joinCount: 4,
      shortStayCount: 3,
    }),
  );
  assert.ok(score < 20, `score ${score} attendu < 20`);
  assert.equal(level, 'dangereux');
});

test('computeScore : le score reste borné entre 0 et 100', () => {
  const worst = computeScore(
    neutralInput({
      ageMs: 0,
      memberCount: 1,
      botRatio: 0.9,
      verificationLevel: 0,
      sanctionCount: 1000,
      recentChannelDeletions: 50,
      recentBans: 50,
      joinCount: 10,
      shortStayCount: 10,
    }),
  );
  assert.ok(worst.score >= 0);
  const best = computeScore(
    neutralInput({
      ageMs: 10 * 365 * DAY_MS,
      memberCount: 100000,
      botRatio: 0.01,
      verificationLevel: 4,
      commandCount: 10000,
    }),
  );
  assert.ok(best.score <= 100);
});

test('computeScore : les départs/retours répétés pénalisent', () => {
  const stable = computeScore(neutralInput({ joinCount: 1 }));
  const churning = computeScore(neutralInput({ joinCount: 4 }));
  assert.ok(churning.score < stable.score);
});
