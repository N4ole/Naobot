/**
 * Middleware des tickets : vérifie qu'un salon est bien un ticket et que
 * le membre a le droit de le gérer (créateur du ticket, ou modérateur —
 * Administrateur / Gérer les salons / Modérer les membres).
 * Utilisé par les commandes ticket* et par tous les composants.
 */
const { PermissionFlagsBits } = require('discord.js');
const repository = require('../../database/ticketRepository');
const { t } = require('../../utils/helpers/i18n');

/** true si le membre peut gérer ce ticket. */
function canManageTicket(member, ticket) {
  if (member.id === ticket.userId) return true;
  return member.permissions.any([
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ModerateMembers,
  ]);
}

/**
 * Vérifie le contexte complet : salon = ticket, et membre autorisé.
 * @returns {{ ok: true, ticket: object } | { ok: false, error: string }}
 */
function checkTicketContext(guildId, channelId, member) {
  const ticket = repository.getTicket(guildId, channelId);
  if (!ticket) return { ok: false, error: t('tickets.errors.notTicketChannel') };
  if (!canManageTicket(member, ticket)) return { ok: false, error: t('tickets.errors.noPermission') };
  return { ok: true, ticket };
}

module.exports = { canManageTicket, checkTicketContext };
