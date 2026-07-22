const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runEmojiAudit, analyzeFile } = require('../services/audit/emojiAuditService');

test('audit projet : structure du rapport + aucun identifiant en dur', () => {
  const report = runEmojiAudit();
  assert.equal(typeof report.totalEmbedModules, 'number');
  assert.ok(report.totalEmbedModules > 0);
  assert.ok(report.coverage >= 0 && report.coverage <= 100);
  // Convention : aucun identifiant d'émoji écrit en dur hors config/emojis.js.
  assert.deepEqual(report.hardcodedEmojiFiles, []);
  // Convention : aucun émoji personnalisé réutilisé comme logo de catégorie.
  assert.deepEqual(report.categoryLogoViolations, []);
});

test('logos de catégories : uniquement des émojis Discord standards', () => {
  const categoryEmojis = require('../config/categoryEmojis');
  const CUSTOM = /<a?:[a-zA-Z0-9_]+:\d{17,20}>/;
  for (const [category, emoji] of Object.entries(categoryEmojis)) {
    assert.ok(typeof emoji === 'string' && emoji.length > 0, `Catégorie ${category} sans émoji`);
    assert.ok(!CUSTOM.test(emoji), `Catégorie ${category} : émoji personnalisé interdit comme logo`);
  }
});

test('analyzeFile : détecte embed, usage officiel et identifiant en dur', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eaudit-'));

  const compliant = path.join(dir, 'ok.js');
  fs.writeFileSync(compliant, 'const { successEmbed } = require("../embeds"); module.exports = () => successEmbed("ok");');
  const a1 = analyzeFile(compliant);
  assert.equal(a1.buildsEmbed, true);
  assert.equal(a1.usesOfficial, true);
  assert.equal(a1.hardcoded, false);

  const nonCompliant = path.join(dir, 'ko.js');
  fs.writeFileSync(nonCompliant, 'const { infoEmbed } = require("../embeds"); module.exports = () => infoEmbed("Titre", "x");');
  const a2 = analyzeFile(nonCompliant);
  assert.equal(a2.buildsEmbed, true);
  assert.equal(a2.usesOfficial, false);

  const hard = path.join(dir, 'hard.js');
  fs.writeFileSync(hard, 'module.exports = "<:party:1528866402985967627>";');
  const a3 = analyzeFile(hard);
  assert.equal(a3.hardcoded, true);

  fs.rmSync(dir, { recursive: true, force: true });
});
