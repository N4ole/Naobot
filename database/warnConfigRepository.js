/**
 * Persistance de la configuration des sanctions progressives, par serveur
 * (database/data/warnConfig.json).
 * Structure : { [guildId]: { tiers: { "<nb>": { type, durationMs?, enabled } } } }
 *
 * À défaut de configuration, l'échelle par défaut
 * (utils/constants/warnSanctions) s'applique. Le palier 1 est toujours
 * normalisé en simple avertissement (imposé par le service).
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');
const { DEFAULT_LADDER } = require('../utils/constants/warnSanctions');

const store = new JsonStore(path.join(__dirname, 'data', 'warnConfig.json'));

/** Palier 1 toujours = avertissement actif (règle métier obligatoire). */
function normalizeLadder(tiers) {
  const normalized = { ...tiers };
  normalized[1] = { type: 'warn', enabled: true };
  return normalized;
}

/** Échelle du serveur (copie de l'échelle par défaut si non configurée). */
function getLadder(guildId) {
  const stored = store.get(guildId, null);
  const tiers = stored?.tiers ?? DEFAULT_LADDER;
  // Copie profonde légère pour ne jamais muter les constantes.
  const copy = Object.fromEntries(Object.entries(tiers).map(([level, sanction]) => [level, { ...sanction }]));
  return normalizeLadder(copy);
}

function saveLadder(guildId, tiers) {
  store.set(guildId, { tiers: normalizeLadder(tiers) });
}

/** Définit (ou remplace) la sanction d'un palier. */
function setTier(guildId, level, sanction) {
  const tiers = getLadder(guildId);
  tiers[level] = sanction;
  saveLadder(guildId, tiers);
  return getLadder(guildId);
}

/** Restaure l'échelle par défaut. */
function resetLadder(guildId) {
  store.set(guildId, { tiers: DEFAULT_LADDER });
  return getLadder(guildId);
}

module.exports = { getLadder, saveLadder, setTier, resetLadder };
