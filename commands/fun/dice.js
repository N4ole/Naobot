/**
 * Commande dice : lance un ou plusieurs dés.
 */
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'dice',
  description: 'Lance un ou plusieurs dés',
  usage: 'dice [faces] [nombre]',
  examples: ['dice', 'dice 20', 'dice 6 3'],
  aliases: ['de', 'roll'],
  cooldown: 5,
  args: [
    { name: 'faces', type: 'integer', required: false, min: 2, max: 1000, description: 'Nombre de faces (défaut : 6)' },
    { name: 'nombre', type: 'integer', required: false, min: 1, max: 20, description: 'Nombre de dés (défaut : 1)' },
  ],
  async execute(ctx) {
    const faces = ctx.options.faces ?? 6;
    const count = ctx.options.nombre ?? 1;
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * faces));
    const total = rolls.reduce((sum, roll) => sum + roll, 0);

    return ctx.reply({
      embeds: [
        infoEmbed(
          '🎲 Dés',
          t('fun.dice.result', {
            user: ctx.user.username,
            count,
            faces,
            rolls: rolls.join(', '),
            total,
          }),
        ),
      ],
    });
  },
};
