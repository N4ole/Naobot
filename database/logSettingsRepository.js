/**
 * Persistance des paramètres du système de logs.
 * Structure : { [guildId]: { categoryId, enabled: { [clé]: bool }, channels: { [clé]: channelId } } }
 *
 * Une clé absente de `enabled` signifie « jamais configurée » (ce qui permet
 * au service de modération de conserver son ancien comportement tant que le
 * système de logs n'a pas été adopté sur le serveur).
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'logSettings.json'));

/** @returns {{ categoryId: string|null, enabled: Record<string, boolean>, channels: Record<string, string> }} */
function getSettings(guildId) {
  const raw = store.get(guildId, {});
  return {
    categoryId: raw.categoryId ?? null,
    enabled: { ...(raw.enabled ?? {}) },
    channels: { ...(raw.channels ?? {}) },
  };
}

function saveSettings(guildId, settings) {
  store.set(guildId, settings);
}

module.exports = { getSettings, saveSettings };
