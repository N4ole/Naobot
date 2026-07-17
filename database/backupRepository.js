/**
 * Persistance des sauvegardes de serveur (database/data/backups.json).
 * Structure : { [guildId]: Backup[] }
 * Backup = { id, name, createdBy, createdAt, data }
 *
 * Le nombre de sauvegardes par serveur est plafonné (MAX_BACKUPS) : au-delà,
 * la plus ancienne est supprimée. Tout survit aux redémarrages.
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'backups.json'));
const MAX_BACKUPS = 10;

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function getBackups(guildId) {
  return [...store.get(guildId, [])];
}

function getBackup(guildId, backupId) {
  return getBackups(guildId).find((backup) => backup.id === backupId) ?? null;
}

/**
 * Ajoute une sauvegarde (plafonnée à MAX_BACKUPS, plus ancienne évincée).
 * @returns {{ backup: object, evicted: object|null }}
 */
function addBackup(guildId, backup) {
  const backups = getBackups(guildId);
  backups.push(backup);
  let evicted = null;
  while (backups.length > MAX_BACKUPS) evicted = backups.shift();
  store.set(guildId, backups);
  return { backup, evicted };
}

function deleteBackup(guildId, backupId) {
  const backups = getBackups(guildId);
  const filtered = backups.filter((backup) => backup.id !== backupId);
  if (filtered.length === backups.length) return false;
  store.set(guildId, filtered);
  return true;
}

module.exports = { MAX_BACKUPS, generateId, getBackups, getBackup, addBackup, deleteBackup };
