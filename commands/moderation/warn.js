/**
 * Commande warn : ajoute un avertissement et applique automatiquement la
 * sanction progressive du palier atteint. La logique métier vit dans
 * services/warnings/warnService ; la hiérarchie dans
 * middlewares/moderation/warnGuard.
 */
const warnService = require('../../services/warnings/warnService');
const { checkWarnable } = require('../../middlewares/moderation/warnGuard');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'warn',
  description: 'Avertit un membre et applique la sanction progressive prévue',
  usage: 'warn <membre> <raison>',
  examples: ['warn @Utilisateur Langage inapproprié'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'membre', type: 'member', required: true, description: 'Le membre à avertir' },
    { name: 'raison', type: 'string', required: true, rest: true, description: "Raison de l'avertissement" },
  ],
  async execute(ctx) {
    const member = ctx.options.membre;
    const guard = checkWarnable(ctx, member);
    if (!guard.ok) {
      return ctx.reply({ embeds: [errorEmbed(guard.error)], ephemeral: true });
    }

    // L'application de la sanction (kick/ban/timeout) peut dépasser les 3 s.
    await ctx.defer();
    const result = await warnService.addWarn(ctx.guild, member, ctx.user, ctx.options.raison);

    const lines = [
      t('warns.command.warned', { user: member.user.tag, total: result.total, reason: ctx.options.raison }),
      t('warns.command.sanction', {
        sanction: result.applied
          ? result.sanctionLabel
          : t('warns.sanction.notApplied', { sanction: result.sanctionLabel }),
      }),
      t('warns.command.next', { next: result.nextLabel }),
    ];
    return ctx.reply({ embeds: [successEmbed(lines.join('\n'))] });
  },
};
