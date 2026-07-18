/**
 * Configuration GLOBALE de la réputation (pondérations, facteurs positifs,
 * limites anti-abus) — database/data/reputationConfig.json.
 *
 * La configuration est **centralisée au niveau du bot** (une seule entrée
 * `global`) : les règles s'appliquent à tous les serveurs de façon identique,
 * pour empêcher qu'un serveur ne fausse le score global. Elle est modifiable
 * uniquement par les owners du bot (ou l'interface web côté owner). Le schéma
 * réserve `guildOverrides` pour de futures règles par serveur, sans refonte.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');
const { DEFAULT_WEIGHTS, DEFAULT_POSITIVE, DEFAULT_LIMITS } = require('../utils/constants/globalReputation');

const store = new JsonStore(path.join(__dirname, 'data', 'reputationConfig.json'));

function defaults() {
  return {
    weights: { ...DEFAULT_WEIGHTS },
    positive: { ...DEFAULT_POSITIVE },
    limits: { ...DEFAULT_LIMITS },
    guildOverrides: {}, // réservé (règles par serveur à venir)
  };
}

function getConfig() {
  const stored = store.get('global', {});
  return {
    weights: { ...DEFAULT_WEIGHTS, ...(stored.weights ?? {}) },
    positive: { ...DEFAULT_POSITIVE, ...(stored.positive ?? {}) },
    limits: { ...DEFAULT_LIMITS, ...(stored.limits ?? {}) },
    guildOverrides: stored.guildOverrides ?? {},
  };
}

function saveConfig(config) {
  store.set('global', config);
  return getConfig();
}

/** Modifie une pondération (owner). @returns {boolean} succès */
function setWeight(key, value) {
  if (!(key in DEFAULT_WEIGHTS)) return false;
  const config = getConfig();
  config.weights[key] = Math.max(0, Number(value) || 0);
  saveConfig(config);
  return true;
}

module.exports = { defaults, getConfig, saveConfig, setWeight };
