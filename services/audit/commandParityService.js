/**
 * Audit de parité slash / préfixe.
 *
 * ── Rappel d'architecture ────────────────────────────────────────────────
 * NaoBot n'a **pas** deux implémentations séparées (une slash, une préfixe)
 * d'une même commande : chaque commande est un **objet unique** déclarant un
 * schéma `args`. Ce schéma génère la définition slash
 * (`utils/helpers/slashBuilder`) **et** pilote le parseur des commandes
 * préfixées (`utils/helpers/argumentParser`), et les deux points d'entrée
 * appellent le même `execute(ctx)`. La parité est donc **structurelle** : une
 * commande correctement déclarée est automatiquement disponible en slash ET
 * en préfixe, sans duplication de code métier (celui-ci vit dans `services/`).
 *
 * Le rôle de cet audit n'est donc pas de « recréer la version manquante »,
 * mais de **garantir** cette parité en détectant les commandes qui, par un
 * défaut de déclaration ou de comportement, ne fonctionneraient réellement
 * que dans un seul des deux modes :
 *   - définition slash invalide (nom, description, ordre des arguments…) →
 *     commande utilisable en préfixe mais rejetée par Discord en slash ;
 *   - comportement dépendant de l'interaction dans `execute` (ex. `showModal`)
 *     → commande utilisable en slash mais cassée en préfixe.
 *
 * Le service est utilisable **sans client** (scripts, hook pre-commit, tests)
 * comme **avec** (commande owner `commandaudit`, avertissements au démarrage).
 */
const fs = require('node:fs');
const path = require('node:path');
const { buildSlashCommand } = require('../../utils/helpers/slashBuilder');
const permissionsConfig = require('../../config/permissions');

const COMMANDS_DIR = path.join(__dirname, '..', '..', 'commands');

/** Types d'arguments reconnus par les deux résolveurs (slash + préfixe). */
const ARG_TYPES = new Set(['member', 'user', 'role', 'channel', 'string', 'integer', 'duration']);
/** Types dont les tokens restent textuels (compatibles `rest` et `choices`). */
const TEXT_TYPES = new Set(['string', 'duration']);
/** Contrainte Discord : nom d'une commande/option slash. */
const SLASH_NAME_RE = /^[-_\p{L}\p{N}]{1,32}$/u;

const SEVERITY = { CRITICAL: 'critical', WARNING: 'warning' };

/**
 * Parcourt commands/<catégorie>/*.js et renvoie la liste des commandes
 * déclarées, avec leur catégorie et leur fichier source. Miroir volontaire du
 * commandLoader, mais **sans** client (utilisable hors ligne).
 * @returns {{ command: object, category: string, file: string }[]}
 */
function collectCommands() {
  const entries = [];
  if (!fs.existsSync(COMMANDS_DIR)) return entries;

  for (const category of fs.readdirSync(COMMANDS_DIR)) {
    const categoryDir = path.join(COMMANDS_DIR, category);
    if (!fs.statSync(categoryDir).isDirectory()) continue;

    for (const file of fs.readdirSync(categoryDir).filter((f) => f.endsWith('.js'))) {
      const fullPath = path.join(categoryDir, file);
      const exported = require(fullPath);
      const definitions = Array.isArray(exported) ? exported : [exported];
      for (const command of definitions) {
        if (!command?.name) continue;
        entries.push({ command, category, file: fullPath });
      }
    }
  }
  return entries;
}

/**
 * Heuristique de détection d'un comportement « slash uniquement » : un appel à
 * `showModal` accessible depuis `execute` (et non depuis `handleComponent`).
 * Un modal ne peut être ouvert que par une interaction ; l'ouvrir dans
 * `execute` casserait la commande en préfixe (`ctx.interaction` est nul).
 *
 * Les modals ouverts depuis `handleComponent` sont légitimes : ils répondent à
 * un clic de bouton/menu, toujours une interaction, quel que soit le point
 * d'entrée initial de la commande.
 * @param {string} file - Chemin du fichier source.
 * @returns {boolean} true si un `showModal` semble atteignable depuis execute.
 */
