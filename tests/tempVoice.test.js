const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// --- Variables du nom (pur) ---
const tempVoiceVariables = require('../utils/constants/tempVoiceVariables');

test('tempVoiceVariables : rendu du nom (variables, nettoyage, repli)', () => {
  const ctx = { member: { displayName: 'Alex' }, user: { username: 'alex_92' }, counter: 3 };
  assert.equal(tempVoiceVariables.renderChannelName('Salon de {user}', ctx), 'Salon de Alex');
  assert.equal(tempVoiceVariables.renderChannelName('🔊 {username}', ctx), '🔊 alex_92');
  assert.equal(tempVoiceVariables.renderChannelName('Squad de {displayname} #{counter}', ctx), 'Squad de Alex #3');
  assert.equal(tempVoiceVariables.renderChannelName('   ', ctx), 'Salon temporaire'); // repli
  assert.ok(tempVoiceVariables.renderChannelName('x'.repeat(200), ctx).length <= 100); // limite Discord
});

// --- Assistant : parsing format & limite (pur) ---
const wizard = require('../services/temporaryVoice/tempVoiceWizard');

test('tempVoiceWizard.applyFormat : format et limite bornée', () => {
  const draft = { nameFormat: 'x', userLimit: 0 };
  wizard.applyFormat(draft, { getTextInputValue: (id) => (id === 'format' ? '🔊 {username}' : '5') });
  assert.equal(draft.nameFormat, '🔊 {username}');
  assert.equal(draft.userLimit, 5);
  wizard.applyFormat(draft, { getTextInputValue: (id) => (id === 'format' ? 'Salon' : '999') });
  assert.equal(draft.userLimit, 99); // borné à 99
  wizard.applyFormat(draft, { getTextInputValue: (id) => (id === 'format' ? 'Salon' : 'abc') });
  assert.equal(draft.userLimit, 0); // invalide → illimité
});

// --- Repository : générateurs, compteurs indépendants, temps, stats ---
const repository = require('../database/tempVoiceRepository');
const G = 'test-guild-tempvoice';

after(() => fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'tempVoice.json'), { force: true }));

test('tempVoiceRepository : générateurs et compteurs indépendants', () => {
  repository.saveGenerator({ channelId: 'genA', guildId: G, categoryId: null, nameFormat: 'A {counter}', userLimit: 0, extraRoleIds: [], counter: 0 });
  repository.saveGenerator({ channelId: 'genB', guildId: G, categoryId: null, nameFormat: 'B {counter}', userLimit: 4, extraRoleIds: [], counter: 0 });
  assert.equal(repository.isGenerator(G, 'genA'), true);
  assert.equal(repository.isGenerator(G, 'inconnu'), false);
  assert.equal(repository.nextCounter(G, 'genA'), 1);
  assert.equal(repository.nextCounter(G, 'genA'), 2);
  assert.equal(repository.nextCounter(G, 'genB'), 1); // compteur indépendant
  assert.equal(repository.listGenerators(G).length, 2);
});

test('tempVoiceRepository : salons temporaires, anti-doublon et stats', () => {
  repository.saveTemp({ channelId: 'tmp1', guildId: G, generatorId: 'genA', ownerId: 'u1', name: 'A 1', createdAt: new Date().toISOString() });
  assert.equal(repository.isTemp(G, 'tmp1'), true);
  assert.ok(repository.findTempByOwner(G, 'u1', 'genA'));
  assert.equal(repository.findTempByOwner(G, 'u1', 'genB'), null); // autre générateur
  repository.recordCreated(G);
  repository.recordDeleted(G);
  const stats = repository.getStats(G);
  assert.ok(stats.created >= 1 && stats.deleted >= 1);
  repository.removeTemp(G, 'tmp1');
  assert.equal(repository.isTemp(G, 'tmp1'), false);
  assert.equal(repository.deleteGenerator(G, 'genA'), true);
});
