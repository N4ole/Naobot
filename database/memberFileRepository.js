/**
 * Persistance des **dossiers membres** — notes de modération **globales et
 * inter-serveurs** sur un utilisateur Discord (database/data/memberFiles.json).
 *
 * Contrairement aux autres données (indexées par serveur), un dossier est
 * **indépendant des serveurs** : il est indexé par identifiant d'utilisateur
 * **cible**. Chaque note conserve son serveur d'origine.
 *
 * Structure : { [targetUserId]: Note[] }
 * Note = { id, userId, content, authorId, authorTag, guildId, guildName, createdAt }
 *
 * Volontairement extensible (pièces jointes, catégories, gravité, tags,
 * historique des modifications) : ajouter un champ à la note n'impacte pas les
 * lecteurs existants.
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'memberFiles.json'));

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

/** Notes d'un utilisateur (les plus récentes en dernier). */
function getNotes(userId) {
  return store.get(userId, []);
}

/**
 * Ajoute une note au dossier d'un utilisateur.
 * @returns {object} la note créée
 */
function addNote(userId, { content, authorId, authorTag, guildId, guildName }) {
  const notes = getNotes(userId);
  const note = {
    id: generateId(),
    userId,
    content,
    authorId,
    authorTag: authorTag ?? null,
    guildId: guildId ?? null,
    guildName: guildName ?? null,
    createdAt: new Date().toISOString(),
  };
  notes.push(note);
  store.set(userId, notes);
  return note;
}

/** Retrouve une note par son identifiant (recherche globale). */
function findNote(noteId) {
  for (const [userId, notes] of Object.entries(store.all())) {
    const note = notes.find((entry) => entry.id === noteId);
    if (note) return { userId, note };
  }
  return null;
}

/**
 * Supprime une note par identifiant.
 * @returns {{ userId: string, note: object } | null} la note retirée, ou null
 */
function deleteNote(noteId) {
  for (const [userId, notes] of Object.entries(store.all())) {
    const index = notes.findIndex((entry) => entry.id === noteId);
    if (index === -1) continue;
    const [note] = notes.splice(index, 1);
    if (notes.length === 0) store.set(userId, []);
    else store.set(userId, notes);
    return { userId, note };
  }
  return null;
}

/** Statistiques d'un dossier : nombre de notes et de serveurs concernés. */
function stats(userId) {
  const notes = getNotes(userId);
  const guilds = new Set(notes.map((note) => note.guildId).filter(Boolean));
  return { noteCount: notes.length, guildsCount: guilds.size };
}

module.exports = { getNotes, addNote, findNote, deleteNote, stats };
