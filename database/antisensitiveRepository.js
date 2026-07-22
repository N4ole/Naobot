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
 *   exemptChannels: [], exemptCategories: [], exemptRoles: [], exemptUsers: [],
 *   blockedDomains: [], allowedDomains: [], blockedKeywords: [], allowedKeywords: [],
 *   lastModifiedAt, lastModifiedBy,
 *   stats: { detections, deleted, errors },
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

function defaultCategories() {
  return Object.fromEntries(CONTENT_CATEGORIES.map((c) => [c, true]));
}

function defaults() {
  return {
    enabled: false,
    categories: defaultCategories(),
    action: 'delete',
    warnUser: true,
    warnMessage: null,
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
    stats: { detections: 0, deleted: 0, errors: 0 },
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
    stats: { ...base.stats, ...(stored.stats ?? {}) },
    recentDetections: arr(stored.recentDetections),
  };
}

function saveConfig(guildId, config) {
  store.set(guildId, config);
}

function pushDetection(config, entry) {
  config.recentDetections = [entry, ...config.recentDetections].slice(0, RECENT_LIMIT);
}

module.exports = { getConfig, saveConfig, pushDetection, isEnabled, RECENT_LIMIT, CONTENT_CATEGORIES, ACTIONS };
