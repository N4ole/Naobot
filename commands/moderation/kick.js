/**
 * Commande kick. La logique métier vit dans services/moderation/kickService.
 */
const kickService = require('../../services/moderation/kickService');
const { replyResult } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'kick',
  description: 'Expulse un membre du serveur',
  usage: 'kick <membre> [raison]',
  examples: ['kick @Utilisateur Non-respect du règlement'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'membre', type: 'member', required: true, description: 'Le membre à expulser' },
    { name: 'raison', type: 'string', required: false, rest: true, description: "Raison de l'expulsion" },
  ],
  async execute(ctx) {
    const reason = ctx.options.raison ?? t('common.noReason');
    const result = await kickService.kickMember(ctx, ctx.options.membre, reason);
    return replyResult(ctx, result);
  },
};
