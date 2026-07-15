/**
 * Commande coinflip : pile ou face.
 */
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'coinflip',
  description: 'Lance une pièce : pile ou face',
  usage: 'coinflip',
  examples: ['coinflip'],
  aliases: ['pileouface', 'pf'],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    const result = Math.random() < 0.5 ? t('fun.coinflip.heads') : t('fun.coinflip.tails');
    return ctx.reply({
      embeds: [infoEmbed('🪙 Pile ou face', t('fun.coinflip.result', { result }))],
    });
  },
};
