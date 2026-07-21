/**
 * Persistance du dernier audit d'usage des émojis (database/data/emojiAudit.json).
 * Résumé uniquement (compteurs), pour afficher « date du dernier audit » sans
 * reconstruire tout le rapport.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'emojiAudit.json'));
const KEY = 'last';

function saveSummary(report) {
  store.set(KEY, {
    ranAt: report.generatedAt,
    totalEmbedModules: report.totalEmbedModules,
    officialUsageModules: report.officialUsageModules,
    coverage: report.coverage,
    nonCompliantCount: report.nonCompliantModules.length,
    hardcodedCount: report.hardcodedEmojiFiles.length,
  });
}

function getLast() {
  return store.get(KEY, null);
}

module.exports = { saveSummary, getLast };
