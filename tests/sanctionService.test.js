const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isole la persistance dans un dossier temporaire (data/ gitignoré).
const DATA_DIR = path.join(__dirname, '..', 'database', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'warnConfig.json');
let backup = null;

test.before(() => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(CONFIG_FILE)) backup = fs.readFileSync(CONFIG_FILE, 'utf8');
});
test.after(() => {
  if (backup !== null) fs.writeFileSync(CONFIG_FILE, backup);
  else fs.rmSync(CONFIG_FILE, { force: true });
});

const sanctionService = require('../services/warnings/sanctionService');
const { DEFAULT_LADDER } = require('../utils/constants/warnSanctions');

const GUILD = 'test-guild-sanction';

test('resolveSanction : échelle par défaut (7 paliers, palier 1 = avertissement)', () => {
  const first = sanctionService.resolveSanction(GUILD, 1);
  assert.equal(first.sanction.type, 'warn');
  // Paliers 2 à 6 : timeouts de durée croissante ; palier 7 : ban.
  assert.equal(sanctionService.resolveSanction(GUILD, 2).sanction.type, 'timeout');
  assert.equal(sanctionService.resolveSanction(GUILD, 2).sanction.durationMs, 5 * 60 * 1000);
  assert.equal(sanctionService.resolveSanction(GUILD, 6).sanction.type, 'timeout');
  assert.equal(sanctionService.resolveSanction(GUILD, 6).sanction.durationMs, 7 * 24 * 60 * 60 * 1000);
  assert.equal(sanctionService.resolveSanction(GUILD, 7).sanction.type, 'ban');
});

test('resolveSanction : au-delà du dernier palier = plafond (ban)', () => {
  assert.equal(sanctionService.resolveSanction(GUILD, 99).sanction.type, 'ban');
  assert.equal(sanctionService.resolveSanction(GUILD, 99).level, 7);
});

test('resolveSanction : 0 ou négatif = aucune sanction', () => {
  assert.equal(sanctionService.resolveSanction(GUILD, 0), null);
});

test('nextSanction : prochaine sanction = palier count+1', () => {
  assert.equal(sanctionService.nextSanction(GUILD, 1).sanction.type, 'timeout');
});

test('setTier : palier 1 reste toujours un avertissement', () => {
  // Tente de changer le palier 1 en ban : doit être normalisé en warn.
  sanctionService.setTier(GUILD, 1, { type: 'ban', enabled: true });
  assert.equal(sanctionService.resolveSanction(GUILD, 1).sanction.type, 'warn');
  sanctionService.resetLadder(GUILD);
});

test('setTier puis reset : configuration modifiable et restaurable', () => {
  sanctionService.setTier(GUILD, 2, { type: 'kick', enabled: true });
  assert.equal(sanctionService.resolveSanction(GUILD, 2).sanction.type, 'kick');
  sanctionService.resetLadder(GUILD);
  assert.equal(sanctionService.resolveSanction(GUILD, 2).sanction.type, DEFAULT_LADDER[2].type);
});

test('describeSanction : libellé lisible avec durée', () => {
  const label = sanctionService.describeSanction({ type: 'timeout', durationMs: 60 * 60 * 1000 });
  assert.ok(label.includes('1 h'));
  assert.equal(sanctionService.describeSanction(null), 'Aucune');
});
