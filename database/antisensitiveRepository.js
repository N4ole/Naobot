/**
 * Persistance de la protection anti-contenus sensibles (sites pour adultes,
 * violents, gore, choquants) par serveur (database/data/antisensitive.json).
 *
 * Système **indépendant** des autres protections. Structure par serveur :
 * {
 *   enabled: false,                 // désactivé par défaut
 *   exemptChannels: [],             // salons où les liens sensibles sont tolérés
 *   exemptRoles: [],                // extension future
 *   exemptUsers: [],                // extension future
 *   blockedDomains: [],             // domaines interdits supplémentaires (configurable)
 *   allowedDomains: [],             // domaines explicitement autorisés (whitelist)
 *   lastModifiedAt, lastModifiedBy,
 *   stats: { detections, deleted, errors },
 *   recentDetections: []            // dernières détections (interface web)
 * }
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'antisensitive.json'));

const RECENT_LIMIT = 20;

function defaults() {
  return {
    enabled: false,
    exemptChannels: [],
    exemptRoles: [],
    exemptUsers: [],
    blockedDomains: [],
    allowedDomains: [],
    lastModifiedAt: null,
    lastModifiedBy: null,
    stats: { detections: 0, deleted: 0, errors: 0 },
    recentDetections: [],
  };
}

function getConfig(guildId) {
  const stored = store.get(guildId, {});
  const base = defaults();
  return {
    enabled: stored.enabled === true,
    exemptChannels: Array.isArray(stored.exemptChannels) ? [...stored.exemptChannels] : [],
    exemptRoles: Array.isArray(stored.exemptRoles) ? [...stored.exemptRoles] : [],
    exemptUsers: Array.isArray(stored.exemptUsers) ? [...stored.exemptUsers] : [],
    blockedDomains: Array.isArray(stored.blockedDomains) ? [...stored.blockedDomains] : [],
    allowedDomains: Array.isArray(stored.allowedDomains) ? [...stored.allowedDomains] : [],
    lastModifiedAt: stored.lastModifiedAt ?? null,
    lastModifiedBy: stored.lastModifiedBy ?? null,
    stats: { ...base.stats, ...(stored.stats ?? {}) },
    recentDetections: Array.isArray(stored.recentDetections) ? [...stored.recentDetections] : [],
  };
}

function saveConfig(guildId, config) {
  store.set(guildId, config);
}

function pushDetection(config, entry) {
  config.recentDetections = [entry, ...config.recentDetections].slice(0, RECENT_LIMIT);
}

module.exports = { getConfig, saveConfig, pushDetection, RECENT_LIMIT };
