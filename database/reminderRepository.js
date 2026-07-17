/**
 * Persistance des rappels personnels (database/data/reminders.json).
 * Structure : { [id]: Reminder }
 * Reminder = { id, userId, guildId, channelId, messageUrl, message,
 *              createdAt, executeAt }
 *
 * Les rappels sont personnels (indépendants du serveur pour l'utilisateur)
 * mais conservent le contexte d'origine (guild/salon/lien). Tout survit aux
 * redémarrages : au démarrage, les rappels échus sont exécutés par le
 * planificateur.
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'reminders.json'));

function generateId() {
  return crypto.randomBytes(3).toString('hex');
}

function getAll() {
  return { ...store.get('reminders', {}) };
}

function getReminder(id) {
  return getAll()[id] ?? null;
}

/** Rappels d'un utilisateur, triés par date d'exécution croissante. */
function getByUser(userId) {
  return Object.values(getAll())
    .filter((reminder) => reminder.userId === userId)
    .sort((a, b) => a.executeAt - b.executeAt);
}

function save(reminder) {
  const all = getAll();
  all[reminder.id] = reminder;
  store.set('reminders', all);
}

function remove(id) {
  const all = getAll();
  if (!(id in all)) return false;
  delete all[id];
  store.set('reminders', all);
  return true;
}

module.exports = { generateId, getAll, getReminder, getByUser, save, remove };
