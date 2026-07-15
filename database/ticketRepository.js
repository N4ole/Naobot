/**
 * Persistance du système de tickets (database/data/tickets.json).
 * Tout survit à un redémarrage : panneaux, compteur, tickets ouverts et
 * fermés, archive des tickets supprimés (base des futurs transcripts).
 *
 * Structure par serveur :
 * {
 *   counter,          // compteur incrémental propre au serveur
 *   categoryId,       // catégorie Discord « 📁 Tickets »
 *   panels: { [type]: { channelId, messageId } },
 *   tickets: {        // tickets existants (ouverts ou fermés), par salon
 *     [channelId]: { id, type, userId, status: 'open'|'closed', channelId,
 *                    createdAt, closedAt, closedBy, participants,
 *                    welcomeMessageId }
 *   },
 *   archivedTickets: [ ... tickets supprimés, + deletedAt/deletedBy ]
 * }
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'tickets.json'));
const ARCHIVE_LIMIT = 200;

function defaultGuildData() {
  return { counter: 0, categoryId: null, panels: {}, tickets: {}, archivedTickets: [] };
}

function getGuildData(guildId) {
  return { ...defaultGuildData(), ...store.get(guildId, {}) };
}

function saveGuildData(guildId, data) {
  store.set(guildId, data);
}

/** Incrémente et retourne le compteur de tickets du serveur (persistant). */
function nextTicketNumber(guildId) {
  const data = getGuildData(guildId);
  data.counter += 1;
  saveGuildData(guildId, data);
  return data.counter;
}

function getTicket(guildId, channelId) {
  return getGuildData(guildId).tickets[channelId] ?? null;
}

function saveTicket(guildId, channelId, ticket) {
  const data = getGuildData(guildId);
  data.tickets[channelId] = ticket;
  saveGuildData(guildId, data);
}

/** Archive puis supprime un ticket (le salon est supprimé par le service). */
function archiveTicket(guildId, channelId, extra = {}) {
  const data = getGuildData(guildId);
  const ticket = data.tickets[channelId];
  if (!ticket) return null;
  delete data.tickets[channelId];
  data.archivedTickets = [...data.archivedTickets, { ...ticket, ...extra }].slice(-ARCHIVE_LIMIT);
  saveGuildData(guildId, data);
  return ticket;
}

/** Ticket ouvert d'un utilisateur pour un type donné (null si aucun). */
function findOpenTicketByUser(guildId, userId, type) {
  return (
    Object.values(getGuildData(guildId).tickets).find(
      (ticket) => ticket.userId === userId && ticket.type === type && ticket.status === 'open',
    ) ?? null
  );
}

function countOpenTickets(guildId, type) {
  return Object.values(getGuildData(guildId).tickets).filter(
    (ticket) => ticket.type === type && ticket.status === 'open',
  ).length;
}

module.exports = {
  getGuildData,
  saveGuildData,
  nextTicketNumber,
  getTicket,
  saveTicket,
  archiveTicket,
  findOpenTicketByUser,
  countOpenTickets,
};
