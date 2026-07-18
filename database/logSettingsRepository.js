/**
 * Persistance des paramètres du système de logs.
 * Structure : { [guildId]: { categoryId, enabled: { [clé]: bool },
 *   channels: { [clé]: channelId }, meta: { [clé]: { at, by } } } }
 *
 * `meta` conserve la date et l'auteur de la dernière modification de chaque
 * catégorie (affiché par `logs status`). Une clé absente de `enabled` signifie
 * « jamais configurée ».
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'logSettings.json'));

/** @returns {{ categoryId: string|null, enabled: object, channels: object, meta: object }} */
function getSettings(guildId) {
  const raw = store.get(guildId, {});
  return {
    categoryId: raw.categoryId ?? null,
    enabled: { ...(raw.enabled ?? {}) },
    channels: { ...(raw.channels ?? {}) },
    meta: { ...(raw.meta ?? {}) },
  };
}

function saveSettings(guildId, settings) {
  store.set(guildId, settings);
}

/** Serveurs ayant une configuration de logs (migration). */
function guildIds() {
  return Object.keys(store.all());
}

module.exports = { getSettings, saveSettings, guildIds };
