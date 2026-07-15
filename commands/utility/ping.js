/** Commande ping : vérifie que le bot répond et affiche la latence. */
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'ping',
  description: 'Vérifie que le bot répond et affiche sa latence',
  usage: 'ping',
  examples: ['ping'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    return ctx.reply({
      embeds: [infoEmbed('Ping', t('ping.response', { ping: Math.round(ctx.client.ws.ping) }))],
    });
  },
};
