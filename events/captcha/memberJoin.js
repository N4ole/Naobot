/**
 * Écouteur d'arrivée de membre pour le captcha. Délègue au service, qui
 * n'agit que si le captcha est activé et configuré sur le serveur.
 */
const { Events } = require('discord.js');
const captchaService = require('../../services/captcha/captchaService');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await captchaService.handleMemberJoin(member).catch(() => null);
  },
};
