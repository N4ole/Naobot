/**
 * Persistance de la protection anti-publicité (invitations Discord) par
 * serveur (database/data/antipub.json).
 *
 * Système volontairement **indépendant** des autres protections
 * (antispam/antilink/antibot) : son propre état, ses propres salons exemptés
 * et ses propres statistiques.
 *
 * Structure par serveur :
 * {
 *   enabled: false,                       // désactivé par défaut
 *   exemptChannels: [],                   // salons où les invitations sont autorisées
 *   exemptRoles: [],                      // extension future (rôles exemptés)
 *   exemptUsers: [],                      // extension future (utilisateurs exemptés)
 *   allowedGuildIds: [],                  // extension future (invitations autorisées)
 *   lastModifiedAt, lastModifiedBy,       // dernière modification (date + auteur)
 *   stats: { detections, deleted, errors },
 *   recentDetections: []                  // dernières détections (pour l'interface web)
 * }
 *
 * Tout survit aux redémarrages (écriture atomique via JsonStore).
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'antipub.json'));

/** Nombre de détections récentes conservées (interface web). */
const RECENT_LIMIT = 20;

function defaults() {
  return {
    enabled: false,
    exemptChannels: [],
    exemptRoles: [],
    exemptUsers: [],
    allowedGuildIds: [],
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
    allowedGuildIds: Array.isArray(stored.allowedGuildIds) ? [...stored.allowedGuildIds] : [],
    lastModifiedAt: stored.lastModifiedAt ?? null,
    lastModifiedBy: stored.lastModifiedBy ?? null,
    stats: { ...base.stats, ...(stored.stats ?? {}) },
    recentDetections: Array.isArray(stored.recentDetections) ? [...stored.recentDetections] : [],
  };
}

function saveConfig(guildId, config) {
  store.set(guildId, config);
}

/** Ajoute une détection à l'historique récent (borné à RECENT_LIMIT). */
function pushDetection(config, entry) {
  config.recentDetections = [entry, ...config.recentDetections].slice(0, RECENT_LIMIT);
}

module.exports = { getConfig, saveConfig, pushDetection, RECENT_LIMIT };
