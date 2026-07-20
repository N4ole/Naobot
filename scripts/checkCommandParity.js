#!/usr/bin/env node
/**
 * Vérification de parité slash / préfixe — utilisable :
 *   - en hook Git pre-commit (.githooks/pre-commit) ;
 *   - manuellement : `node scripts/checkCommandParity.js` ou `npm run audit`.
 *
 * Sortie 0 si aucune incohérence critique ; sortie 1 sinon (le commit est
 * alors bloqué). Les avertissements n'échouent pas la vérification mais sont
 * affichés pour être traités pendant le développement.
 */
const { runAudit, formatReport } = require('../services/audit/commandParityService');

const report = runAudit();
console.log(formatReport(report));

if (report.criticalCount > 0) {
  console.error(`\n✖ Parité slash/préfixe : ${report.criticalCount} incohérence(s) critique(s). Commit bloqué.`);
  console.error('  Corrigez les commandes concernées (une commande doit exister en slash ET en préfixe).');
  process.exit(1);
}

console.log(`\n✔ Parité slash/préfixe respectée (${report.total} commandes, ${report.warningCount} avertissement(s)).`);
process.exit(0);
