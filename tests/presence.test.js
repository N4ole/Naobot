const test = require('node:test');
const assert = require('node:assert/strict');
const { ActivityType } = require('discord.js');

const presenceService = require('../services/presence/presenceService');

test('statusText : met en avant la commande contactowner sous sa forme slash', () => {
  const text = presenceService.statusText();
  assert.equal(presenceService.FEATURED_COMMAND, 'contactowner');
  assert.ok(text.includes('/contactowner'), text);
  // Le préfixe étant personnalisable par serveur, jamais de forme préfixée.
  assert.ok(!text.includes('!contactowner'), text);
});

test('statusText : passe par les locales (aucune clé brute)', () => {
  assert.notEqual(presenceService.statusText(), 'presence.status');
});

test('statusText : respecte la limite Discord', () => {
  assert.ok(presenceService.statusText().length <= presenceService.MAX_STATE_LENGTH);
});

test('buildPresence : statut personnalisé en ligne', () => {
  const presence = presenceService.buildPresence();
  assert.equal(presence.status, 'online');
  assert.equal(presence.activities.length, 1);
  const [activity] = presence.activities;
  assert.equal(activity.type, ActivityType.Custom);
  assert.equal(activity.state, presenceService.statusText());
  // La passerelle exige un `name`, même ignoré pour un statut personnalisé.
  assert.ok(activity.name);
});

test('initialPresence : identique à la présence appliquée (source unique)', () => {
  assert.deepEqual(presenceService.initialPresence(), presenceService.buildPresence());
});

test('apply : applique la présence sur un client prêt', () => {
  let received = null;
  const client = { user: { setPresence: (presence) => { received = presence; } } };
  assert.equal(presenceService.apply(client), true);
  assert.deepEqual(received, presenceService.buildPresence());
});

test('apply : ne casse rien si le client n\'est pas prêt ou échoue', () => {
  assert.equal(presenceService.apply(null), false);
  assert.equal(presenceService.apply({}), false);
  const failing = { user: { setPresence: () => { throw new Error('gateway'); } } };
  assert.equal(presenceService.apply(failing), false);
});

test('index.js : la présence est déclarée dans les options du client', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.js'), 'utf8');
  assert.ok(source.includes('presence: presenceService.initialPresence()'));
});
