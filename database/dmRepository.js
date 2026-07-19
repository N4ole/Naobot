/**
 * Persistance liée aux messages privés (database/data/dmSelections.json).
 *
 * Conserve la **dernière sélection de serveur** d'un utilisateur en DM, afin
 * d'améliorer l'expérience (proposer par défaut le dernier serveur choisi) dans
 * les futures mises à jour. Indexé par identifiant utilisateur (donnée
 * personnelle, non liée à un serveur particulier).
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'dmSelections.json'));

function getLastGuild(userId) {
  return store.get(userId, {}).guildId ?? null;
}

function setLastGuild(userId, guildId) {
  store.set(userId, { guildId, updatedAt: new Date().toISOString() });
}

module.exports = { getLastGuild, setLastGuild };
