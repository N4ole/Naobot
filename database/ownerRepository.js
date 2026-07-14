/**
 * Persistance des owners secondaires du bot.
 * Structure du fichier (database/data/owners.json) : { "owners": ["id", …] }
 * Chaque modification est sauvegardée immédiatement (écriture atomique via
 * JsonStore). L'owner principal, lui, vit dans le .env (OWNER_ID) et n'est
 * jamais écrit ici.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'owners.json'));

/** @returns {string[]} identifiants des owners secondaires */
function getOwners() {
  return [...store.get('owners', [])];
}

function addOwner(userId) {
  const owners = getOwners();
  owners.push(userId);
  store.set('owners', owners);
}

function removeOwner(userId) {
  store.set('owners', getOwners().filter((id) => id !== userId));
}

module.exports = { getOwners, addOwner, removeOwner };
