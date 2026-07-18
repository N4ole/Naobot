const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const logCategories = require('../utils/constants/logCategories');
const logService = require('../services/logs/logService');
const repository = require('../database/logSettingsRepository');
const logMigration = require('../services/logs/logMigration');

test('logCategories : exactement les 7 catégories fixes', () => {
  assert.deepEqual(Object.keys(logCategories), ['moderation', 'sanctions', 'members', 'roles', 'tickets', 'watch', 'protections']);
});

test('resolveKey : les anciennes clés sont fusionnées ou supprimées', () => {
  // Fusions
  assert.equal(logService.resolveKey('warns'), 'sanctions');
  assert.equal(logService.resolveKey('repglobale'), 'sanctions');
  assert.equal(logService.resolveKey('surveillance'), 'watch');
  assert.equal(logService.resolveKey('roles-reactions'), 'roles');
  assert.equal(logService.resolveKey('arrivees-departs'), 'members');
  assert.equal(logService.resolveKey('bienvenue'), 'members');
  assert.equal(logService.resolveKey('captcha'), 'members');
  assert.equal(logService.resolveKey('urgence'), 'protections');
  // Réelles (inchangées)
  assert.equal(logService.resolveKey('moderation'), 'moderation');
  assert.equal(logService.resolveKey('tickets'), 'tickets');
  // Supprimées
  assert.equal(logService.resolveKey('messages-supprimes'), null);
  assert.equal(logService.resolveKey('salons'), null);
  assert.equal(logService.resolveKey('bumps'), null);
  // Inconnue
  assert.equal(logService.resolveKey('nawak'), null);
});

// --- Migration (avec nettoyage disque) ---
const G = 'test-guild-logs-mig';
after(() => fs.rmSync(path.join(__dirname, '..', 'database', 'data', 'logSettings.json'), { force: true }));

test('migration : remappe, fusionne et supprime les obsolètes (idempotent)', () => {
  repository.saveSettings(G, {
    categoryId: 'cat',
    enabled: { warns: true, surveillance: true, 'messages-supprimes': true, 'roles-reactions': false, moderation: true },
    channels: { warns: 'chW', surveillance: 'chS', 'messages-supprimes': 'chM', 'roles-reactions': 'chRR' },
    meta: {},
  });
  assert.equal(logMigration.migrateGuild(G), true);
  const s = repository.getSettings(G);
  assert.deepEqual(Object.keys(s.enabled).sort(), ['moderation', 'roles', 'sanctions', 'watch']);
  assert.equal(s.enabled.sanctions, true); // depuis warns
  assert.equal(s.enabled.watch, true); // depuis surveillance
  assert.equal(s.enabled.roles, false); // depuis roles-reactions (désactivé)
  assert.equal(s.channels.sanctions, 'chW'); // salon repris de warns
  assert.equal('messages-supprimes' in s.enabled, false); // supprimée
  assert.equal(logMigration.migrateGuild(G), false); // idempotent
});
