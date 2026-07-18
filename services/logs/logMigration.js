/**
 * Migration automatique de l'ancien système de logs (multitude de catégories)
 * vers les **sept catégories** actuelles.
 *
 * Pour chaque serveur configuré, les anciennes clés sont remappées vers leur
 * nouvelle catégorie (services/logs/logService.resolveKey) : l'état activé est
 * fusionné (OU logique), le premier salon disponible est conservé, les
 * catégories obsolètes sont supprimées de la configuration. Idempotent : une
 * configuration déjà migrée n'est pas modifiée.
 */
const repository = require('../../database/logSettingsRepository');
const logCategories = require('../../utils/constants/logCategories');
const { resolveKey } = require('./logService');

const REAL_KEYS = new Set(Object.keys(logCategories));

/** @returns {boolean} true si la configuration a été modifiée. */
function migrateGuild(guildId) {
  const settings = repository.getSettings(guildId);
  const oldKeys = new Set([...Object.keys(settings.enabled), ...Object.keys(settings.channels)]);
  // Déjà migré : seules des clés réelles subsistent.
  if ([...oldKeys].every((key) => REAL_KEYS.has(key))) return false;

  const migrated = { categoryId: settings.categoryId, enabled: {}, channels: {}, meta: {} };
  for (const oldKey of oldKeys) {
    const newKey = resolveKey(oldKey);
    if (newKey === null) continue; // catégorie supprimée
    if (oldKey in settings.enabled) migrated.enabled[newKey] = migrated.enabled[newKey] || settings.enabled[oldKey] === true;
    if (!migrated.channels[newKey] && settings.channels[oldKey]) migrated.channels[newKey] = settings.channels[oldKey];
    if (!migrated.meta[newKey] && settings.meta[oldKey]) migrated.meta[newKey] = settings.meta[oldKey];
  }
  repository.saveSettings(guildId, migrated);
  return true;
}

/** Migre tous les serveurs configurés. @returns {number} serveurs migrés. */
function migrateAll() {
  let count = 0;
  for (const guildId of repository.guildIds()) {
    if (migrateGuild(guildId)) count += 1;
  }
  return count;
}

module.exports = { migrateGuild, migrateAll };
