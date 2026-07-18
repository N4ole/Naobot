/**
 * Commandes owner de la réputation globale : globalrepstats (statistiques),
 * userhistory (historique complet d'un utilisateur, paginé), repconfig
 * (pondérations). Réservées aux owners du bot (ownerOnly + vérification des
 * composants). La configuration est centralisée : aucun serveur ne peut la
 * modifier.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const globalReputationService = require('../../services/reputation/globalReputationService');
const { checkOwner } = require('../../middlewares/permissions/ownerCheck');
const { DEFAULT_WEIGHTS } = require('../../utils/constants/globalReputation');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const HISTORY_PAGE = 8;

function statsEmbed() {
  const s = globalReputationService.globalStats();
  const line = (rec) => `\`${rec.score}\` • ${rec.tag ?? rec.userId}`;
  return infoEmbed(t('repglobale.stats.title'), t('repglobale.stats.summary', { users: s.users, sanctions: s.totalSanctions, events: s.totalEvents })).addFields(
    { name: t('repglobale.stats.best'), value: s.best.length ? s.best.map(line).join('\n') : '—', inline: true },
    { name: t('repglobale.stats.worst'), value: s.worst.length ? s.worst.map(line).join('\n') : '—', inline: true },
  );
}

function historyPayload(client, userId, tag, page) {
  const history = globalReputationService.getHistory(userId);
  if (history.length === 0) {
    return { embeds: [infoEmbed(t('repglobale.history.title', { user: tag }), t('repglobale.history.empty'))], components: [] };
  }
  const ordered = [...history].reverse();
  const pageCount = Math.ceil(ordered.length / HISTORY_PAGE);
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  const lines = ordered.slice(current * HISTORY_PAGE, (current + 1) * HISTORY_PAGE).map((event) => {
    const guild = client.guilds.cache.get(event.guildId);
    return t('repglobale.history.entry', {
      action: event.action,
      server: guild?.name ?? event.guildId ?? '—',
      date: Math.floor(Date.parse(event.date) / 1000),
      moderator: event.moderatorId ? `<@${event.moderatorId}>` : '—',
      reason: event.reason || '—',
      score: `${event.scoreBefore}→${event.scoreAfter}`,
    });
  });
  const embed = infoEmbed(t('repglobale.history.title', { user: tag }), lines.join('\n\n')).setFooter({ text: `Page ${current + 1}/${pageCount}` });
  const components = pageCount > 1
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`userhistory:page:${userId}:${current}:prev`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
        new ButtonBuilder().setCustomId(`userhistory:page:${userId}:${current}:next`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pageCount - 1),
      )]
    : [];
  return { embeds: [embed], components };
}

const globalrepstats = {
  name: 'globalrepstats',
  description: 'Statistiques globales de réputation (owners)',
  usage: 'globalrepstats',
  examples: ['globalrepstats'],
  aliases: [],
  cooldown: 5,
  ownerOnly: true,
  args: [],
  async execute(ctx) {
    return ctx.reply({ embeds: [statsEmbed()], ephemeral: true });
  },
};

const userhistory = {
  name: 'userhistory',
  description: 'Historique global complet d’un utilisateur (owners)',
  usage: 'userhistory <utilisateur>',
  examples: ['userhistory @Membre'],
  aliases: [],
  cooldown: 5,
  ownerOnly: true,
  args: [{ name: 'utilisateur', type: 'user', required: true, description: 'L’utilisateur' }],
  async execute(ctx) {
    const target = ctx.options.utilisateur;
    return ctx.reply({ ...historyPayload(ctx.client, target.id, target.tag, 0), ephemeral: true });
  },
  async handleComponent(interaction) {
    const guard = checkOwner(interaction.user.id);
    if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.error)], flags: MessageFlags.Ephemeral });
    const [, , userId, rawPage, direction] = interaction.customId.split(':');
    const current = Number.parseInt(rawPage, 10) || 0;
    return interaction.update(historyPayload(interaction.client, userId, userId, direction === 'prev' ? current - 1 : current + 1));
  },
};

const repconfig = {
  name: 'repconfig',
  description: 'Configure les pondérations de la réputation globale (owners)',
  usage: 'repconfig [clé] [valeur]',
  examples: ['repconfig', 'repconfig ban 40', 'repconfig warn 2'],
  aliases: [],
  cooldown: 3,
  ownerOnly: true,
  args: [
    { name: 'cle', type: 'string', required: false, choices: Object.keys(DEFAULT_WEIGHTS), description: 'Pondération à modifier' },
    { name: 'valeur', type: 'integer', required: false, min: 0, max: 100, description: 'Nouvelle valeur (points)' },
  ],
  async execute(ctx) {
    const key = ctx.options.cle;
    const value = ctx.options.valeur;

    if (key && value !== undefined && value !== null) {
      if (!globalReputationService.setWeight(key, value)) {
        return ctx.reply({ embeds: [errorEmbed(t('repglobale.config.invalidKey'))], ephemeral: true });
      }
      globalReputationService.recalculateAll();
      await globalReputationService.logRep(ctx.guild, 'config', [{ name: t('repglobale.config.change'), value: `${key} → ${value}`, inline: true }], COLORS.LOG_UPDATE);
      return ctx.reply({ embeds: [successEmbed(t('repglobale.config.updated', { key, value })), configEmbed()] });
    }
    return ctx.reply({ embeds: [configEmbed()], ephemeral: true });
  },
};

function configEmbed() {
  const config = globalReputationService.getConfig();
  const weights = Object.entries(config.weights).map(([k, v]) => `\`${k}\` : **-${v}**`).join('\n');
  return infoEmbed(t('repglobale.config.title'), weights).addFields(
    { name: t('repglobale.config.positive'), value: t('repglobale.config.positiveValue', { perYear: config.positive.accountAgePerYear, max: config.positive.accountAgeMax }), inline: true },
    { name: t('repglobale.config.limits'), value: t('repglobale.config.limitsValue', { max: config.limits.maxEventsPerGuildPerDay }), inline: true },
  );
}

module.exports = [globalrepstats, userhistory, repconfig];
