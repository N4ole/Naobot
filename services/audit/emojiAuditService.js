/**
 * Audit d'usage des émojis officiels dans les embeds du projet.
 *
 * Objectif : garantir une identité visuelle cohérente. Le service parcourt
 * (statiquement) les fichiers `commands/`, `services/` et `events/`, repère les
 * modules qui **construisent des embeds** et vérifie s'ils s'appuient sur les
 * émojis officiels (`config/emojis.js`) — directement (`require('config/emojis')`)
 * ou indirectement via les constructeurs partagés `successEmbed`/`errorEmbed`
 * (qui préfixent déjà l'émoji officiel `thumb`/`glitch`).
 *
 * Il signale aussi les **identifiants d'émojis en dur** (`<:nom:id>`) écrits
 * ailleurs que dans `config/emojis.js` — interdits par la convention.
 *
 * Le service est utilisable sans client (script, tests) comme avec (commande
 * owner `emojiaudit`).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = ['commands', 'services', 'events'];

/** Constructeurs d'embeds : leur présence indique un module « visuel ». */
const EMBED_BUILDERS = /\b(successEmbed|errorEmbed|infoEmbed|logEventEmbed|modLogEmbed|new EmbedBuilder)\b/;
/** Constructeurs déjà porteurs d'un émoji officiel par défaut. */
const AUTO_EMOJI_BUILDERS = /\b(successEmbed|errorEmbed)\b/;
/** Référence au fichier central d'émojis. */
const EMOJI_IMPORT = /config\/emojis/;
/** Identifiant d'émoji personnalisé écrit en dur. */
const HARDCODED_EMOJI = /<a?:[a-zA-Z0-9_]+:\d{17,20}>/;

/** Liste récursive des fichiers .js d'un dossier. */
function listJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Analyse un fichier source pour l'usage des émojis.
 * @param {string} file
 * @returns {{ file: string, buildsEmbed: boolean, usesOfficial: boolean, hardcoded: boolean }}
 */
function analyzeFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const buildsEmbed = EMBED_BUILDERS.test(source);
  const usesOfficial = EMOJI_IMPORT.test(source) || AUTO_EMOJI_BUILDERS.test(source);
  const hardcoded = HARDCODED_EMOJI.test(source);
  return { file: path.relative(ROOT, file), buildsEmbed, usesOfficial, hardcoded };
}

/**
 * Audit complet du projet.
 * @returns {object} rapport
 */
function runEmojiAudit() {
  const files = SCAN_DIRS.flatMap((dir) => listJsFiles(path.join(ROOT, dir)));
  const analyses = files.map(analyzeFile);

  const embedModules = analyses.filter((a) => a.buildsEmbed);
  const compliant = embedModules.filter((a) => a.usesOfficial);
  // Non conformes : construisent des embeds sans jamais s'appuyer sur les
  // émojis officiels (ni import, ni successEmbed/errorEmbed).
  const nonCompliant = embedModules.filter((a) => !a.usesOfficial);
  // Interdits : identifiant d'émoji en dur hors config/emojis.js.
  const hardcoded = analyses.filter((a) => a.hardcoded && a.file !== path.join('config', 'emojis.js'));

  const byCategory = {};
  for (const a of embedModules) {
    const category = a.file.split(path.sep).slice(0, 2).join('/');
    byCategory[category] ??= { total: 0, compliant: 0 };
    byCategory[category].total += 1;
    if (a.usesOfficial) byCategory[category].compliant += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    totalEmbedModules: embedModules.length,
    officialUsageModules: compliant.length,
    nonCompliantModules: nonCompliant.map((a) => a.file),
    hardcodedEmojiFiles: hardcoded.map((a) => a.file),
    coverage: embedModules.length ? Math.round((compliant.length / embedModules.length) * 100) : 100,
    byCategory,
  };
}

/**
 * Rapport lisible en console (script / hook).
 * @param {object} report
 */
function formatEmojiReport(report) {
  const lines = [];
  lines.push('Audit des émojis officiels (embeds)');
  lines.push(`  Modules construisant des embeds : ${report.totalEmbedModules}`);
  lines.push(`  Utilisant les émojis officiels  : ${report.officialUsageModules} (${report.coverage} %)`);
  lines.push(`  Identifiants d'émoji en dur      : ${report.hardcodedEmojiFiles.length ? report.hardcodedEmojiFiles.join(', ') : 'aucun'}`);
  if (report.nonCompliantModules.length) {
    lines.push('  Modules sans émoji officiel :');
    for (const file of report.nonCompliantModules) lines.push(`    - ${file}`);
  } else {
    lines.push('  Modules sans émoji officiel : aucun');
  }
  return lines.join('\n');
}

module.exports = { runEmojiAudit, formatEmojiReport, analyzeFile };