function executeShowsModal(file) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  if (!source.includes('showModal')) return false;

  let index = source.indexOf('showModal');
  while (index !== -1) {
    const before = source.slice(0, index);
    const lastExecute = Math.max(before.lastIndexOf('execute('), before.lastIndexOf('execute ('));
    const lastComponent = before.lastIndexOf('handleComponent');
    // Si le dernier point d'entrée ouvert avant l'appel est `execute` (et non
    // `handleComponent`), l'appel est atteignable depuis le mode préfixe.
    if (lastExecute > lastComponent) return true;
    index = source.indexOf('showModal', index + 1);
  }
  return false;
}

/**
 * Applique toutes les règles de parité à une commande.
 * @param {{ command: object, category?: string, file?: string }} entry
 * @param {(issue: object) => void} report - Collecteur d'anomalies.
 * @returns {{ slashOk: boolean, prefixOk: boolean }}
 */
function auditCommand(entry, report) {
  const { command, category = command.category ?? 'inconnue', file } = entry;
  const name = command.name;
  let slashOk = true;
  let prefixOk = true;

  const fail = (severity, code, message, breaks) => {
    report({ command: name, category, severity, code, message });
    if (severity === SEVERITY.CRITICAL) {
      if (breaks === 'slash' || breaks === 'both') slashOk = false;
      if (breaks === 'prefix' || breaks === 'both') prefixOk = false;
    }
  };

  // execute obligatoire (les deux modes appellent la même fonction).
  if (typeof command.execute !== 'function') {
    fail(SEVERITY.CRITICAL, 'no-execute', `"${name}" n'a pas de méthode execute().`, 'both');
  }

  // Nom : contrainte slash (minuscule, sans espace, 1-32, alphanumérique).
  if (typeof name !== 'string' || !SLASH_NAME_RE.test(name)) {
    fail(SEVERITY.CRITICAL, 'bad-name', `Nom invalide pour une commande slash : "${name}".`, 'slash');
  } else if (name !== name.toLowerCase()) {
    fail(SEVERITY.CRITICAL, 'name-case', `Le nom "${name}" doit être en minuscules (exigence slash).`, 'slash');
  }

  // Description : requise et ≤ 100 caractères pour la définition slash.
  if (!command.description || typeof command.description !== 'string') {
    fail(SEVERITY.CRITICAL, 'no-description', `"${name}" n'a pas de description (requise en slash).`, 'slash');
  } else if (command.description.length > 100) {
    fail(SEVERITY.CRITICAL, 'description-length', `Description de "${name}" > 100 caractères (limite slash).`, 'slash');
  }

  // usage / examples : nécessaires à l'aide dynamique et à la documentation.
  if (!command.usage) fail(SEVERITY.WARNING, 'no-usage', `"${name}" ne déclare pas de \`usage\` (aide/documentation).`);
  if (!Array.isArray(command.examples) || command.examples.length === 0) {
    fail(SEVERITY.WARNING, 'no-examples', `"${name}" ne déclare pas d'\`examples\` (aide/documentation).`);
  }

  // cooldown : optionnel, mais s'il est présent il doit être un nombre positif.
  if (command.cooldown !== undefined && (typeof command.cooldown !== 'number' || command.cooldown < 0)) {
    fail(SEVERITY.WARNING, 'bad-cooldown', `Cooldown invalide pour "${name}" (nombre de secondes ≥ 0 attendu).`);
  }

  // Schéma d'arguments : validité, unicité, ordre, contraintes de type.
  const args = command.args ?? [];
  if (!Array.isArray(args)) {
    fail(SEVERITY.CRITICAL, 'bad-args', `Le schéma \`args\` de "${name}" n'est pas un tableau.`, 'both');
  } else {
    if (args.length > 25) {
      fail(SEVERITY.CRITICAL, 'too-many-args', `"${name}" déclare ${args.length} arguments (> 25, limite slash).`, 'slash');
    }
    const seen = new Set();
    let optionalSeen = false;
    args.forEach((arg, i) => {
      if (!arg?.name || !SLASH_NAME_RE.test(arg.name) || arg.name !== arg.name.toLowerCase()) {
        fail(SEVERITY.CRITICAL, 'bad-arg-name', `Argument #${i + 1} de "${name}" : nom invalide (minuscule, sans espace).`, 'slash');
      } else if (seen.has(arg.name)) {
        fail(SEVERITY.CRITICAL, 'dup-arg', `Argument "${arg.name}" dupliqué dans "${name}".`, 'both');
      }
      if (arg?.name) seen.add(arg.name);

      if (!ARG_TYPES.has(arg?.type)) {
        fail(SEVERITY.CRITICAL, 'bad-arg-type', `Argument "${arg?.name}" de "${name}" : type inconnu "${arg?.type}".`, 'both');
      }
      if (!arg?.description) {
        fail(SEVERITY.CRITICAL, 'no-arg-description', `Argument "${arg?.name}" de "${name}" sans description (requise en slash).`, 'slash');
      }
      // Discord rejette un argument requis placé après un argument optionnel.
      if (arg?.required && optionalSeen) {
        fail(SEVERITY.CRITICAL, 'arg-order', `Argument requis "${arg.name}" placé après un argument optionnel dans "${name}".`, 'slash');
      }
      if (!arg?.required) optionalSeen = true;

      // `choices` : uniquement sur des types textuels (option string slash).
      if (arg?.choices?.length && !TEXT_TYPES.has(arg.type)) {
        fail(SEVERITY.WARNING, 'choices-type', `Argument "${arg.name}" de "${name}" : \`choices\` ignoré hors type texte.`);
      }
      // `rest` : consomme la fin du message en préfixe → doit être le dernier
      // argument, et rester textuel pour un comportement identique en slash.
      if (arg?.rest) {
        if (i !== args.length - 1) {
          fail(SEVERITY.CRITICAL, 'rest-not-last', `Argument \`rest\` "${arg.name}" de "${name}" n'est pas le dernier (casse le préfixe).`, 'prefix');
        }
        if (!TEXT_TYPES.has(arg.type)) {
          fail(SEVERITY.WARNING, 'rest-type', `Argument \`rest\` "${arg.name}" de "${name}" devrait être de type texte.`);
        }
      }
    });
  }

  // Construction réelle de la définition slash : ultime garde-fou.
  try {
    buildSlashCommand(command);
  } catch (error) {
    fail(SEVERITY.CRITICAL, 'slash-build', `Échec de construction slash de "${name}" : ${String(error.message ?? error).slice(0, 120)}.`, 'slash');
  }

  // Comportement « slash uniquement » : modal ouvert depuis execute.
  if (file && executeShowsModal(file)) {
    fail(SEVERITY.CRITICAL, 'modal-in-execute', `"${name}" ouvre un modal depuis execute (impossible en préfixe).`, 'prefix');
  }

  // Cohérence des permissions : ownerOnly ne doit pas cumuler des permissions
  // Discord déclaratives (le pipeline bloquerait un owner sans permission).
  const perms = permissionsConfig[name];
  if (command.ownerOnly && perms?.user?.length) {
    fail(SEVERITY.WARNING, 'owner-and-perms', `"${name}" est ownerOnly mais déclare aussi des permissions user.`);
  }

  return { slashOk, prefixOk };
}

