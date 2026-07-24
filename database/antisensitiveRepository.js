/**
 * Persistance de la protection anti-contenus sensibles, par serveur
 * (database/data/antisensitive.json). Système **indépendant** des autres
 * protections.
 *
 * Structure par serveur :
 * {
 *   enabled: false,                 // désactivé par défaut
 *   categories: { porn, gore, violence, danger },  // catégories actives
 *   action: 'delete',              // réaction : delete | notify | log
 *   warnUser: true,                // avertir l'auteur (discret, éphémère)
 *   warnMessage: null,             // texte d'avertissement personnalisé (ou défaut)
 *   autoTimeout: { enabled: true, durationMs: 300000 },  // timeout natif automatique (5 min)
 *   exemptChannels: [], exemptCategories: [], exemptRoles: [], exemptUsers: [],
 *   blockedDomains: [], allowedDomains: [], blockedKeywords: [], allowedKeywords: [],
 *   lastModifiedAt, lastModifiedBy,
 *   stats: { detections, deleted, errors, timeouts, timeoutErrors, byCategory: {} },
 *   recentDetections: []           // dernières détections (status + interface web)
 * }
 *
 * Accès disque : `JsonStore` charge le fichier **une seule fois** en mémoire ;
 * les lectures par message (`isEnabled`, `getConfig`) ne touchent pas le disque
 * (seules les écritures — rares — le font). Adapté à des milliers de serveurs.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'antisensitive.json'));

const RECENT_LIMIT = 20;
const CONTENT_CATEGORIES = ['porn', 'gore', 'violence', 'danger'];
const ACTIONS = ['delete', 'notify', 'log'];
// Timeout natif automatique : 5 min par défaut, borné entre 1 min et le maximum
// autorisé par Discord (28 jours).
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_TIMEOUT_MS = 60 * 1000;
const { MAX_TIMEOUT_MS } = require('../utils/constants/limits');

function defaultCategories() {
  return Object.fromEntries(CONTENT_CATEGORIES.map((c) => [c, true]));
}

/** Normalise le sous-objet `autoTimeout` (activation + durée bornée). */
function normalizeAutoTimeout(stored) {
  const raw = stored ?? {};
  let durationMs = Number.isFinite(raw.durationMs) ? raw.durationMs : DEFAULT_TIMEOUT_MS;
  durationMs = Math.min(Math.max(Math.round(durationMs), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
  return { enabled: raw.enabled !== false, durationMs };
}

function defaults() {
  return {
    enabled: false,
    categories: defaultCategories(),
    action: 'delete',
    warnUser: true,
    warnMessage: null,
    autoTimeout: { enabled: true, durationMs: DEFAULT_TIMEOUT_MS },
    exemptChannels: [],
    exemptCategories: [],
    exemptRoles: [],
    exemptUsers: [],
    blockedDomains: [],
    allowedDomains: [],
    blockedKeywords: [],
    allowedKeywords: [],
    lastModifiedAt: null,
    lastModifiedBy: null,
    stats: { detections: 0, deleted: 0, errors: 0, timeouts: 0, timeoutErrors: 0, byCategory: {} },
    recentDetections: [],
  };
}

/** Lecture rapide de l'état activé (sans reconstruire toute la config). */
function isEnabled(guildId) {
  return store.get(guildId, {}).enabled === true;
}

function getConfig(guildId) {
  const stored = store.get(guildId, {});
  const base = defaults();
  const arr = (v) => (Array.isArray(v) ? [...v] : []);
  return {
    enabled: stored.enabled === true,
    categories: { ...base.categories, ...(stored.categories ?? {}) },
    action: ACTIONS.includes(stored.action) ? stored.action : 'delete',
    warnUser: stored.warnUser !== false,
    warnMessage: typeof stored.warnMessage === 'string' && stored.warnMessage.trim() ? stored.warnMessage : null,
    autoTimeout: normalizeAutoTimeout(stored.autoTimeout),
    exemptChannels: arr(stored.exemptChannels),
    exemptCategories: arr(stored.exemptCategories),
    exemptRoles: arr(stored.exemptRoles),
    exemptUsers: arr(stored.exemptUsers),
    blockedDomains: arr(stored.blockedDomains),
    allowedDomains: arr(stored.allowedDomains),
    blockedKeywords: arr(stored.blockedKeywords),
    allowedKeywords: arr(stored.allowedKeywords),
    lastModifiedAt: stored.lastModifiedAt ?? null,
    lastModifiedBy: stored.lastModifiedBy ?? null,
    stats: { ...base.stats, ...(stored.stats ?? {}), byCategory: { ...(stored.stats?.byCategory ?? {}) } },
    recentDetections: arr(stored.recentDetections),
  };
}

function saveConfig(guildId, config) {
  store.set(guildId, config);
}

function pushDetection(config, entry) {
  config.recentDetections = [entry, ...config.recentDetections].slice(0, RECENT_LIMIT);
}

module.exports = {
  getConfig, saveConfig, pushDetection, isEnabled,
  RECENT_LIMIT, CONTENT_CATEGORIES, ACTIONS,
  DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS,
};
