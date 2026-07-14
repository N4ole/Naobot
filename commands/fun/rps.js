/**
 * Commande rps : pierre-feuille-ciseaux contre le bot, avec des boutons.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const CHOICES = [
  { key: 'pierre', emoji: '🪨' },
  { key: 'feuille', emoji: '📄' },
  { key: 'ciseaux', emoji: '✂️' },
];

/** Retourne 'win', 'lose' ou 'tie' pour le joueur. */
function outcome(playerKey, botKey) {
  if (playerKey === botKey) return 'tie';
  const beats = { pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' };
  return beats[playerKey] === botKey ? 'win' : 'lose';
}

function buttonsRow() {
  return new ActionRowBuilder().addComponents(
    CHOICES.map((choice) =>
      new ButtonBuilder()
        .setCustomId(`rps:${choice.key}`)
        .setEmoji(choice.emoji)
        .setLabel(t(`fun.rps.choices.${choice.key}`))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

module.exports = {
  name: 'rps',
  description: 'Pierre-feuille-ciseaux contre le bot',
  usage: 'rps',
  examples: ['rps'],
  aliases: ['pfc', 'chifoumi'],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    return ctx.reply({
      embeds: [infoEmbed('🪨📄✂️ Pierre-feuille-ciseaux', t('fun.rps.prompt'))],
      components: [buttonsRow()],
    });
  },

  /** Boutons "rps:<choix>" : chaque clic joue une manche (réponse éphémère). */
  async handleComponent(interaction) {
    const playerKey = interaction.customId.split(':')[1];
    if (!CHOICES.some((choice) => choice.key === playerKey)) return;

    const botChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
    const result = outcome(playerKey, botChoice.key);
    const player = CHOICES.find((choice) => choice.key === playerKey);

    return interaction.reply({
      embeds: [
        infoEmbed(
          '🪨📄✂️ Pierre-feuille-ciseaux',
          t('fun.rps.result', {
            player: `${player.emoji} ${t(`fun.rps.choices.${playerKey}`)}`,
            bot: `${botChoice.emoji} ${t(`fun.rps.choices.${botChoice.key}`)}`,
            outcome: t(`fun.rps.outcomes.${result}`),
          }),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