/**
 * Audite un ensemble d'entrées de commandes et produit un rapport structuré.
 * @param {{ command: object, category?: string, file?: string }[]} entries
 * @returns {object} rapport
 */
function auditCommands(entries) {
  const issues = [];
  const report = (issue) => issues.push(issue);

  const names = new Map(); // nom → nombre d'occurrences (doublons)
  const aliasOwners = new Map(); // alias → commande propriétaire
  const missingSlash = [];
  const missingPrefix = [];
  const byCategory = {};

  for (const entry of entries) {
    const { command, category = command.category ?? 'inconnue' } = entry;
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    names.set(command.name, (names.get(command.name) ?? 0) + 1);

    const { slashOk, prefixOk } = auditCommand(entry, report);
    if (!slashOk) missingSlash.push(command.name);
    if (!prefixOk) missingPrefix.push(command.name);
  }

  // Doublons de noms (routage ambigu : une seule commande gagne dans la Map).
  for (const [name, count] of names) {
    if (count > 1) {
      issues.push({ command: name, category: 'global', severity: SEVERITY.CRITICAL, code: 'dup-name', message: `Le nom de commande "${name}" est déclaré ${count} fois.` });
    }
  }

  // Collisions d'alias (avec un nom de commande ou entre commandes).
  for (const { command } of entries) {
    for (const alias of command.aliases ?? []) {
      if (names.has(alias)) {
        issues.push({ command: command.name, category: 'global', severity: SEVERITY.CRITICAL, code: 'alias-name-clash', message: `L'alias "${alias}" de "${command.name}" est déjà un nom de commande.` });
      }
      if (aliasOwners.has(alias)) {
        issues.push({ command: command.name, category: 'global', severity: SEVERITY.CRITICAL, code: 'alias-clash', message: `L'alias "${alias}" est partagé par "${aliasOwners.get(alias)}" et "${command.name}".` });
      } else {
        aliasOwners.set(alias, command.name);
      }
    }
  }

  // Entrées de config/permissions.js orphelines (commande supprimée/renommée).
  for (const configName of Object.keys(permissionsConfig)) {
    if (!names.has(configName)) {
      issues.push({ command: configName, category: 'config', severity: SEVERITY.WARNING, code: 'orphan-permission', message: `config/permissions.js déclare "${configName}" mais aucune commande ne porte ce nom.` });
    }
  }

  const total = entries.length;
  const criticalCount = issues.filter((it) => it.severity === SEVERITY.CRITICAL).length;
  const warningCount = issues.filter((it) => it.severity === SEVERITY.WARNING).length;
  const uniqueMissingSlash = [...new Set(missingSlash)];
  const uniqueMissingPrefix = [...new Set(missingPrefix)];

  return {
    generatedAt: new Date().toISOString(),
    total,
    slashCompatible: total - uniqueMissingSlash.length,
    prefixCompatible: total - uniqueMissingPrefix.length,
    dualParity: total - new Set([...uniqueMissingSlash, ...uniqueMissingPrefix]).size,
    missingSlash: uniqueMissingSlash,
    missingPrefix: uniqueMissingPrefix,
    criticalCount,
    warningCount,
    issues,
    byCategory,
  };
}

