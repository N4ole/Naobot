/**
 * Commande rep : administration de la réputation des serveurs — réservée
 * aux owners.
 *
 * - `rep <id_serveur>`          : réputation détaillée (score, critères,
 *                                 statistiques, historique).
 * - `rep recalc <id_serveur>`   : recalcule (et lève l'override manuel).
 * - `rep set <id_serveur> <n>`  : fixe manuellement le score (0-100).
 * - `rep top` / `rep flop`      : serveurs les mieux / moins bien notés.
 *
 * La logique métier vit dans services/reputation/reputationService.
 */
const config = require('../../config/config');
const reputationService = require('../../services/reputation/reputationService');
const statsService = require('../../services/tracking/guildStatsService');
const reputationLevels = require('../../utils/constants/reputationLevels');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const GUILD_ID_PATTERN = /^\d{17,20}$/;

function discordDate(iso) {
  return `<t:${Math.floor(Date.parse(iso) / 1000)}:d>`;
}

function formatBreakdown(breakdown) {
  return breakdown
    .map((entry) => {
      const sign = entry.points > 0 ? `+${entry.points}` : String(entry.points);
      return `• ${entry.label} : **${sign}**`;
    })
    .join('\n');
}

function formatHistory(history) {
  return history
    .slice(-5)
    .reverse()
    .map(
      (entry) =>
        `${discordDate(entry.at)} — ${reputationService.formatReputation(entry)} · ${t(`reputation.reasons.${entry.reason}`)}`,
    )
    .join('\n');
}

function detailEmbed(guild, guildId) {
  const stats = statsService.getStats(guildId);
  // Bot présent : recalcul complet avec détail des critères ; bot absent :
  // affichage des dernières valeurs enregistrées.
  const result = guild
    ? reputationService.recalculate(guild, { reason: 'auto' })
    : reputationService.getEffective(stats);
  if (!result) return null;

  const embed = infoEmbed(
    t('reputation.command.detailTitle', { name: guild?.name ?? stats.name ?? guildId }),
    `\`${guildId}\``,
  ).addFields({
    name: t('reputation.command.score'),
    value: reputationService.formatReputation(result),
    inline: true,
  });

  if (result.manual) {
    embed.addFields({
      name: t('reputation.command.manual'),
      value: t('reputation.command.manualNote', {
        by: result.manual.by,
        at: Math.floor(Date.parse(result.manual.at) / 1000),
      }),
    });
  }

  embed.addFields({
    name: t('reputation.command.statsTitle'),
    value: t('reputation.command.statsValue', {
      sanctions: stats.sanctionCount,
      commands: stats.commandCount,
      joins: stats.joinCount,
      leaves: stats.leaveCount,
    }),
  });

  if (result.breakdown) {
    embed.addFields({ name: t('reputation.command.breakdown'), value: formatBreakdown(result.breakdown) });
  } else {
    embed.addFields({ name: t('reputation.command.breakdown'), value: t('reputation.command.noBreakdown') });
  }

  const history = stats.reputation?.history ?? [];
  if (history.length > 0) {
    embed.addFields({ name: t('reputation.command.history'), value: formatHistory(history) });
  }
  return embed;
}

function rankedEmbed(client, order) {
  const rows = Object.entries(statsService.getAllStats())
    .map(([id, stats]) => ({
      id,
      name: client.guilds.cache.get(id)?.name ?? stats.name ?? id,
      effective: reputationService.getEffective(stats),
    }))
    .filter((row) => row.effective !== null)
    .sort((a, b) =>
      order === 'top' ? b.effective.score - a.effective.score : a.effective.score - b.effective.score,
    )
    .slice(0, 10);

  if (rows.length === 0) {
    return infoEmbed(
      t(order === 'top' ? 'reputation.command.topTitle' : 'reputation.command.flopTitle'),
      t('reputation.command.empty'),
    );
  }

  const lines = rows.map(
    (row, index) =>
      `**${index + 1}.** ${row.name} (\`${row.id}\`) — ${reputationService.formatReputation(row.effective)}`,
  );
  return infoEmbed(
    t(order === 'top' ? 'reputation.command.topTitle' : 'reputation.command.flopTitle'),
    lines.join('\n'),
  );
}

const rep = {
  name: 'rep',
  ownerOnly: true,
  description: "Affiche et administre la réputation des serveurs (réservé aux owners)",
  usage: 'rep <id_serveur> | rep recalc <id> | rep set <id> <score> | rep top | rep flop',
  examples: [
    'rep 123456789012345678',
    'rep recalc 123456789012345678',
    'rep set 123456789012345678 25',
    'rep top',
    'rep flop',
  ],
  // « reputation » n'est pas un alias ici : c'est déjà le nom de la commande
  // publique de réputation globale (commands/reputation/reputation.js).
  aliases: [],
  cooldown: 3,
  args: [
    {
      name: 'action',
      type: 'string',
      required: true,
      description: 'ID du serveur, ou action : recalc | set | top | flop',
    },
    { name: 'serveur', type: 'string', required: false, description: 'ID du serveur (pour recalc / set)' },
    {
      name: 'score',
      type: 'integer',
      required: false,
      min: 0,
      max: 100,
      description: 'Score manuel entre 0 et 100 (pour set)',
    },
  ],
  async execute(ctx) {
    const action = ctx.options.action.toLowerCase();
    const usageError = () =>
      ctx.reply({
        embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}${rep.usage}` }))],
        ephemeral: true,
      });

    if (action === 'top' || action === 'flop') {
      return ctx.reply({ embeds: [rankedEmbed(ctx.client, action)] });
    }

    if (action === 'recalc' || action === 'set') {
      const guildId = ctx.options.serveur?.trim();
      if (!guildId || !GUILD_ID_PATTERN.test(guildId)) return usageError();
      const guild = ctx.client.guilds.cache.get(guildId);

      if (action === 'recalc') {
        if (!guild) {
          return ctx.reply({
            embeds: [errorEmbed(t('reputation.command.notOnServer', { id: guildId }))],
            ephemeral: true,
          });
        }
        const result = reputationService.recalculate(guild, { reason: 'recalcul', clearManual: true });
        return ctx.reply({
          embeds: [
            successEmbed(
              t('reputation.command.recalcDone', {
                name: guild.name,
                reputation: reputationService.formatReputation(result),
              }),
            ),
            detailEmbed(guild, guildId),
          ],
        });
      }

      const score = ctx.options.score;
      if (score === undefined) return usageError();
      const stats = statsService.getStats(guildId);
      if (!guild && !stats.firstJoinedAt) {
        return ctx.reply({
          embeds: [errorEmbed(t('reputation.command.notTracked', { id: guildId }))],
          ephemeral: true,
        });
      }
      const result = reputationService.setManual(guildId, score, ctx.user.id);
      return ctx.reply({
        embeds: [
          successEmbed(
            t('reputation.command.setDone', {
              name: guild?.name ?? stats.name ?? guildId,
              reputation: reputationService.formatReputation(result),
            }),
          ),
        ],
      });
    }

    if (GUILD_ID_PATTERN.test(action)) {
      const guild = ctx.client.guilds.cache.get(action);
      const embed = detailEmbed(guild ?? null, action);
      if (!embed) {
        return ctx.reply({
          embeds: [errorEmbed(t('reputation.command.notTracked', { id: action }))],
          ephemeral: true,
        });
      }
      return ctx.reply({ embeds: [embed] });
    }

    return usageError();
  },
};

module.exports = rep;
