/**
 * Pendant le mode urgence, tout salon nouvellement créé est immédiatement
 * verrouillé pour @everyone, afin d'empêcher tout contournement du
 * verrouillage. Le mode urgence lui-même (activation/désactivation) est géré
 * par la commande urgence ; cet écouteur n'agit que si le mode est actif.
 */
const { Events, PermissionFlagsBits } = require('discord.js');
const emergencyService = require('../../services/emergency/emergencyService');

module.exports = {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel.guild || !channel.manageable) return;
    if (!emergencyService.isActive(channel.guild.id)) return;

    const denyMap = Object.fromEntries(emergencyService.LOCK_FLAGS.map((flag) => [flag, false]));
    await channel.permissionOverwrites
      .edit(channel.guild.roles.everyone, denyMap, { reason: "Mode urgence actif : nouveau salon verrouillé" })
      .catch(() => null);
  },
};
