const test = require('node:test');
const assert = require('node:assert/strict');

const { runAudit } = require('../services/audit/commandParityService');

/**
 * Garde-fou du projet : chaque commande réelle doit exister en slash ET en
 * préfixe (parité structurelle). Ce test échoue si une commande est ajoutée
 * sans respecter la parité — c'est le pendant du hook pre-commit.
 */
test('parité slash/préfixe : aucune incohérence critique dans le projet', () => {
  const report = runAudit();
  const criticals = report.issues.filter((i) => i.severity === 'critical');
  assert.deepEqual(
    criticals.map((i) => `${i.command}: ${i.message}`),
    [],
    'Des incohérences critiques de parité subsistent.',
  );
  assert.equal(report.criticalCount, 0);
});

test('parité slash/préfixe : chaque commande couvre les deux modes', () => {
  const report = runAudit();
  assert.deepEqual(report.missingSlash, [], 'Commandes sans équivalent slash.');
  assert.deepEqual(report.missingPrefix, [], 'Commandes sans équivalent préfixe.');
  assert.equal(report.dualParity, report.total);
});
