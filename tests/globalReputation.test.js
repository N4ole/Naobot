const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const logService = require('../services/logging/logService');
logService.log = async () => {};

const constants = require('../utils/constants/globalReputation');
const svc = require('../services/reputation/globalReputationService');
const { canViewReputation } = require('../middlewares/reputation/reputationAccess');

// --- Constantes : niveaux de confiance et badges ---
test('trustLevel : seuils de confiance', () => {
  assert.equal(constants.trustLevel(100).key, 'excellent');
  assert.equal(constants.trustLevel(75).key, 'good');
  assert.equal(constants.trustLevel(50).key, 'neutral');
  assert.equal(constants.trustLevel(30).key, 'risky');
  assert.equal(constants.trustLevel(0).key, 'critical');
});

test('badgesFor : casier vierge et récidiviste', () => {
  assert.ok(constants.badgesFor({ stats: {}, guilds: [] }, 100).some((b) => b.includes('Casier vierge')));
  assert.ok(constants.badgesFor({ stats: { warns: 12 }, guilds: [] }, 40).some((b) => b.includes('Récidiviste')));
});

// --- Calcul du score (pur) ---
test('weightForAction : timeout court vs long', () => {
  const w = { timeoutShort: 5, timeoutLong: 10, warn: 3 };
  assert.equal(svc.weightForAction('timeout', 1000, w), 5); // court
  assert.equal(svc.weightForAction('timeout', 48 * 3600 * 1000, w), 10); // long
  assert.equal(svc.weightForAction('warn', null, w), 3);
});

test('computeScore : pénalités et bornes 0-100', () => {
  const config = { weights: constants.DEFAULT_WEIGHTS, positive: { accountAgePerYear: 0, accountAgeMax: 0 } };
  const now = Date.now();
  // warn(-3) + ban(-30) = 67
  assert.equal(svc.computeScore(now, [{ action: 'warn' }, { action: 'ban' }], config), 67);
  // planché à 0
  const many = Array.from({ length: 10 }, () => ({ action: 'ban' }));
  assert.equal(svc.computeScore(now, many, config), 0);
});

// --- Confidentialité ---
test('canViewReputation : self autorisé, tiers refusé sans droit', () => {
  const client = { guilds: { cache: new Map() } };
  assert.equal(canViewReputation({ id: 'a' }, 'a', client), true);
  assert.equal(canViewReputation({ id: 'a' }, 'b', client), false);
});

// --- record + profil + config (avec nettoyage disque) ---
const DATA = path.join(__dirname, '..', 'database', 'data');
after(() => {
  for (const f of ['globalReputation.json', 'moderationHistory.json', 'reputationConfig.json']) {
    fs.rmSync(path.join(DATA, f), { force: true });
  }
});

test('record : score, statistiques et historique tracés', async () => {
  const guild = { id: 'gT' };
  const user = { id: 'ut1', tag: 'T#1', createdTimestamp: Date.now() }; // compte neuf → bonus 0
  const r = await svc.record({ guild, user, moderator: { id: 'm' }, action: 'kick', reason: 'test' });
  assert.equal(r.scoreBefore, 100);
  assert.equal(r.scoreAfter, 85); // -15
  const p = svc.getProfile('ut1');
  assert.equal(p.stats.kicks, 1);
  assert.equal(p.history.length, 1);
  assert.equal(p.history[0].scoreBefore, 100);
  assert.equal(p.history[0].scoreAfter, 85);
  assert.equal(p.history[0].guildId, 'gT');
});

test('setWeight + recalculate : reprice le score', async () => {
  svc.setWeight('kick', 20);
  svc.recalculateAll();
  assert.equal(svc.getProfile('ut1').score, 80); // 100 - 20
});

test('getProfile : utilisateur inconnu → 100 (fiable)', () => {
  assert.equal(svc.getProfile('jamais-vu').score, 100);
});
