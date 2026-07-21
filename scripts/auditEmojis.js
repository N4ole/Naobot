#!/usr/bin/env node
/**
 * Audit d'usage des émojis officiels — `node scripts/auditEmojis.js` ou
 * `npm run audit:emojis`.
 *
 * Parcourt les embeds du projet, mesure la couverture des émojis officiels et
 * signale les identifiants d'émoji écrits en dur (interdits hors
 * config/emojis.js). Sortie 1 uniquement si un identifiant en dur est trouvé
 * (une couverture partielle est tolérée : tous les embeds n'ont pas vocation à
 * porter un émoji — cf. « ne pas surcharger l'interface »).
 */
const { runEmojiAudit, formatEmojiReport } = require('../services/audit/emojiAuditService');

const report = runEmojiAudit();
console.log(formatEmojiReport(report));

if (report.hardcodedEmojiFiles.length > 0) {
  console.error(`\n✖ Identifiant(s) d'émoji écrit(s) en dur hors config/emojis.js : ${report.hardcodedEmojiFiles.join(', ')}.`);
  process.exit(1);
}

console.log(`\n✔ Aucun identifiant d'émoji en dur. Couverture des embeds : ${report.coverage} %.`);
process.exit(0);
