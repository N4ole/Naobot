/**
 * Persistance des avertissements (database/data/warns.json).
 * Structure : { [guildId]: { [userId]: Warn[] } }
 * Warn = { id, moderatorId, reason, createdAt,
 *          sanction: { type, durationMs?, level, applied } | null }
 *
 * Les warns « actifs » sont simplement les warns présents (une suppression
 * retire l'entrée). La configuration des sanctions vit séparément dans
 * database/warnConfigRepository.
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'warns.json'));

function generateId() {
  return crypto.randomBytes(3).toString('hex');
}

/**
 * Ajoute un avertissement et retourne l'entrée créée + le nouveau total.
 * La sanction appliquée est renseignée ensuite via updateWarnSanction.
 * @returns {{ warn: object, total: number }}
 */
function addWarn(guildId, userId, moderatorId, reason) {
  const guildWarns = store.get(guildId, {});
  const userWarns = guildWarns[userId] ?? [];

  const warn = {
    id: generateId(),
    moderatorId,
    reason,
    createdAt: new Date().toISOString(),
    sanction: null,
  };
  userWarns.push(warn);
  guildWarns[userId] = userWarns;
  store.set(guildId, guildWarns);

  return { warn, total: userWarns.length };
}

/** Renseigne la sanction appliquée sur un warn précis. */
function updateWarnSanction(guildId, userId, warnId, sanction) {
  const guildWarns = store.get(guildId, {});
  const warn = (guildWarns[userId] ?? []).find((entry) => entry.id === warnId);
  if (!warn) return;
  warn.sanction = sanction;
  store.set(guildId, guildWarns);
}

/** @returns {object[]} warns de l'utilisateur (du plus ancien au plus récent) */
function getWarns(guildId, userId) {
  return store.get(guildId, {})[userId] ?? [];
}

function countWarns(guildId, userId) {
  return getWarns(guildId, userId).length;
}

/**
 * Supprime un warn par son identifiant.
 * @returns {{ ok: boolean, total: number }}
 */
function removeWarn(guildId, userId, warnId) {
  const guildWarns = store.get(guildId, {});
  const userWarns = guildWarns[userId] ?? [];
  const filtered = userWarns.filter((entry) => entry.id !== warnId);
  if (filtered.length === userWarns.length) return { ok: false, total: userWarns.length };

  if (filtered.length === 0) delete guildWarns[userId];
  else guildWarns[userId] = filtered;
  store.set(guildId, guildWarns);
  return { ok: true, total: filtered.length };
}

/**
 * Supprime tous les warns d'un utilisateur.
 * @returns {number} nombre de warns supprimés
 */
function clearWarns(guildId, userId) {
  const guildWarns = store.get(guildId, {});
  const count = (guildWarns[userId] ?? []).length;
  if (count > 0) {
    delete guildWarns[userId];
    store.set(guildId, guildWarns);
  }
  return count;
}

/** Tous les warns d'un serveur, aplatis avec userId (base des statistiques). */
function getAllWarns(guildId) {
  const guildWarns = store.get(guildId, {});
  const result = [];
  for (const [userId, warns] of Object.entries(guildWarns)) {
    for (const warn of warns) result.push({ userId, ...warn });
  }
  return result;
}

module.exports = {
  addWarn,
  updateWarnSanction,
  getWarns,
  countWarns,
  removeWarn,
  clearWarns,
  getAllWarns,
};
