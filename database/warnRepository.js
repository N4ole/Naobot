/**
 * Accès aux avertissements persistés.
 * Structure : { [guildId]: { [userId]: Warn[] } }
 * Warn = { id, moderatorId, reason, createdAt }
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'warns.json'));

/**
 * Ajoute un avertissement et retourne l'entrée créée + le total.
 * @returns {{ warn: object, total: number }}
 */
function addWarn(guildId, userId, moderatorId, reason) {
  const guildWarns = store.get(guildId, {});
  const userWarns = guildWarns[userId] ?? [];

  const warn = {
    id: crypto.randomBytes(3).toString('hex'),
    moderatorId,
    reason,
    createdAt: new Date().toISOString(),
  };
  userWarns.push(warn);
  guildWarns[userId] = userWarns;
  store.set(guildId, guildWarns);

  return { warn, total: userWarns.length };
}

/** @returns {object[]} avertissements de l'utilisateur (du plus ancien au plus récent) */
function getWarns(guildId, userId) {
  return store.get(guildId, {})[userId] ?? [];
}

module.exports = { addWarn, getWarns };
