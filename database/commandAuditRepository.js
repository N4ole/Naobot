/**
 * Persistance du dernier audit de parité slash / préfixe
 * (database/data/commandAudit.json).
 *
 * On ne stocke qu'un **résumé** (compteurs + codes d'anomalies), suffisant pour
 * afficher « date du dernier audit » et l'état sans reconstruire tout le
 * rapport. Le rapport complet est toujours régénéré à la demande.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'commandAudit.json'));
const KEY = 'last';

/**
 * @param {object} report - Rapport renvoyé par commandParityService.
 */
function saveSummary(report) {
  store.set(KEY, {
    ranAt: report.generatedAt,
    total: report.total,
    slashCompatible: report.slashCompatible,
    prefixCompatible: report.prefixCompatible,
    dualParity: report.dualParity,
    criticalCount: report.criticalCount,
    warningCount: report.warningCount,
    missingSlash: report.missingSlash,
    missingPrefix: report.missingPrefix,
  });
}

/** @returns {object|null} Résumé du dernier audit, ou null si jamais exécuté. */
function getLast() {
  return store.get(KEY, null);
}

module.exports = { saveSummary, getLast };
