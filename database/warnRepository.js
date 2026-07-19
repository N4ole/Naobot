/**
 * Persistance des avertissements (database/data/warns.json).
 * Structure : { [guildId]: { [userId]: Warn[] } }
 * Warn = { id, moderatorId, reason, createdAt,
 *          sanction: { type, durationMs?, level, applied } | null,
 *          removedAt?, removedBy? }
 *
 * Un warn retiré par `unwarn` est **conservé dans l'historique** (soft-delete :
 * `removedAt`/`removedBy` renseignés) mais n'est plus « actif » : il ne compte
 * plus dans le total ni dans la résolution de la sanction. La configuration des
 * sanctions vit séparément dans database/warnConfigRepository.
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

function isActive(warn) {
  return !warn.removedAt;
}

/** @returns {object[]} tout l'historique des warns (actifs + retirés). */
function getWarns(guildId, userId) {
  return store.get(guildId, {})[userId] ?? [];
}

/** @returns {object[]} warns actifs uniquement (hors retirés). */
function getActiveWarns(guildId, userId) {
  return getWarns(guildId, userId).filter(isActive);
}

/** Nombre de warns **actifs** (base de la sanction progressive). */
function countWarns(guildId, userId) {
  return getActiveWarns(guildId, userId).length;
}

/**
 * Retire un warn par son identifiant (soft-delete : conservé dans l'historique).
 * @returns {{ ok: boolean, total: number }} total = nombre de warns actifs restants
 */
function removeWarn(guildId, userId, warnId, byUserId = null) {
  const guildWarns = store.get(guildId, {});
  const userWarns = guildWarns[userId] ?? [];
  const warn = userWarns.find((entry) => entry.id === warnId && isActive(entry));
  if (!warn) return { ok: false, total: userWarns.filter(isActive).length };

  warn.removedAt = new Date().toISOString();
  warn.removedBy = byUserId;
  store.set(guildId, guildWarns);
  return { ok: true, total: userWarns.filter(isActive).length };
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

/** Warns **actifs** d'un serveur, aplatis avec userId (base des statistiques). */
function getAllWarns(guildId) {
  const guildWarns = store.get(guildId, {});
  const result = [];
  for (const [userId, warns] of Object.entries(guildWarns)) {
    for (const warn of warns) if (isActive(warn)) result.push({ userId, ...warn });
  }
  return result;
}

module.exports = {
  addWarn,
  updateWarnSanction,
  getWarns,
  getActiveWarns,
  countWarns,
  removeWarn,
  clearWarns,
  getAllWarns,
};
