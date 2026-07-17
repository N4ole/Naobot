/**
 * Persistance du mode urgence par serveur (database/data/emergency.json).
 *
 * Structure par serveur :
 * {
 *   active, activatedBy, activatedAt,
 *   exemptChannelIds: [],              // salons critiques ignorés (extension future)
 *   savedOverwrites: {                 // permissions @everyone mémorisées avant verrouillage
 *     "<channelId>": { allow: "<bits>", deny: "<bits>", existed: bool }
 *   }
 * }
 *
 * L'état survit aux redémarrages : un serveur reste verrouillé tant que le
 * mode n'est pas désactivé, et la restauration s'appuie sur savedOverwrites.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'emergency.json'));

function getState(guildId) {
  return {
    active: false,
    activatedBy: null,
    activatedAt: null,
    exemptChannelIds: [],
    savedOverwrites: {},
    ...store.get(guildId, {}),
  };
}

function saveState(guildId, state) {
  store.set(guildId, state);
}

module.exports = { getState, saveState };
