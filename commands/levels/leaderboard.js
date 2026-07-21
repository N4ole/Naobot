/**
 * Commande leaderboard : classement des membres par XP (niveau, XP, messages,
 * temps vocal), paginé et navigable par boutons.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const levelService = require('../../services/levels/levelService');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const emojis = require('../../config/emojis');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

const PAGE_SIZE = 10;

function buildPayload(guild, page) {
  const entries = levelService.leaderboard(guild.id);
  if (entries.length === 0) {
    return { embeds: [errorEmbed(t('levels.leaderboard.empty'))], components: [], ephemeral: true };
  }
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = entries.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const lines = slice.map((e) =>
    t('levels.leaderboard.entry', {
      rank: e.rank,
      user: `<@${e.userId}>`,
      level: e.level,
      xp: e.xp,
      messages: e.messages,
      voice: e.voiceMs > 0 ? formatDuration(e.voiceMs) : '—',
    }),
  );
  const embed = infoEmbed(`${emojis.get('party')} ${t('levels.leaderboard.title', { guild: guild.name })}`, lines.join('\n')).setFooter({
    text: t('levels.leaderboard.footer', { page: current + 1, pages, total: entries.length }),
  });

  const components =
    pages > 1
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`leaderboard:page:${current - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
            new ButtonBuilder().setCustomId(`leaderboard:page:${current + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pages - 1),
          ),
        ]
      : [];
  return { embeds: [embed], components };
}

module.exports = {
  name: 'leaderboard',
  description: 'Classement des membres par niveau et activité',
  usage: 'leaderboard',
  examples: ['leaderboard'],
  aliases: ['classement', 'lb', 'top'],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    if (!levelService.isEnabled(ctx.guild.id)) {
      return ctx.reply({ embeds: [errorEmbed(t('levels.disabled'))], ephemeral: true });
    }
    return ctx.reply(buildPayload(ctx.guild, 0));
  },

  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const [, kind, rawPage] = interaction.customId.split(':');
    if (kind !== 'page') return;
    return interaction.update(buildPayload(interaction.guild, Number.parseInt(rawPage, 10) || 0));
  },
};
