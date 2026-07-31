/**
 * Ressources allouées au processus du bot (mémoire, parallélisme d'E/S).
 *
 * Ce fichier est la **source unique** des limites d'exécution. Il ne peut pas
 * ajouter de RAM ou de cœurs à la machine — cela relève de l'hébergement —
 * mais il détermine **quelle part** de la machine le processus a le droit
 * d'utiliser, et rend ce choix explicite, versionné et vérifiable.
 *
 * Deux leviers :
 *   - `heapMb` : taille maximale du tas V8 (`--max-old-space-size`). Appliqué
 *     au **lancement** par `scripts/start.js`, car V8 fige cette valeur avant
 *     l'exécution du moindre JavaScript.
 *   - `threadPoolSize` : taille du pool de threads libuv
 *     (`UV_THREADPOOL_SIZE`), utilisé par les E/S asynchrones (fichiers, DNS,
 *     compression zlib de la passerelle Discord). Appliqué au tout début de
 *     `index.js`, avant la première utilisation du pool.
 *
 * ⚠️ `'auto'` pour `heapMb` signifie **ne pas passer le drapeau** : V8
 * dimensionne alors lui-même le tas d'après la RAM de la machine (souvent
 * plusieurs Go). Forcer une valeur inférieure à ce défaut **réduirait** les
 * ressources au lieu de les augmenter — c'est pourquoi `'auto'` est le défaut
 * et qu'une valeur explicite n'est retenue que si elle dépasse le défaut.
 */
const os = require('node:os');
const v8 = require('node:v8');

/**
 * Part maximale de la RAM système que le tas du bot peut réclamer. Au-delà, la
 * machine se met à utiliser le fichier d'échange (swap) ou le noyau tue le
 * processus (OOM killer) : allouer plus deviendrait contre-productif.
 */
const MAX_SYSTEM_SHARE = 0.75;

/** Bornes du pool de threads libuv (au-delà, les gains deviennent nuls). */
const THREAD_POOL_MIN = 4;
const THREAD_POOL_MAX = 16;

const SETTINGS = {
  /**
   * Tas V8 maximal, en mégaoctets.
   *   - `'auto'` : V8 décide d'après la RAM de la machine (recommandé) ;
   *   - un nombre : plafond explicite, utile pour garantir une réserve sur un
   *     hébergement mutualisé ou pour dépasser le défaut sur une grosse machine.
   */
  heapMb: 'auto',

  /**
   * Taille du pool de threads libuv.
   *   - `'auto'` : deux threads par cœur logique, borné à [4, 16] ;
   *   - un nombre : valeur explicite.
   */
  threadPoolSize: 'auto',
};

// ---------------------------------------------------------------------------
// Calcul des valeurs effectives
// ---------------------------------------------------------------------------

/** Nombre de cœurs logiques (au moins 1, même si `os.cpus()` échoue). */
function cores() {
  return Math.max(1, os.cpus()?.length ?? 1);
}

/** Plafond de tas raisonnable pour cette machine, en Mo. */
function safeHeapCeilingMb() {
  return Math.floor((os.totalmem() * MAX_SYSTEM_SHARE) / 1048576);
}

/** Tas maximal que V8 s'accorderait spontanément, en Mo. */
function defaultHeapMb() {
  return Math.round(v8.getHeapStatistics().heap_size_limit / 1048576);
}

/** Taille de pool de threads retenue. */
function resolveThreadPoolSize() {
  if (SETTINGS.threadPoolSize !== 'auto') {
    return Math.min(Math.max(Number(SETTINGS.threadPoolSize) || THREAD_POOL_MIN, 1), THREAD_POOL_MAX);
  }
  return Math.min(Math.max(cores() * 2, THREAD_POOL_MIN), THREAD_POOL_MAX);
}

/**
 * Détermine s'il faut passer `--max-old-space-size`, et avec quelle valeur.
 *
 * Le drapeau n'est ajouté que s'il **augmente** réellement la limite : une
 * valeur inférieure au défaut de V8 serait une régression déguisée.
 *
 * @returns {{ apply: boolean, heapMb: number, defaultMb: number, ceilingMb: number, reason: string }}
 */
