/**
 * Persistance des panneaux de rôles réactions (database/data/reactionRoles.json).
 * Structure : { [guildId]: { [panelId]: Panel } }
 *
 * Panel = {
 *   id, guildId, channelId, messageId,
 *   title, description, color, imageUrl, footer,
 *   mode, limit,
 *   roles: [ { roleId, emoji, label, description } ],
 *   createdAt, updatedAt,
 *   history: [ { at, action, by } ],
 *   stats: { assigns, removes }
 * }
 *
 * Tout survit aux redémarrages : au démarrage, les composants restent
 * fonctionnels car ils sont routés par le préfixe de leur customId
 * (aucun ré-enregistrement nécessaire — voir events/reactionRoles).
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'reactionRoles.json'));

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function getGuildPanels(guildId) {
  return { ...store.get(guildId, {}) };
}

function getPanel(guildId, panelId) {
  return getGuildPanels(guildId)[panelId] ?? null;
}

/** Panneau associé à un message publié (routage des interactions live). */
function getPanelByMessage(guildId, messageId) {
  return Object.values(getGuildPanels(guildId)).find((panel) => panel.messageId === messageId) ?? null;
}

function savePanel(guildId, panel) {
  const panels = getGuildPanels(guildId);
  panels[panel.id] = panel;
  store.set(guildId, panels);
}

function deletePanel(guildId, panelId) {
  const panels = getGuildPanels(guildId);
  if (!(panelId in panels)) return false;
  delete panels[panelId];
  store.set(guildId, panels);
  return true;
}

/** Tous les panneaux, tous serveurs confondus (démarrage, statistiques). */
function getAllPanels() {
  const result = [];
  for (const [guildId, panels] of Object.entries(store.all())) {
    for (const panel of Object.values(panels)) result.push({ guildId, ...panel });
  }
  return result;
}

module.exports = {
  generateId,
  getGuildPanels,
  getPanel,
  getPanelByMessage,
  savePanel,
  deletePanel,
  getAllPanels,
};
