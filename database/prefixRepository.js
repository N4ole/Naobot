/**
 * Persistance du préfixe personnalisé par serveur (database/data/prefixes.json).
 *
 * Le préfixe **par défaut** vit dans le code (config/.env) et n'est JAMAIS
 * stocké ici : seul un préfixe explicitement défini par un serveur est
 * persisté. Un serveur sans entrée (ou remis à zéro) utilise le préfixe par
 * défaut.
 *
 * Structure par serveur : { prefix, updatedBy, updatedAt }. Volontairement
 * extensible (ex. : un futur champ `prefixes: []` pour plusieurs préfixes par
 * serveur) sans casser l'existant.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'prefixes.json'));

function getConfig(guildId) {
  const stored = store.get(guildId, {});
  return {
    prefix: typeof stored.prefix === 'string' && stored.prefix.length > 0 ? stored.prefix : null,
    updatedBy: stored.updatedBy ?? null,
    updatedAt: stored.updatedAt ?? null,
  };
}

function setPrefix(guildId, prefix, byUserId) {
  store.set(guildId, { prefix, updatedBy: byUserId ?? null, updatedAt: new Date().toISOString() });
}

/** Réinitialise : le serveur revient au préfixe par défaut (aucune entrée). */
function clearPrefix(guildId, byUserId) {
  store.set(guildId, { prefix: null, updatedBy: byUserId ?? null, updatedAt: new Date().toISOString() });
}

module.exports = { getConfig, setPrefix, clearPrefix };
