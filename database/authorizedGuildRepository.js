/**
 * Liste des **serveurs autorisés** pour la commande owner `addperm`
 * (database/data/authorizedGuilds.json).
 *
 * Seuls les serveurs présents dans cette liste permettent à un owner du bot de
 * s'attribuer un rôle administrateur via `addperm`. La liste n'est modifiable
 * que par l'**owner principal** (via la commande `permserver`) : le repository
 * ne fait que persister, le contrôle d'accès est assuré par la commande.
 *
 * Chaque entrée conserve l'auteur et la date d'ajout (traçabilité).
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'authorizedGuilds.json'));
const KEY = 'guilds';

/** @returns {{ id: string, addedBy: string|null, addedAt: string }[]} */
function getAll() {
  const list = store.get(KEY, []);
  return Array.isArray(list) ? list : [];
}

/** @returns {string[]} identifiants des serveurs autorisés */
function getIds() {
  return getAll().map((e) => e.id);
}

/** @param {string} guildId */
function isAuthorized(guildId) {
  return getAll().some((e) => e.id === guildId);
}

/**
 * Ajoute un serveur à la liste.
 * @returns {{ added: boolean }}
 */
function add(guildId, byUserId) {
  const list = getAll();
  if (list.some((e) => e.id === guildId)) return { added: false };
  list.push({ id: guildId, addedBy: byUserId ?? null, addedAt: new Date().toISOString() });
  store.set(KEY, list);
  return { added: true };
}

/**
 * Retire un serveur de la liste.
 * @returns {{ removed: boolean }}
 */
function remove(guildId) {
  const list = getAll();
  const next = list.filter((e) => e.id !== guildId);
  if (next.length === list.length) return { removed: false };
  store.set(KEY, next);
  return { removed: true };
}

module.exports = { getAll, getIds, isAuthorized, add, remove };
