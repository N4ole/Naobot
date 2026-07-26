/**
 * Persistance des tickets (database/data/tickets.json).
 * Structure par serveur :
 * {
 *   tickets: { [channelId]: Ticket },   // tickets ouverts ou fermés
 *   archived: [ Ticket + { deletedAt, deletedBy, transcriptFile } ],
 *   stats: { [categoryId]: { total, closed, totalHandlingMs, moderators: {} } }
 * }
 *
 * Ticket = {
 *   id,                // numéro **propre à la catégorie** (compteur dédié)
 *   categoryId, guildId, channelId, channelName, userId, subject,
 *   status: 'open'|'closed', assignedTo,
 *   participants: [], createdAt, closedAt, closedBy,
 *   lastActivityAt,    // pour la fermeture automatique par inactivité
 *   welcomeMessageId
 * }
 *
 * Tout survit aux redémarrages : tickets, assignations, statistiques.
 */
const path = require('node:path');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'tickets.json'));
const ARCHIVE_LIMIT = 500;

function defaultGuildData() {
  return { tickets: {}, archived: [], stats: {} };
}

function getGuildData(guildId) {
  return { ...defaultGuildData(), ...store.get(guildId, {}) };
}

function saveGuildData(guildId, data) {
  store.set(guildId, data);
}

// --- Tickets ---

function getTicket(guildId, channelId) {
  return getGuildData(guildId).tickets[channelId] ?? null;
}

function saveTicket(ticket) {
  const data = getGuildData(ticket.guildId);
  data.tickets[ticket.channelId] = ticket;
  saveGuildData(ticket.guildId, data);
  return ticket;
}

function listTickets(guildId) {
  return Object.values(getGuildData(guildId).tickets);
}

function listOpenTickets(guildId) {
  return listTickets(guildId).filter((ticket) => ticket.status === 'open');
}

function listByCategory(guildId, categoryId) {
  return listTickets(guildId).filter((ticket) => ticket.categoryId === categoryId);
}

/** Tickets ouverts d'un membre dans une catégorie (limite maxOpen). */
function openByUser(guildId, userId, categoryId) {
  return listTickets(guildId).filter(
    (ticket) => ticket.userId === userId && ticket.categoryId === categoryId && ticket.status === 'open',
  );
}

/** Date de création du dernier ticket d'un membre dans une catégorie (cooldown). */
function lastCreatedAt(guildId, userId, categoryId) {
  const all = [
    ...listTickets(guildId),
    ...getGuildData(guildId).archived,
  ].filter((ticket) => ticket.userId === userId && ticket.categoryId === categoryId);
  if (all.length === 0) return null;
  return all.reduce((max, ticket) => Math.max(max, Date.parse(ticket.createdAt) || 0), 0);
}

/** Archive un ticket (retiré des tickets actifs) et retourne l'entrée. */
function archiveTicket(guildId, channelId, extra = {}) {
  const data = getGuildData(guildId);
  const ticket = data.tickets[channelId];
  if (!ticket) return null;
  delete data.tickets[channelId];
  data.archived = [...data.archived, { ...ticket, ...extra }].slice(-ARCHIVE_LIMIT);
  saveGuildData(guildId, data);
  return ticket;
}

// --- Statistiques (incrémentales, persistantes) ---

function ensureStats(data, categoryId) {
  if (!data.stats[categoryId]) {
    data.stats[categoryId] = { total: 0, closed: 0, totalHandlingMs: 0, moderators: {} };
  }
  return data.stats[categoryId];
}

function recordCreated(guildId, categoryId) {
  const data = getGuildData(guildId);
  ensureStats(data, categoryId).total += 1;
  saveGuildData(guildId, data);
}

function recordClosed(guildId, categoryId, handlingMs, moderatorId) {
  const data = getGuildData(guildId);
  const stats = ensureStats(data, categoryId);
  stats.closed += 1;
  stats.totalHandlingMs += Math.max(0, handlingMs || 0);
  if (moderatorId) stats.moderators[moderatorId] = (stats.moderators[moderatorId] ?? 0) + 1;
  saveGuildData(guildId, data);
}

function getStats(guildId) {
  return getGuildData(guildId).stats;
}

// --- Planificateur (tous serveurs) ---

/** Tous les tickets (ouverts et fermés) de tous les serveurs, avec guildId. */
function allTickets() {
  const result = [];
  for (const [guildId, data] of Object.entries(store.all())) {
    for (const ticket of Object.values(data.tickets ?? {})) result.push({ ...ticket, guildId });
  }
  return result;
}

/** Donnees brutes de tous les serveurs : { [guildId]: { tickets, archived, stats } }. */
function allGuildData() {
  return store.all();
}

module.exports = {
  allGuildData,
  getGuildData,
  saveGuildData,
  getTicket,
  saveTicket,
  listTickets,
  listOpenTickets,
  listByCategory,
  openByUser,
  lastCreatedAt,
  archiveTicket,
  recordCreated,
  recordClosed,
  getStats,
  allTickets,
};
