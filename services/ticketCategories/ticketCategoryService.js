/**
 * Catégories de tickets : logique métier (création, édition, suppression,
 * listing) au-dessus du repository. Chaque catégorie est totalement
 * indépendante (configuration, compteur, salon d'affichage, catégorie
 * Discord, format, message d'accueil, comportement).
 *
 * Le schéma est **extensible** : de nouveaux champs (SLA, priorités, tags,
 * formulaires avancés…) peuvent être ajoutés au repository et configurés ici
 * sans refonte des appelants.
 */
const repository = require('../../database/ticketCategoryRepository');

const OPEN_MODES = {
  direct: { key: 'direct', label: 'Ouverture directe' },
  form: { key: 'form', label: 'Formulaire (modal)' },
};

/** Parse une couleur hexadécimale (#rrggbb) en entier, ou null. */
function parseColor(input) {
  if (input == null || input === '') return null;
  const match = String(input).trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? Number.parseInt(match[1], 16) : null;
}

/** Valide un emoji (personnalisé ou Unicode), sinon null. */
function parseEmoji(input) {
  if (!input) return null;
  const value = String(input).trim();
  if (/^<a?:\w{2,}:\d{17,20}>$/.test(value)) return value;
  if (/\p{Extended_Pictographic}/u.test(value)) return value;
  return null;
}

/** Convertit un texte en entier borné (défaut si invalide). */
function parseBoundedInt(input, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const value = Number.parseInt(String(input).trim(), 10);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function getCategory(guildId, categoryId) {
  return repository.getCategory(guildId, categoryId);
}

function listCategories(guildId) {
  return repository.listCategories(guildId);
}

function createCategory(draft) {
  const category = { ...repository.defaults(draft.guildId), ...draft, id: repository.generateId(), createdAt: new Date().toISOString(), counter: 0 };
  return repository.saveCategory(category);
}

function updateCategory(category) {
  return repository.saveCategory(category);
}

function deleteCategory(guildId, categoryId) {
  return repository.deleteCategory(guildId, categoryId);
}

module.exports = {
  OPEN_MODES,
  parseColor,
  parseEmoji,
  parseBoundedInt,
  getCategory,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  defaults: repository.defaults,
  nextNumber: repository.nextNumber,
};
