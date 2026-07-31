/**
 * Pipeline d'exécution commun aux deux points d'entrée (slash et préfixe) :
 * middlewares (permissions puis cooldown), puis logique métier de la
 * commande, puis consignation dans le système de logs (catégories
 * « commandes » et « erreurs »). Toute nouvelle vérification transverse
 * s'ajoute ici, une seule fois.
 */
const { checkCommandPermissions } = require('../../middlewares/permissions/checkPermissions');
const { checkCooldown } = require('../../middlewares/cooldowns/cooldowns');
const serverBanRepository = require('../../database/serverBanRepository');
const logService = require('../../services/logs/logService');
const errorLogService = require('../../services/errors/errorLogService');
const botLogService = require('../../services/web/botLogService');
const statsService = require('../../services/tracking/guildStatsService');
const { errorEmbed, logEventEmbed } = require('../embeds/embeds');
const emojis = require('../../config/emojis');
const COLORS = require('../constants/colors');
const { t } = require('./i18n');

function commandLogFields(ctx, command) {
  return [
    { name: t('logs.events.command'), value: `\`${command.name}\``, inline: true },
    { name: t('common.channel'), value: `${ctx.channel}`, inline: true },
    {
      name: t('logs.events.source'),
      value: ctx.isSlash ? t('logs.events.sourceSlash') : t('logs.events.sourcePrefix'),
      inline: true,
    },
  ];
}

/**
 * @param {import('./commandContext').CommandContext} ctx
 * @param {object} command
 */
async function executeCommand(ctx, command) {
  // Serveur banni du service : aucune fonctionnalité disponible.
  if (ctx.guild && serverBanRepository.isBanned(ctx.guild.id)) return;

  // En message privé (sans serveur), les permissions Discord ne s'appliquent
  // pas : seules les commandes explicitement compatibles DM arrivent ici.
  if (ctx.guild) {
    const permissions = checkCommandPermissions(ctx, command);
    if (!permissions.ok) {
      return ctx.reply({ embeds: [errorEmbed(permissions.error)], ephemeral: true });
    }
  }

  const remainingSeconds = checkCooldown(ctx.user.id, command);
  if (remainingSeconds > 0) {
    return ctx.reply({
      embeds: [errorEmbed(t('errors.cooldown', { seconds: remainingSeconds }))],
      ephemeral: true,
    });
  }

  // Journal interne du bot (section « Logs du bot » de l'interface web) :
  // point de capture unique, partagé par les 2 points d'entrée et toutes les
  // commandes — aucune commande n'a à s'en préoccuper.
  const startedAt = Date.now();
  const recordExecution = (ok, error) =>
    botLogService.recordCommand({
      command: command.name,
      user: ctx.user,
      guild: ctx.guild,
      channel: ctx.channel,
      type: ctx.isSlash ? 'slash' : 'prefix',
      durationMs: Date.now() - startedAt,
      ok,
      error,
    });

  try {
    await command.execute(ctx);
    recordExecution(true);
    // Suivi et journalisation propres au serveur (ignorés en message privé).
    if (ctx.guild) {
      statsService.recordCommand(ctx.guild.id);
      await logService.log(
        ctx.guild,
        'commandes',
        logEventEmbed({
          title: `${emojis.get('thumb')} ${t('logs.events.commandExecuted')}`,
          color: COLORS.LOG_NEUTRAL,
          user: ctx.user,
          fields: commandLogFields(ctx, command),
        }),
      );
    }
  } catch (error) {
    console.error(`[commands] Erreur dans "${command.name}" :`, error);
    recordExecution(false, error?.message ?? error);
    // Journalisation interne (serveur privé #bot-errors), avec contexte complet.
    errorLogService.report({
      type: 'commandError',
      error,
      guild: ctx.guild,
      channel: ctx.channel,
      user: ctx.user,
      command: command.name,
      module: 'commandExecutor',
    });
    await logService
      .log(
        ctx.guild,
        'erreurs',
        logEventEmbed({
          title: `${emojis.get('glitch')} ${t('logs.events.commandError')}`,
          color: COLORS.ERROR,
          user: ctx.user,
          fields: [
            ...commandLogFields(ctx, command),
            { name: t('logs.events.error'), value: `\`\`\`${String(error).slice(0, 1000)}\`\`\`` },
          ],
        }),
      )
      .catch(() => null);
    await ctx
      .reply({ embeds: [errorEmbed(t('errors.unexpected'))], ephemeral: true })
      .catch(() => null);
  }
}

module.exports = { executeCommand };
