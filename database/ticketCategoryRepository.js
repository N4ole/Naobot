/**
 * Persistance des catégories de tickets (database/data/ticketCategories.json).
 * Structure : { [guildId]: { [categoryId]: Category } }
 *
 * Category = {
 *   id, guildId, name, description, emoji, color,
 *   discordCategoryId,          // catégorie Discord cible (parent des salons)
 *   accessRoleIds: [],          // rôles ayant accès au salon du ticket
 *   pingRoleIds: [], pingUserIds: [],  // à notifier à l'ouverture
 *   logChannelId,               // salon de sortie/logs propre à la catégorie
 *   channelFormat,              // ex. « support-{counter} »
 *   welcomeMessage,             // message d'ouverture (variables {user}…)
 *   openMode: 'direct'|'form',  // ouverture directe ou via formulaire (modal)
 *   counter,                    // compteur **indépendant** et persistant
 *   maxOpen,                    // tickets ouverts simultanés max par membre
 *   cooldownMs,                 // délai imposé entre deux tickets
 *   autoCloseHours,             // fermeture auto après inactivité (0 = off)
 *   autoDeleteHours,            // suppression auto après fermeture (0 = off)
 *   archive,                    // conserver un transcript à la suppression
 *   createdAt
 * }
 *
 * Chaque catégorie possède son propre compteur : les numéros ne sont jamais
 * mélangés entre catégories. Tout survit aux redémarrages.
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'ticketCategories.json'));

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

/** Valeurs par défaut d'une catégorie (schéma extensible). */
function defaults(guildId) {
  return {
    id: generateId(),
    guildId,
    name: 'Nouvelle catégorie',
    description: '',
    emoji: '🎫',
    color: null,
    discordCategoryId: null,
    accessRoleIds: [],
    pingRoleIds: [],
    pingUserIds: [],
    logChannelId: null,
    channelFormat: 'ticket-{counter}',
    welcomeMessage: '',
    openMode: 'direct',
    counter: 0,
    maxOpen: 1,
    cooldownMs: 0,
    autoCloseHours: 0,
    autoDeleteHours: 0,
    archive: true,
    createdAt: new Date().toISOString(),
  };
}

function getGuildCategories(guildId) {
  return { ...store.get(guildId, {}) };
}

function getCategory(guildId, categoryId) {
  return getGuildCategories(guildId)[categoryId] ?? null;
}

function listCategories(guildId) {
  return Object.values(getGuildCategories(guildId)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function saveCategory(category) {
  const categories = getGuildCategories(category.guildId);
  categories[category.id] = category;
  store.set(category.guildId, categories);
  return category;
}

function deleteCategory(guildId, categoryId) {
  const categories = getGuildCategories(guildId);
  if (!categories[categoryId]) return false;
  delete categories[categoryId];
  store.set(guildId, categories);
  return true;
}

/** Incrémente et retourne le compteur **propre** à la catégorie. */
function nextNumber(guildId, categoryId) {
  const categories = getGuildCategories(guildId);
  const category = categories[categoryId];
  if (!category) return null;
  category.counter = (category.counter ?? 0) + 1;
  store.set(guildId, categories);
  return category.counter;
}

module.exports = {
  generateId,
  defaults,
  getGuildCategories,
  getCategory,
  listCategories,
  saveCategory,
  deleteCategory,
  nextNumber,
};
