/**
 * Commande 8ball : la boule magique répond à une question.
 */
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t, tList } = require('../../utils/helpers/i18n');

module.exports = {
  name: '8ball',
  description: 'Pose une question à la boule magique',
  usage: '8ball <question>',
  examples: ['8ball Vais-je gagner au loto ?'],
  aliases: ['boule'],
  cooldown: 5,
  args: [
    { name: 'question', type: 'string', required: true, rest: true, description: 'Votre question' },
  ],
  async execute(ctx) {
    const answers = tList('fun.eightball.answers');
    const answer = answers[Math.floor(Math.random() * answers.length)] ?? '…';
    const embed = infoEmbed('🎱 8ball', null).addFields(
      { name: t('fun.eightball.question'), value: ctx.options.question.slice(0, 1024) },
      { name: t('fun.eightball.answer'), value: answer },
    );
    return ctx.reply({ embeds: [embed] });
  },
};
