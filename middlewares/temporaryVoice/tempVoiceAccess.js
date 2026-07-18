/**
 * Middleware des salons vocaux temporaires.
 *
 *  - isAdmin        : la configuration des générateurs est réservée aux
 *                     administrateurs.
 *  - isTempOwner    : un salon temporaire ne peut être renommé que par son
 *                     propriétaire, et seulement s'il s'y trouve.
 */
const { PermissionFlagsBits } = require('discord.js');
const repository = require('../../database/tempVoiceRepository');

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/** true si `member` est le propriétaire du salon temporaire `channelId`. */
function isTempOwner(guildId, channelId, memberId) {
  const temp = repository.getTemp(guildId, channelId);
  return Boolean(temp && temp.ownerId === memberId);
}

module.exports = { isAdmin, isTempOwner };
