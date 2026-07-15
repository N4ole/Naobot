/**
 * Commande bump : publie la publicité du serveur dans les salons de tous
 * les serveurs participants. Accessible à tous les membres ; cooldown
 * global de 6 h par serveur (géré par le service, indépendamment de
 * l'anti-spam par utilisateur du pipeline). La logique métier vit dans
 * services/bump/bumpService.
 */
const config = require('../../config/config');
const bumpService = require('../../services/bump/bumpService');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'bump',
  description: 'Envoie la publicité du serveur vers les autres serveurs participants',
  usage: 'bump',
  examples: ['bump'],
  aliases: [],
  cooldown: 10,
  args: [],
  async execute(ctx) {
    // La diffusion vers de nombreux serveurs peut dépasser les 3 s.
    await ctx.defer();
    const result = await bumpService.performBump(ctx.guild, ctx.user, ctx.client);

    if (!result.ok) {
      const messages = {
        notEnabled: t('bump.command.notEnabled', { prefix: config.prefix }),
        noChannel: t('bump.command.noChannel', { prefix: config.prefix }),
        cooldown: t('bump.command.cooldown', { remaining: formatDuration(result.remaining ?? 0) }),
        inviteFailed: t('bump.command.inviteFailed'),
      };
      return ctx.reply({ embeds: [errorEmbed(messages[result.code])], ephemeral: true });
    }

    const lines = [t('bump.command.success', { sent: result.sent })];
    if (result.failed > 0) {
      lines.push(t('bump.command.successFailures', { failures: result.failed }));
    }
    lines.push(
      t('bump.command.totalBumps', {
        count: result.totalBumps,
        next: `<t:${Math.floor(result.nextAt / 1000)}:R>`,
      }),
    );
    return ctx.reply({ embeds: [successEmbed(lines.join('\n'))] });
  },
};
