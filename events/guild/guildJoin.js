/**
 * Lorsque le bot rejoint un serveur : attribution du rôle décoratif
 * « Owner NaoBot » aux owners déjà présents sur ce serveur.
 */
const { Events } = require('discord.js');
const ownerService = require('../../services/owners/ownerService');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    await ownerService.syncOwnerRoles(guild).catch(() => null);
  },
};
