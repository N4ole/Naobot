/**
 * Au démarrage : lance le planificateur du captcha (expulse les membres
 * n'ayant pas validé dans le délai imparti, y compris après un redémarrage —
 * les vérifications en attente sont persistées).
 */
const { Events } = require('discord.js');
const captchaService = require('../../services/captcha/captchaService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    captchaService.startScheduler(client);
    console.log('[captcha] Planificateur de vérifications démarré.');
  },
};
