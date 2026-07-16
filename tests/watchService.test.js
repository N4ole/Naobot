const test = require('node:test');
const assert = require('node:assert/strict');
const watchService = require('../services/watch/watchService');

test('WATCH_DURATION_MS : exactement 7 jours', () => {
  assert.equal(watchService.WATCH_DURATION_MS, 7 * 24 * 60 * 60 * 1000);
});

test('buildWarningEmbed : contient les 4 avertissements obligatoires', () => {
  const embed = watchService.buildWarningEmbed('JohnDoe#0001');
  const json = embed.toJSON();
  // Le nom de la cible figure dans la description.
  assert.ok(json.description.includes('JohnDoe#0001'));
  // 4 champs : cadre d'utilisation, usage abusif, durée limitée, responsabilité.
  assert.equal(json.fields.length, 4);
  const text = JSON.stringify(json).toLowerCase();
  assert.ok(text.includes('modération'));
  assert.ok(text.includes('7 jours'));
  assert.ok(text.includes('responsab'));
  assert.ok(text.includes('abusif') || text.includes('abusive'));
});

test('module : expose l’API attendue', () => {
  for (const fn of ['startWatch', 'finishWatch', 'sweepExpiredWatches', 'recordMessage', 'recordVoice']) {
    assert.equal(typeof watchService[fn], 'function', `manquant : ${fn}`);
  }
});
