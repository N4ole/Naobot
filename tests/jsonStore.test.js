const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStore } = require('../database/jsonStore');

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naobot-test-'));
  return path.join(dir, 'store.json');
}

test('JsonStore : get retourne le fallback si la clé est absente', () => {
  const store = new JsonStore(tempFile());
  assert.equal(store.get('inconnue'), undefined);
  assert.deepEqual(store.get('inconnue', {}), {});
});

test('JsonStore : set persiste sur disque', () => {
  const file = tempFile();
  const store = new JsonStore(file);
  store.set('guild1', { user1: [{ id: 'abc' }] });

  // Nouvelle instance : relecture depuis le disque.
  const reloaded = new JsonStore(file);
  assert.deepEqual(reloaded.get('guild1'), { user1: [{ id: 'abc' }] });
});

test('JsonStore : fichier corrompu → données réinitialisées sans exception', () => {
  const file = tempFile();
  fs.writeFileSync(file, '{invalide');
  const store = new JsonStore(file);
  assert.equal(store.get('clef'), undefined);
});
