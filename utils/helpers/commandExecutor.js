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
const logService = require('../../services/logging/logService');
const statsService = require('../../services/tracking/guildStatsService');
const { errorEmbed, logEventEmbed } = require('../embeds/embeds');
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
  if (serverBanRepository.isBanned(ctx.guild.id)) return;

  const permissions = checkCommandPermissions(ctx, command);
  if (!permissions.ok) {
    return ctx.reply({ embeds: [errorEmbed(permissions.error)], ephemeral: true });
  }

  const remainingSeconds = checkCooldown(ctx.user.id, command);
  if (remainingSeconds > 0) {
    return ctx.reply({
      embeds: [errorEmbed(t('errors.cooldown', { seconds: remainingSeconds }))],
      ephemeral: true,
    });
  }

  try {
    await command.execute(ctx);
    // Suivi d'activité du serveur (statistiques + réputation).
    statsService.recordCommand(ctx.guild.id);
    await logService.log(
      ctx.guild,
      'commandes',
      logEventEmbed({
        title: t('logs.events.commandExecuted'),
        color: COLORS.LOG_NEUTRAL,
        user: ctx.user,
        fields: commandLogFields(ctx, command),
      }),
    );
  } catch (error) {
    console.error(`[commands] Erreur dans "${command.name}" :`, error);
    await logService
      .log(
        ctx.guild,
        'erreurs',
        logEventEmbed({
          title: t('logs.events.commandError'),
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