/** Audit complet du projet (lecture des fichiers). */
function runAudit() {
  return auditCommands(collectCommands());
}

/**
 * Rend un rapport lisible en texte (console, hook pre-commit).
 * @param {object} report
 * @returns {string}
 */
function formatReport(report) {
  const lines = [];
  lines.push('Audit de parité slash / préfixe');
  lines.push(`  Commandes totales      : ${report.total}`);
  lines.push(`  Compatibles slash      : ${report.slashCompatible}`);
  lines.push(`  Compatibles préfixe    : ${report.prefixCompatible}`);
  lines.push(`  Parité complète        : ${report.dualParity}`);
  lines.push(`  Sans équivalent slash  : ${report.missingSlash.length ? report.missingSlash.join(', ') : 'aucune'}`);
  lines.push(`  Sans équivalent préfixe: ${report.missingPrefix.length ? report.missingPrefix.join(', ') : 'aucune'}`);
  lines.push(`  Incohérences           : ${report.criticalCount} critique(s), ${report.warningCount} avertissement(s)`);
  for (const issue of report.issues) {
    const tag = issue.severity === SEVERITY.CRITICAL ? 'CRITIQUE' : 'AVERT.  ';
    lines.push(`  [${tag}] ${issue.command} (${issue.code}) : ${issue.message}`);
  }
  return lines.join('\n');
}

module.exports = {
  collectCommands,
  auditCommand,
  auditCommands,
  runAudit,
  formatReport,
  executeShowsModal,
  SEVERITY,
};
