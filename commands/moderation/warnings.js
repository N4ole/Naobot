/**
 * Commande warnings : liste paginée des avertissements d'un membre (raisons,
 * modérateurs, dates, sanctions appliquées). La logique métier vit dans
 * services/warnings/warnService ; l'affichage des sanctions dans sanctionService.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const warnService = require('../../services/warnings/warnService');
const sanctionService = require('../../services/warnings/sanctionService');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const PAGE_SIZE = 5;

/** Construit une page (userId + page portés par le customId : sans état). */
function buildPayload(guild, user, page) {
  const warns = warnService.getWarnings(guild.id, user.id);
  if (warns.length === 0) {
    return { embeds: [errorEmbed(t('warns.command.none', { user: user.tag }))], components: [], empty: true };
  }

  const pageCount = Math.ceil(warns.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  const slice = warns.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const lines = slice.map((warn) =>
    t('warns.command.entry', {
      id: warn.id,
      timestamp: Math.floor(Date.parse(warn.createdAt) / 1000),
      moderatorId: warn.moderatorId,
      reason: warn.reason,
      sanction: warn.sanction ? sanctionService.describeSanction(warn.sanction) : t('warns.sanction.none'),
    }),
  );
  const embed = infoEmbed(
    t('warns.command.listTitle', { user: user.tag, count: warns.length }),
    lines.join('\n\n'),
  ).setFooter({ text: `Page ${current + 1}/${pageCount}` });

  const components =
    pageCount > 1
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`warnings:prev:${user.id}:${current}`)
              .setEmoji('◀️')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(current === 0),
            new ButtonBuilder()
              .setCustomId(`warnings:next:${user.id}:${current}`)
              .setEmoji('▶️')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(current >= pageCount - 1),
          ),
        ]
      : [];
  return { embeds: [embed], components };
}

module.exports = {
  name: 'warnings',
  description: "Affiche les avertissements d'un membre (raisons, modérateurs, dates, sanctions)",
  usage: 'warnings <utilisateur>',
  examples: ['warnings @Utilisateur'],
  aliases: ['warns'],
  cooldown: 3,
  args: [
    { name: 'utilisateur', type: 'user', required: true, description: 'Le membre dont afficher les avertissements' },
  ],
  async execute(ctx) {
    const payload = buildPayload(ctx.guild, ctx.options.utilisateur, 0);
    return ctx.reply({ embeds: payload.embeds, components: payload.components, ephemeral: payload.empty });
  },

  /** Pagination (customId "warnings:<action>:<userId>:<page>"). */
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const [, action, targetId, rawPage] = interaction.customId.split(':');
    if (!['prev', 'next'].includes(action)) return;

    const user = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!user) return interaction.deferUpdate();
    const current = Number.parseInt(rawPage, 10) || 0;
    const target = action === 'prev' ? current - 1 : current + 1;
    return interaction.update(buildPayload(interaction.guild, user, target));
  },
};
