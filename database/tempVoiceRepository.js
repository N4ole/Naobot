/**
 * Persistance des salons vocaux temporaires (database/data/tempVoice.json).
 * Structure par serveur :
 * {
 *   generators: { [generatorChannelId]: Generator },
 *   temps: { [tempChannelId]: Temp },
 *   stats: { created, deleted }
 * }
 *
 * Generator = { channelId, guildId, categoryId, nameFormat, userLimit,
 *               extraRoleIds: [], counter, createdAt }
 * Temp = { channelId, guildId, generatorId, ownerId, name, createdAt }
 *
 * Chaque générateur possède son propre compteur. Tout survit aux
 * redémarrages ; au démarrage, les salons temporaires vides ou disparus sont
 * nettoyés (ready sweep).
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'tempVoice.json'));

function defaultGuildData() {
  return { generators: {}, temps: {}, stats: { created: 0, deleted: 0 } };
}

function getGuildData(guildId) {
  return { ...defaultGuildData(), ...store.get(guildId, {}) };
}

function saveGuildData(guildId, data) {
  store.set(guildId, data);
}

// --- Générateurs ---

function getGenerator(guildId, channelId) {
  return getGuildData(guildId).generators[channelId] ?? null;
}

function isGenerator(guildId, channelId) {
  return Boolean(getGuildData(guildId).generators[channelId]);
}

function listGenerators(guildId) {
  return Object.values(getGuildData(guildId).generators);
}

function saveGenerator(generator) {
  const data = getGuildData(generator.guildId);
  data.generators[generator.channelId] = generator;
  saveGuildData(generator.guildId, data);
  return generator;
}

function deleteGenerator(guildId, channelId) {
  const data = getGuildData(guildId);
  if (!data.generators[channelId]) return false;
  delete data.generators[channelId];
  saveGuildData(guildId, data);
  return true;
}

/** Incrémente et retourne le compteur propre au générateur. */
function nextCounter(guildId, generatorChannelId) {
  const data = getGuildData(guildId);
  const generator = data.generators[generatorChannelId];
  if (!generator) return 1;
  generator.counter = (generator.counter ?? 0) + 1;
  saveGuildData(guildId, data);
  return generator.counter;
}

// --- Salons temporaires ---

function getTemp(guildId, channelId) {
  return getGuildData(guildId).temps[channelId] ?? null;
}

function isTemp(guildId, channelId) {
  return Boolean(getGuildData(guildId).temps[channelId]);
}

function listTemps(guildId) {
  return Object.values(getGuildData(guildId).temps);
}

function saveTemp(temp) {
  const data = getGuildData(temp.guildId);
  data.temps[temp.channelId] = temp;
  saveGuildData(temp.guildId, data);
  return temp;
}

function removeTemp(guildId, channelId) {
  const data = getGuildData(guildId);
  if (!data.temps[channelId]) return false;
  delete data.temps[channelId];
  saveGuildData(guildId, data);
  return true;
}

/** Salon temporaire actif d'un membre pour un générateur donné (anti-doublon). */
function findTempByOwner(guildId, ownerId, generatorId) {
  return listTemps(guildId).find((temp) => temp.ownerId === ownerId && temp.generatorId === generatorId) ?? null;
}

// --- Statistiques ---

function recordCreated(guildId) {
  const data = getGuildData(guildId);
  data.stats.created = (data.stats.created ?? 0) + 1;
  saveGuildData(guildId, data);
}

function recordDeleted(guildId) {
  const data = getGuildData(guildId);
  data.stats.deleted = (data.stats.deleted ?? 0) + 1;
  saveGuildData(guildId, data);
}

function getStats(guildId) {
  return getGuildData(guildId).stats;
}

/** Tous les salons temporaires de tous les serveurs (nettoyage au démarrage). */
function allTemps() {
  const result = [];
  for (const [guildId, data] of Object.entries(store.all())) {
    for (const temp of Object.values(data.temps ?? {})) result.push({ ...temp, guildId });
  }
  return result;
}

module.exports = {
  getGuildData,
  getGenerator,
  isGenerator,
  listGenerators,
  saveGenerator,
  deleteGenerator,
  nextCounter,
  getTemp,
  isTemp,
  listTemps,
  saveTemp,
  removeTemp,
  findTempByOwner,
  recordCreated,
  recordDeleted,
  getStats,
  allTemps,
};
