/**
 * Commandes timeout / untimeout (même famille, même fichier).
 * Utilise l'exclusion temporaire native de Discord (28 jours maximum).
 * La logique métier vit dans services/moderation/timeoutService.
 */
const timeoutService = require('../../services/moderation/timeoutService');
const { replyResult } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

const timeout = {
  name: 'timeout',
  description: 'Exclut temporairement un membre (timeout Discord natif, 28 j max)',
  usage: 'timeout <membre> <durée> [raison]',
  examples: ['timeout @Utilisateur 10m Flood', 'timeout @Utilisateur 2d Récidive'],
  aliases: ['to'],
  cooldown: 3,
  args: [
    { name: 'membre', type: 'member', required: true, description: 'Le membre à exclure temporairement' },
    { name: 'duree', type: 'duration', required: true, description: 'Durée (ex. : 30s, 10m, 1h30m, 2d)' },
    { name: 'raison', type: 'string', required: false, rest: true, description: "Raison de l'exclusion" },
  ],
  async execute(ctx) {
    const reason = ctx.options.raison ?? t('common.noReason');
    const result = await timeoutService.applyTimeout(ctx, ctx.options.membre, ctx.options.duree, reason);
    return replyResult(ctx, result, { successEmoji: 'crying' });
  },
};

const untimeout = {
  name: 'untimeout',
  description: "Lève l'exclusion temporaire d'un membre",
  usage: 'untimeout <membre> [raison]',
  examples: ['untimeout @Utilisateur Sanction levée après discussion'],
  aliases: ['unto'],
  cooldown: 3,
  args: [
    { name: 'membre', type: 'member', required: true, description: "Le membre dont lever l'exclusion" },
    { name: 'raison', type: 'string', required: false, rest: true, description: 'Raison de la levée' },
  ],
  async execute(ctx) {
    const reason = ctx.options.raison ?? t('common.noReason');
    const result = await timeoutService.removeTimeout(ctx, ctx.options.membre, reason);
    return replyResult(ctx, result);
  },
};

module.exports = [timeout, untimeout];
