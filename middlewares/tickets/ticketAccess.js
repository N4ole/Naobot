/**
 * Middleware des tickets.
 *
 *  - isAdmin        : configuration (catégories, panneaux) réservée aux
 *                     administrateurs.
 *  - canManageTicket: gestion d'un ticket par son créateur, le modérateur
 *                     assigné, ou un membre de l'équipe (Administrateur /
 *                     Gérer les salons / Modérer les membres).
 *  - checkTicketContext : vérifie que le salon est un ticket et que le membre
 *                     a le droit d'agir dessus.
 */
const { PermissionFlagsBits } = require('discord.js');
const repository = require('../../database/ticketRepository');
const { t } = require('../../utils/helpers/i18n');

const STAFF_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ModerateMembers,
];

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function isStaff(member) {
  return member.permissions.any(STAFF_PERMISSIONS);
}

function canManageTicket(member, ticket) {
  if (member.id === ticket.userId) return true;
  if (ticket.assignedTo && member.id === ticket.assignedTo) return true;
  return isStaff(member);
}

/**
 * @returns {{ ok: true, ticket: object } | { ok: false, error: string }}
 */
function checkTicketContext(guildId, channelId, member) {
  const ticket = repository.getTicket(guildId, channelId);
  if (!ticket) return { ok: false, error: t('tickets.errors.notTicketChannel') };
  if (!canManageTicket(member, ticket)) return { ok: false, error: t('tickets.errors.noPermission') };
  return { ok: true, ticket };
}

module.exports = { isAdmin, isStaff, canManageTicket, checkTicketContext };
