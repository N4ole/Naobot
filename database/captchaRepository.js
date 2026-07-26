/**
 * Persistance du système de captcha à l'arrivée, par serveur
 * (database/data/captcha.json).
 *
 * config par serveur :
 * {
 *   enabled,               // désactivé par défaut
 *   channelId,             // salon où le captcha est envoyé
 *   tempRoleId,            // rôle temporaire des non-vérifiés
 *   verifiedRoleId,        // rôle attribué après validation
 *   timeoutMinutes,        // durée maximale de résolution
 *   type,                  // 'button' | 'text' | 'math'
 *   message,               // message affiché
 *   maxAttempts,           // tentatives avant expulsion
 *   pending: { [userId]: { answer, type, expiresAt, attempts, messageId, createdAt } },
 *   stats: { passed, failed, kicked }
 * }
 *
 * Les vérifications en attente sont persistées : après un redémarrage, les
 * délais continuent d'être appliqués (expulsion des membres non vérifiés).
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'captcha.json'));

function defaults() {
  return {
    enabled: false,
    channelId: null,
    tempRoleId: null,
    verifiedRoleId: null,
    timeoutMinutes: 5,
    type: 'button',
    message: 'Bienvenue ! Pour accéder au serveur, validez la vérification ci-dessous.',
    maxAttempts: 3,
    // Message de confirmation temporaire : supprimé automatiquement après
    // `successDeleteMs` (0 ou deleteSuccess=false → conservé).
    deleteSuccess: true,
    successDeleteMs: 10 * 1000,
    pending: {},
    stats: { passed: 0, failed: 0, kicked: 0 },
  };
}

function getConfig(guildId) {
  return { ...defaults(), ...store.get(guildId, {}) };
}

function saveConfig(guildId, config) {
  store.set(guildId, config);
}

// --- Vérifications en attente ---

function getPending(guildId, userId) {
  return getConfig(guildId).pending[userId] ?? null;
}

function setPending(guildId, userId, pending) {
  const config = getConfig(guildId);
  config.pending[userId] = pending;
  saveConfig(guildId, config);
}

function removePending(guildId, userId) {
  const config = getConfig(guildId);
  if (!config.pending[userId]) return false;
  delete config.pending[userId];
  saveConfig(guildId, config);
  return true;
}

// --- Statistiques ---

function recordStat(guildId, key) {
  const config = getConfig(guildId);
  config.stats[key] = (config.stats[key] ?? 0) + 1;
  saveConfig(guildId, config);
}

/** Toutes les vérifications en attente de tous les serveurs (planificateur). */
function allPending() {
  const result = [];
  for (const [guildId, config] of Object.entries(store.all())) {
    for (const [userId, pending] of Object.entries(config.pending ?? {})) {
      result.push({ guildId, userId, ...pending });
    }
  }
  return result;
}

/** Configurations de tous les serveurs (statistiques globales). */
function allConfigs() {
  return store.all();
}

module.exports = { defaults, allConfigs, getConfig, saveConfig, getPending, setPending, removePending, recordStat, allPending };
