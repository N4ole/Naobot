/**
 * Journal **interne du bot** (distinct des logs de modération des serveurs et
 * du journal de l'interface web `webLog`).
 *
 * Trois flux indépendants, bornés en mémoire (aucune écriture disque : ces
 * données sont volatiles par nature et ne doivent pas grossir indéfiniment sur
 * un bot public) :
 *   - `commands` : chaque commande exécutée (date, utilisateur, serveur, salon,
 *     type slash/préfixe, durée, résultat) ;
 *   - `errors`   : toutes les erreurs internes (Discord, API, base de données,
 *     WebSocket, exceptions, promesses rejetées) avec pile complète ;
 *   - `system`   : cycle de vie (démarrage, arrêt, reconnexion, mise à jour des
 *     commandes, synchronisation, redémarrage, sauvegardes).
 *
 * **Impact minimal sur le code Discord** : les points de capture sont branchés
 * une seule fois sur des passages déjà mutualisés (le pipeline de commandes et
 * `errorLogService.report`), jamais dans les commandes elles-mêmes.
 *
 * Jamais bloquant : toute la collecte est encapsulée, une erreur de
 * journalisation n'interrompt ni la commande ni le bot.
 */
const { EventEmitter } = require('node:events');
const webNotifier = require('./webNotifier');

/** Taille maximale de chaque flux (tampon circulaire). */
const LIMITS = { commands: 500, errors: 300, system: 200 };

/** Flux disponibles (clé → tampon). */
const streams = { commands: [], errors: [], system: [] };

/** Bus d'événements : `entry` (nouvelle entrée) pour le temps réel. */
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

let sequence = 0;

/** Type de notification web publié pour chaque flux. */
const NOTIFICATION_TYPES = { commands: 'command', errors: 'error', system: 'system' };

/** Ajoute une entrée à un flux borné, puis notifie les abonnés. */
function push(stream, entry) {
  const buffer = streams[stream];
  if (!buffer) return null;
  sequence += 1;
  const record = { id: sequence, at: new Date().toISOString(), ...entry };
  buffer.push(record);
  if (buffer.length > LIMITS[stream]) buffer.shift();
  try {
    emitter.emit('entry', { stream, entry: record });
    // Relais vers le bus de notifications : l'interface web s'abonne à un seul
    // endroit (webNotifier) plutôt qu'à chaque service.
    webNotifier.publish(NOTIFICATION_TYPES[stream], { stream, entry: record });
  } catch {
    /* un abonné défaillant ne doit jamais casser la journalisation */
  }
  return record;
}

/** Décrit une entité Discord sans conserver de référence vive (mémoire). */
function describe(entity) {
  if (!entity) return null;
  return { id: entity.id ?? null, name: entity.name ?? entity.tag ?? String(entity) };
}

/**
 * Extrait « fichier:ligne » de la première position de pile exploitable.
 * @param {string|null} stack
 * @returns {string|null}
 */
function firstFrame(stack) {
  if (!stack) return null;
  const match = stack.match(/(?:\(|\s@?)?([^\s():]+):(\d+):\d+\)?/);
  if (!match) return null;
  const file = match[1].split(/[/\\]/).pop();
  return `${file}:${match[2]}`;
}

// ---------------------------------------------------------------------------
// Enregistrement
// ---------------------------------------------------------------------------

/**
 * Journalise une commande exécutée.
 * @param {{ command: string, user?: object, guild?: object, channel?: object,
 *   type: 'slash'|'prefix', durationMs: number, ok: boolean, error?: string }} data
 */
function recordCommand(data) {
  return push('commands', {
    command: data.command,
    user: describe(data.user),
    guild: describe(data.guild),
    channel: describe(data.channel),
    type: data.type,
    durationMs: Math.max(0, Math.round(data.durationMs ?? 0)),
    ok: data.ok !== false,
    error: data.error ? String(data.error).slice(0, 500) : null,
  });
}

/**
 * Journalise une erreur interne. Reflète `errorLogService.report` : un seul
 * point de capture couvre toutes les familles d'erreurs.
 * @param {{ type?: string, error?: unknown, guild?: object, channel?: object,
 *   user?: object, command?: string, module?: string }} context
 */
