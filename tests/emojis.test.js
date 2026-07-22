const test = require('node:test');
const assert = require('node:assert/strict');

const emojis = require('../config/emojis');

test('résolution par défaut : émoji personnalisé (avant vérification)', () => {
  emojis._resetAvailability();
  // Forme `<:nom:id>` sans identifiant écrit dans le test (on vérifie la forme).
  assert.match(emojis.get('thumb'), /^<:[a-z]+:\d{17,20}>$/);
  assert.match(emojis.party, /^<:party:\d{17,20}>$/);
});

test('component() : objet { id, name } pour un émoji personnalisé', () => {
  emojis._resetAvailability();
  const c = emojis.component('thumb');
  assert.equal(typeof c, 'object');
  assert.ok(c.id && c.name);
});

test('secours Unicode automatique quand un émoji est indisponible', async () => {
  // Client factice : énumération réussie mais aucun émoji présent → tout bascule
  // sur les secours Unicode.
  const fakeClient = {
    application: { emojis: { fetch: async () => new Map() } },
    emojis: { cache: new Map() },
  };
  const result = await emojis.syncAvailability(fakeClient);
  assert.equal(result.missing.length, emojis.keys().length);
  assert.equal(emojis.get('thumb'), emojis.fallback('thumb'));
  assert.equal(emojis.get('thumb'), '👍');
  assert.equal(emojis.component('party'), '🎉'); // chaîne Unicode pour un composant
  emojis._resetAvailability();
});

test('optimiste si l’énumération des émojis échoue (émoji personnalisé conservé)', async () => {
  const failingClient = {
    application: { emojis: { fetch: async () => { throw new Error('no access'); } } },
    emojis: { cache: new Map() },
  };
  await emojis.syncAvailability(failingClient);
  assert.match(emojis.get('thumb'), /^<:pouce:\d{17,20}>$/);
  emojis._resetAvailability();
});

test('disponibilité réelle : un émoji présent reste personnalisé, un absent bascule', async () => {
  const def = emojis.DEFS.love;
  const partialClient = {
    application: { emojis: { fetch: async () => new Map([[def.id, { id: def.id }]]) } },
    emojis: { cache: new Map() },
  };
  await emojis.syncAvailability(partialClient);
  assert.match(emojis.get('love'), /^<:love:\d{17,20}>$/); // présent
  assert.equal(emojis.get('angry'), emojis.fallback('angry')); // absent → secours
  emojis._resetAvailability();
});

test('fallback() renvoie l’émoji Unicode de secours', () => {
  assert.equal(emojis.fallback('glitch'), '⚠️');
  assert.equal(emojis.fallback('basic'), '🤖');
});

test('les émojis personnalisés ne servent plus de logos de catégories', () => {
  // Règle de marque : plus aucune table associant une catégorie à un émoji
  // personnalisé (les logos de catégories vivent dans config/categoryEmojis.js).
  assert.equal(emojis.CATEGORY_EMOJIS, undefined);
});

test('aucune clé ne renvoie de chaîne vide', () => {
  emojis._resetAvailability();
  for (const key of emojis.keys()) {
    assert.notEqual(emojis.get(key), '');
    assert.notEqual(emojis.fallback(key), '');
  }
});