function resolveHeap() {
  const defaultMb = defaultHeapMb();
  const ceilingMb = safeHeapCeilingMb();

  if (SETTINGS.heapMb === 'auto') {
    return { apply: false, heapMb: defaultMb, defaultMb, ceilingMb, reason: 'auto' };
  }

  const requested = Math.floor(Number(SETTINGS.heapMb));
  if (!Number.isFinite(requested) || requested <= 0) {
    return { apply: false, heapMb: defaultMb, defaultMb, ceilingMb, reason: 'invalide' };
  }
  // Garde-fou : ne jamais réclamer plus que la part sûre de la RAM.
  if (requested > ceilingMb) {
    return { apply: true, heapMb: ceilingMb, defaultMb, ceilingMb, reason: 'plafonné' };
  }
  if (requested <= defaultMb) {
    return { apply: false, heapMb: defaultMb, defaultMb, ceilingMb, reason: 'inférieur au défaut' };
  }
  return { apply: true, heapMb: requested, defaultMb, ceilingMb, reason: 'explicite' };
}

/**
 * Drapeaux Node à passer au lancement (utilisé par `scripts/start.js`).
 * @returns {string[]}
 */
function nodeFlags() {
  const heap = resolveHeap();
  return heap.apply ? [`--max-old-space-size=${heap.heapMb}`] : [];
}

/**
 * Variables d'environnement à positionner **avant** le démarrage du processus.
 * @returns {Record<string, string>}
 */
function environment() {
  return { UV_THREADPOOL_SIZE: String(resolveThreadPoolSize()) };
}

/**
 * Applique les réglages modifiables depuis le processus en cours.
 *
 * À appeler **en toute première instruction** de `index.js` : libuv crée son
 * pool de threads paresseusement, à la première E/S asynchrone. Positionner la
 * variable après coup n'aurait plus aucun effet.
 */
function applyRuntimeLimits() {
  if (!process.env.UV_THREADPOOL_SIZE) {
    process.env.UV_THREADPOOL_SIZE = String(resolveThreadPoolSize());
  }
}

/** Limites réellement en vigueur (journal de démarrage + interface web). */
function effective() {
  const heap = resolveHeap();
  return {
    heapLimitMb: defaultHeapMb(),
    heapConfigured: SETTINGS.heapMb,
    heapCeilingMb: heap.ceilingMb,
    threadPoolSize: Number(process.env.UV_THREADPOOL_SIZE) || resolveThreadPoolSize(),
    cores: cores(),
    systemMemoryMb: Math.round(os.totalmem() / 1048576),
  };
}

/**
 * Avertissements de configuration (affichés au démarrage, jamais bloquants).
 * @returns {string[]}
 */
function warnings() {
  const messages = [];
  const heap = resolveHeap();
  if (heap.reason === 'invalide') {
    messages.push(`heapMb invalide (${SETTINGS.heapMb}) : le défaut de V8 (${heap.defaultMb} Mo) est conservé.`);
  }
  if (heap.reason === 'plafonné') {
    messages.push(`heapMb (${SETTINGS.heapMb} Mo) dépasse ${Math.round(MAX_SYSTEM_SHARE * 100)} % de la RAM : plafonné à ${heap.ceilingMb} Mo.`);
  }
  if (heap.reason === 'inférieur au défaut') {
    messages.push(`heapMb (${SETTINGS.heapMb} Mo) est inférieur au défaut de V8 (${heap.defaultMb} Mo) : le défaut est conservé pour ne pas réduire les ressources.`);
  }
  // Un tas déjà proche de la RAM disponible expose au tueur de mémoire.
  if (effective().heapLimitMb > heap.ceilingMb) {
    messages.push(`Le tas autorisé (${heap.heapLimitMb ?? heap.defaultMb} Mo) dépasse la part sûre de la RAM (${heap.ceilingMb} Mo) : surveillez la mémoire.`);
  }
  return messages;
}

/** Ligne de résumé pour le journal de démarrage. */
function summaryLine() {
  const state = effective();
  return `[ressources] Tas V8 : ${state.heapLimitMb} Mo · pool E/S : ${state.threadPoolSize} threads · ${state.cores} cœur(s) · RAM machine : ${state.systemMemoryMb} Mo`;
}

module.exports = {
  SETTINGS,
  MAX_SYSTEM_SHARE,
  applyRuntimeLimits,
  nodeFlags,
  environment,
  effective,
  warnings,
  summaryLine,
  resolveHeap,
  resolveThreadPoolSize,
};
