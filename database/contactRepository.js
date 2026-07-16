/**
 * Persistance des conversations de contact (database/data/contact.json).
 *
 * Structure :
 * {
 *   "counter": <number>,                 // pour les identifiants CONTACT-000001
 *   "conversations": {
 *     "CONTACT-000001": {
 *       id, guildId, guildName, ownerId (propriétaire du serveur), ownerName,
 *       status, createdAt, lastActivityAt,
 *       respondedBy: [ownerId, …],       // owners du bot ayant répondu
 *       messages: [ { from: 'owner'|'botOwner', authorId, authorName,
 *                     content, at } ]
 *     }
 *   }
 * }
 *
 * Tout survit aux redémarrages. « owner » = propriétaire du serveur ;
 * « botOwner » = owner du bot (NaoBot).
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'contact.json'));

/** Identifiant lisible et unique : CONTACT-000001, CONTACT-000002… */
function nextId() {
  const counter = store.get('counter', 0) + 1;
  store.set('counter', counter);
  return `CONTACT-${String(counter).padStart(6, '0')}`;
}

function getConversation(id) {
  return store.get('conversations', {})[id] ?? null;
}

function saveConversation(conversation) {
  const conversations = store.get('conversations', {});
  conversations[conversation.id] = conversation;
  store.set('conversations', conversations);
}

/** @returns {object[]} toutes les conversations (récentes d'abord) */
function getAllConversations() {
  return Object.values(store.get('conversations', {})).sort(
    (a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
  );
}

/** Ajoute un message à une conversation et met à jour la dernière activité. */
function addMessage(id, message) {
  const conversation = getConversation(id);
  if (!conversation) return null;
  conversation.messages.push(message);
  conversation.lastActivityAt = message.at;
  saveConversation(conversation);
  return conversation;
}

module.exports = {
  nextId,
  getConversation,
  saveConversation,
  getAllConversations,
  addMessage,
};
