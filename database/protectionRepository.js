/**
 * Persistance des protections automatiques par serveur
 * (database/data/protections.json).
 *
 * Structure par serveur :
 * {
 *   enabled: { antispam, antilink, antibot },  // toutes désactivées par défaut
 *   lastModifiedAt, lastModifiedBy,             // dernière modification
 *   stats: { spamDetections, linksRemoved, botsJoined, raidsBlocked }
 * }
 *
 * Tout survit aux redémarrages.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'protections.json'));

function defaults() {
  return {
    enabled: { antispam: false, antilink: false, antibot: false },
    lastModifiedAt: null,
    lastModifiedBy: null,
    stats: { spamDetections: 0, linksRemoved: 0, botsJoined: 0, raidsBlocked: 0 },
  };
}

function getConfig(guildId) {
  const stored = store.get(guildId, {});
  const base = defaults();
  return {
    enabled: { ...base.enabled, ...(stored.enabled ?? {}) },
    lastModifiedAt: stored.lastModifiedAt ?? null,
    lastModifiedBy: stored.lastModifiedBy ?? null,
    stats: { ...base.stats, ...(stored.stats ?? {}) },
  };
}

function saveConfig(guildId, config) {
  store.set(guildId, config);
}

/** Configurations de tous les serveurs (statistiques globales). */
function allConfigs() {
  return store.all();
}

module.exports = { getConfig, saveConfig, allConfigs };
