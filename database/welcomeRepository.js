/**
 * Persistance de la configuration de bienvenue par serveur
 * (database/data/welcome.json).
 *
 * config par serveur :
 * {
 *   enabled, channelId, message, color, template,
 *   dmEnabled, dmMessage, autoRoleIds: [],
 *   questions: [ "…" ],
 *   answers: { "<userId>": { at, responses: [ { question, answer } ] } }
 * }
 *
 * Placeholders des messages : {user} {username} {server} {count}.
 * Tout survit aux redémarrages.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'welcome.json'));

function defaults() {
  return {
    enabled: false,
    channelId: null,
    message: 'Bienvenue {user} sur **{server}** ! Tu es notre {count}ᵉ membre. 🎉',
    color: null,
    template: 'classic',
    dmEnabled: false,
    dmMessage: 'Bienvenue sur **{server}** ! N’hésite pas à lire les règles.',
    autoRoleIds: [],
    questions: [],
    answers: {},
  };
}

function getConfig(guildId) {
  return { ...defaults(), ...store.get(guildId, {}) };
}

function saveConfig(guildId, config) {
  store.set(guildId, config);
}

/** Enregistre les réponses aux questions d'accueil d'un membre. */
function saveAnswers(guildId, userId, responses) {
  const config = getConfig(guildId);
  config.answers[userId] = { at: new Date().toISOString(), responses };
  saveConfig(guildId, config);
}

module.exports = { defaults, getConfig, saveConfig, saveAnswers };
