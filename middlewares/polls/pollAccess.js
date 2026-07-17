/**
 * Middleware des sondages : la création et la gestion (fermeture) sont
 * réservées aux membres pouvant gérer les messages ; un sondage ne peut
 * être fermé/administré que par son créateur ou un gestionnaire.
 * Le vote, lui, est ouvert à tous (géré dans la commande).
 */
const { PermissionFlagsBits } = require('discord.js');

function canManagePolls(member) {
  return member.permissions.has(PermissionFlagsBits.ManageMessages);
}

function canManagePoll(member, poll) {
  return poll.creatorId === member.id || canManagePolls(member);
}

module.exports = { canManagePolls, canManagePoll };
