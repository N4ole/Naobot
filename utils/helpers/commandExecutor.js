/**
 * Pipeline d'exécution commun aux deux points d'entrée (slash et préfixe) :
 * middlewares (permissions puis cooldown), puis logique métier de la commande.
 * Toute nouvelle vérification transverse s'ajoute ici, une seule fois.
 */
const { checkCommandPermissions } = require('../../middlewares/permissions/checkPermissions');
const { checkCooldown } = require('../../middlewares/cooldowns/cooldowns');
const { errorEmbed } = require('../embeds/embeds');
const { t } = require('./i18n');

/**
 * @param {import('./commandContext').CommandContext} ctx
 * @param {object} command
 */
async function executeCommand(ctx, command) {
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
  } catch (error) {
    console.error(`[commands] Erreur dans "${command.name}" :`, error);
    await ctx
      .reply({ embeds: [errorEmbed(t('errors.unexpected'))], ephemeral: true })
      .catch(() => null);
  }
}

module.exports = { executeCommand };
