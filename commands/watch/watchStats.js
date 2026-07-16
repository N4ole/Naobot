/**
 * Commandes owner watchtimeuser / watchserveurs (même famille, même
 * fichier) : classements globaux du système de surveillance, paginés par
 * boutons. Réservées aux owners du bot.
 * Les données proviennent de database/watchRepository.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const watchRepository = require('../../database/watchRepository');
const reputationService = require('../../services/reputation/reputationService');
const { checkOwner } = require('../../middlewares/permissions/ownerCheck');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

const PAGE_SIZE = 5;

function paginationRow(prefix, userId, page, pageCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:prev:${userId}:${page}`)
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${prefix}:next:${userId}:${page}`)
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= pageCount - 1),
  );
}

/** Construit une page de classement à partir de lignes déjà triées. */
function rankingPayload(prefix, userId, page, title, rows, renderLine, emptyKey) {
  if (rows.length === 0) {
    return { embeds: [infoEmbed(title, t(emptyKey))], components: [] };
  }
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  const slice = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const lines = slice.map((row, index) => renderLine(row, current * PAGE_SIZE + index + 1));
  const embed = infoEmbed(title, lines.join('\n\n')).setFooter({ text: `Page ${current + 1}/${pageCount}` });
  const components = pageCount > 1 ? [paginationRow(prefix, userId, current, pageCount)] : [];
  return { embeds: [embed], components };
}

// --- Classement des utilisateurs surveillés ---

function userRankingRows() {
  // Agrège par utilisateur, tous serveurs confondus.
  const byUser = new Map();
  for (const { guildId, userId, watch } of watchRepository.getAllWatches()) {
    const entry = byUser.get(userId) ?? { userId, totalDurationMs: 0, watchCount: 0, lastWatchAt: null, guildIds: new Set() };
    entry.totalDurationMs += watch.totalDurationMs ?? 0;
    entry.watchCount += watch.watchCount ?? 0;
    entry.guildIds.add(guildId);
    if (!entry.lastWatchAt || Date.parse(watch.lastWatchAt ?? 0) > Date.parse(entry.lastWatchAt)) {
      entry.lastWatchAt = watch.lastWatchAt ?? entry.lastWatchAt;
    }
    byUser.set(userId, entry);
  }
  return [...byUser.values()].sort((a, b) => b.totalDurationMs - a.totalDurationMs);
}

function renderUserLine(row, rank) {
  return t('watch.stats.userLine', {
    rank,
    user: row.userId,
    duration: formatDuration(row.totalDurationMs),
    count: row.watchCount,
    last: row.lastWatchAt ? `<t:${Math.floor(Date.parse(row.lastWatchAt) / 1000)}:d>` : t('bump.count.never'),
    guilds: row.guildIds.size,
  });
}

function userRankingPayload(userId, page) {
  return rankingPayload(
    'watchtimeuser',
    userId,
    page,
    t('watch.stats.userTitle'),
    userRankingRows(),
    renderUserLine,
    'watch.stats.empty',
  );
}

// --- Classement des serveurs ---

function guildRankingRows() {
  return Object.entries(watchRepository.getAllGuildStats())
    .map(([guildId, stats]) => ({ guildId, ...stats }))
    .sort((a, b) => (b.watchCount ?? 0) - (a.watchCount ?? 0));
}

function renderGuildLine(client, row, rank) {
  const guild = client.guilds.cache.get(row.guildId);
  const reputation = guild
    ? reputationService.formatReputation(reputationService.getOrCompute(guild))
    : t('owners.servers.unknown');
  return t('watch.stats.guildLine', {
    rank,
    guild: guild?.name ?? row.guildId,
    id: row.guildId,
    count: row.watchCount ?? 0,
    duration: formatDuration(row.totalDurationMs ?? 0),
    last: row.lastUsedAt ? `<t:${Math.floor(Date.parse(row.lastUsedAt) / 1000)}:d>` : t('bump.count.never'),
    reputation,
  });
}

function guildRankingPayload(client, userId, page) {
  return rankingPayload(
    'watchserveurs',
    userId,
    page,
    t('watch.stats.guildTitle'),
    guildRankingRows(),
    (row, rank) => renderGuildLine(client, row, rank),
    'watch.stats.empty',
  );
}

/** Pagination owner générique (customId "<prefix>:<action>:<userId>:<page>"). */
function makePaginationHandler(buildPayload) {
  return async function handleComponent(interaction) {
    if (!interaction.isButton()) return;
    const [, action, requesterId, rawPage] = interaction.customId.split(':');
    if (!['prev', 'next'].includes(action)) return;

    const owner = checkOwner(interaction.user.id);
    if (!owner.ok || interaction.user.id !== requesterId) {
      return interaction.reply({ embeds: [errorEmbed(owner.error)], flags: MessageFlags.Ephemeral });
    }
    const current = Number.parseInt(rawPage, 10) || 0;
    const target = action === 'prev' ? current - 1 : current + 1;
    return interaction.update(buildPayload(interaction, target));
  };
}

const watchtimeuser = {
  name: 'watchtimeuser',
  ownerOnly: true,
  description: 'Classement des utilisateurs les plus surveillés (réservé aux owners)',
  usage: 'watchtimeuser',
  examples: ['watchtimeuser'],
  aliases: [],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    return ctx.reply(userRankingPayload(ctx.user.id, 0));
  },
  handleComponent: makePaginationHandler((interaction, page) =>
    userRankingPayload(interaction.user.id, page),
  ),
};

const watchserveurs = {
  name: 'watchserveurs',
  ownerOnly: true,
  description: 'Classement des serveurs utilisant le plus la surveillance (réservé aux owners)',
  usage: 'watchserveurs',
  examples: ['watchserveurs'],
  aliases: [],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    return ctx.reply(guildRankingPayload(ctx.client, ctx.user.id, 0));
  },
  handleComponent: makePaginationHandler((interaction, page) =>
    guildRankingPayload(interaction.client, interaction.user.id, page),
  ),
};

module.exports = [watchtimeuser, watchserveurs];
