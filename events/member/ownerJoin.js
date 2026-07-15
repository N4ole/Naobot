/**
 * Attribution automatique du rôle décoratif « Owner NaoBot » lorsqu'un
 * owner du bot rejoint un serveur (rôle créé au besoin, sans doublon).
 */
const { Events } = require('discord.js');
const ownerService = require('../../services/owners/ownerService');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (!ownerService.isOwner(member.id)) return;
    await ownerService.assignOwnerRole(member.guild, member);
  },
};