function recordError(context = {}) {
  const error = context.error;
  const stack = error?.stack ? String(error.stack) : error != null ? String(error) : null;
  return push('errors', {
    type: context.type ?? 'unknown',
    module: context.module ?? null,
    // Première position « fichier:ligne » de la pile : localise l'origine sans
    // exposer toute l'arborescence dans les listes. Le chemin est réduit au nom
    // de fichier (les chemins absolus n'apportent rien et sont bruyants).
    file: firstFrame(stack),
    message: error?.message ? String(error.message).slice(0, 500) : stack?.split('\n')[0]?.slice(0, 500) ?? null,
    stack: stack ? stack.slice(0, 6000) : null,
    user: describe(context.user),
    guild: describe(context.guild),
    channel: describe(context.channel),
    command: context.command ?? null,
  });
}

/**
 * Journalise un événement système (cycle de vie du bot).
 * @param {string} event  clé : startup, shutdown, reconnect, commandsSync,
 *                        sync, restart, backup…
 * @param {string} [message]
 * @param {object} [meta]
 */
function recordSystem(event, message = '', meta = {}) {
  return push('system', { event, message: String(message).slice(0, 500), meta });
}

// ---------------------------------------------------------------------------
// Lecture (recherche, filtres, pagination)
// ---------------------------------------------------------------------------

/** Texte indexé d'une entrée, pour la recherche plein texte. */
function searchableText(stream, entry) {
  if (stream === 'commands') {
    return [entry.command, entry.user?.name, entry.user?.id, entry.guild?.name, entry.channel?.name, entry.type, entry.error].filter(Boolean).join(' ');
  }
  if (stream === 'errors') {
    return [entry.type, entry.module, entry.file, entry.message, entry.command, entry.guild?.name, entry.user?.name].filter(Boolean).join(' ');
  }
  return [entry.event, entry.message].filter(Boolean).join(' ');
}

function matchesFilters(stream, entry, filters) {
  if (filters.since && Date.parse(entry.at) < Date.parse(filters.since)) return false;
  if (filters.until && Date.parse(entry.at) > Date.parse(filters.until)) return false;
  if (filters.guildId && entry.guild?.id !== filters.guildId) return false;
  if (filters.userId && entry.user?.id !== filters.userId) return false;
  if (filters.type && entry.type !== filters.type) return false;
  if (filters.event && entry.event !== filters.event) return false;
  if (filters.command && entry.command !== filters.command) return false;
  if (filters.status === 'ok' && entry.ok !== true) return false;
  if (filters.status === 'error' && entry.ok !== false) return false;
  if (filters.query) {
    const needle = String(filters.query).toLowerCase();
    if (!searchableText(stream, entry).toLowerCase().includes(needle)) return false;
  }
  return true;
}

/**
 * Interroge un flux : filtres + recherche + pagination (les plus récents
 * d'abord).
 * @returns {{ entries: object[], total: number, page: number, pages: number, pageSize: number }}
 */
function query(stream, { page = 1, pageSize = 25, ...filters } = {}) {
  const buffer = streams[stream];
  if (!buffer) return { entries: [], total: 0, page: 1, pages: 1, pageSize };
  const matched = buffer.filter((entry) => matchesFilters(stream, entry, filters)).reverse();
  const size = Math.min(Math.max(1, Number(pageSize) || 25), 200);
  const pages = Math.max(1, Math.ceil(matched.length / size));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  return {
    entries: matched.slice((current - 1) * size, current * size),
    total: matched.length,
    page: current,
    pages,
    pageSize: size,
  };
}

/** Compteurs synthétiques des trois flux (tableau de bord). */
function summary() {
  const commandErrors = streams.commands.filter((c) => c.ok === false).length;
  return {
    commands: { total: streams.commands.length, errors: commandErrors, ok: streams.commands.length - commandErrors },
    errors: streams.errors.length,
    system: streams.system.length,
    limits: { ...LIMITS },
  };
}

/** Valeurs distinctes d'un champ (alimente les listes de filtres du frontend). */
function distinct(stream, field) {
  const buffer = streams[stream] ?? [];
  return [...new Set(buffer.map((entry) => entry[field]).filter(Boolean))].sort();
}

/** Toutes les entrées d'un flux (analyse) — copie défensive. */
function all(stream) {
  return [...(streams[stream] ?? [])];
}

/** Abonnement temps réel : renvoie la fonction de désabonnement. */
function subscribe(listener) {
  emitter.on('entry', listener);
  return () => emitter.off('entry', listener);
}

/** Vide les flux (tests). */
function reset() {
  for (const key of Object.keys(streams)) streams[key].length = 0;
  sequence = 0;
}

module.exports = { recordCommand, recordError, recordSystem, query, summary, distinct, all, subscribe, reset, LIMITS };
