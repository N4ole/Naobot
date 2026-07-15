/**
 * Lorsque le bot rejoint un serveur : attribution du rôle décoratif
 * « Owner NaoBot » aux owners déjà présents sur ce serveur.
 */
const { Events } = require('discord.js');
const serverBanRepository = require('../../database/serverBanRepository');
const ownerService = require('../../services/owners/ownerService');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    // Serveur banni : aucune initialisation (géré par serverBanGuard).
    if (serverBanRepository.isBanned(guild.id)) return;
    await ownerService.syncOwnerRoles(guild).catch(() => null);
  },
};
