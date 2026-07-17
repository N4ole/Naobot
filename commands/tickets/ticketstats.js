/**
 * Commande ticketstats : statistiques du système de tickets, par catégorie
 * et globales (nombre total, temps moyen de traitement, modérateurs les plus
 * actifs, catégories les plus utilisées). Réservée à « Gérer le serveur ».
 * Les statistiques sont persistées (survivent aux redémarrages).
 */
const ticketRepository = require('../../database/ticketRepository');
const categoryService = require('../../services/ticketCategories/ticketCategoryService');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const TOP = 5;

module.exports = {
  name: 'ticketstats',
  description: 'Statistiques du système de tickets (par catégorie et globales)',
  usage: 'ticketstats',
  examples: ['ticketstats'],
  aliases: ['ticketstatistics'],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    const stats = ticketRepository.getStats(ctx.guild.id);
    const categories = categoryService.listCategories(ctx.guild.id);
    const nameOf = (id) => {
      const category = categories.find((entry) => entry.id === id);
      return category ? `${category.emoji ?? '🎫'} ${category.name}` : `\`${id}\``;
    };

    const entries = Object.entries(stats);
    if (entries.length === 0) {
      return ctx.reply({ embeds: [infoEmbed(t('tickets.stats.title'), t('tickets.stats.empty'))], ephemeral: true });
    }

    const totalTickets = entries.reduce((sum, [, s]) => sum + (s.total ?? 0), 0);
    const totalClosed = entries.reduce((sum, [, s]) => sum + (s.closed ?? 0), 0);
    const totalHandlingMs = entries.reduce((sum, [, s]) => sum + (s.totalHandlingMs ?? 0), 0);
    const avgHandling = totalClosed > 0 ? formatDuration(Math.round(totalHandlingMs / totalClosed)) : '—';

    // Catégories les plus utilisées.
    const topCategories = entries
      .sort((a, b) => (b[1].total ?? 0) - (a[1].total ?? 0))
      .slice(0, TOP)
      .map(([id, s]) => t('tickets.stats.categoryEntry', { category: nameOf(id), total: s.total ?? 0, closed: s.closed ?? 0 }));

    // Modérateurs les plus actifs (toutes catégories confondues).
    const moderatorCounts = {};
    for (const [, s] of entries) {
      for (const [moderatorId, count] of Object.entries(s.moderators ?? {})) {
        moderatorCounts[moderatorId] = (moderatorCounts[moderatorId] ?? 0) + count;
      }
    }
    const topModerators = Object.entries(moderatorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP)
      .map(([moderatorId, count]) => t('tickets.stats.moderatorEntry', { user: `<@${moderatorId}>`, count }));

    const embed = infoEmbed(t('tickets.stats.title'), t('tickets.stats.summary', { total: totalTickets, closed: totalClosed, avg: avgHandling })).addFields(
      { name: t('tickets.stats.topCategories'), value: topCategories.join('\n') || t('tickets.stats.none') },
      { name: t('tickets.stats.topModerators'), value: topModerators.join('\n') || t('tickets.stats.none') },
    );
    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
};
