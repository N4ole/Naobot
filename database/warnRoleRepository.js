/**
 * Persistance de la liaison paliers de warn → rôles automatiques, par serveur
 * (database/data/warnRoles.json).
 * Structure : { [guildId]: { "<niveau>": roleId } }
 *
 * Indépendant de l'échelle des sanctions (warnConfigRepository) : un serveur
 * peut attribuer des rôles sans configurer de sanctions, et inversement. Le
 * système fonctionne avec n'importe quel nombre de niveaux.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'warnRoles.json'));

/** @returns {Record<string, string>} { "<niveau>": roleId } (copie) */
function getMapping(guildId) {
  return { ...store.get(guildId, {}) };
}

/** Niveaux configurés, triés par ordre croissant. */
function sortedLevels(mapping) {
  return Object.keys(mapping)
    .map(Number)
    .filter((level) => Number.isInteger(level) && level > 0)
    .sort((a, b) => a - b);
}

/** Associe (ou remplace) le rôle d'un palier. */
function setRole(guildId, level, roleId) {
  const mapping = getMapping(guildId);
  mapping[level] = roleId;
  store.set(guildId, mapping);
  return mapping;
}

/** Supprime l'association d'un palier. @returns {boolean} */
function removeRole(guildId, level) {
  const mapping = getMapping(guildId);
  if (!(level in mapping)) return false;
  delete mapping[level];
  store.set(guildId, mapping);
  return true;
}

/** Tous les IDs de rôles de warn configurés sur le serveur. */
function allRoleIds(guildId) {
  return Object.values(getMapping(guildId));
}

module.exports = { getMapping, sortedLevels, setRole, removeRole, allRoleIds };
