/**
 * Persistance des panneaux de tickets (database/data/ticketPanels.json).
 * Structure : { [guildId]: { [panelId]: Panel } }
 *
 * Panel = {
 *   id, guildId, channelId, messageId,
 *   title, description, color, imageUrl, footer,
 *   categoryIds: [],            // une ou plusieurs catégories affichées
 *   displayMode: 'buttons'|'select',
 *   createdAt
 * }
 *
 * Un panneau peut présenter une seule catégorie ou plusieurs. Tout survit
 * aux redémarrages (les composants sont routés par customId, sans registre).
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'ticketPanels.json'));

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function defaults(guildId) {
  return {
    id: generateId(),
    guildId,
    channelId: null,
    messageId: null,
    title: 'Ouvrir un ticket',
    description: 'Sélectionnez une catégorie ci-dessous pour ouvrir un ticket.',
    color: null,
    imageUrl: null,
    footer: '',
    categoryIds: [],
    displayMode: 'buttons',
    createdAt: new Date().toISOString(),
  };
}

function getGuildPanels(guildId) {
  return { ...store.get(guildId, {}) };
}

function getPanel(guildId, panelId) {
  return getGuildPanels(guildId)[panelId] ?? null;
}

function listPanels(guildId) {
  return Object.values(getGuildPanels(guildId)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function savePanel(panel) {
  const panels = getGuildPanels(panel.guildId);
  panels[panel.id] = panel;
  store.set(panel.guildId, panels);
  return panel;
}

function deletePanel(guildId, panelId) {
  const panels = getGuildPanels(guildId);
  if (!panels[panelId]) return false;
  delete panels[panelId];
  store.set(guildId, panels);
  return true;
}

/** Panneaux référençant une catégorie donnée (pour la republication). */
function panelsUsingCategory(guildId, categoryId) {
  return listPanels(guildId).filter((panel) => panel.categoryIds.includes(categoryId));
}

module.exports = {
  generateId,
  defaults,
  getGuildPanels,
  getPanel,
  listPanels,
  savePanel,
  deletePanel,
  panelsUsingCategory,
};
