/**
 * Commandes ban / unban (même famille, même fichier).
 * La logique métier vit dans services/moderation/banService : ces définitions
 * ne font que déclarer les arguments et relayer le résultat.
 */
const banService = require('../../services/moderation/banService');
const { replyResult } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

const ban = {
  name: 'ban',
  description: 'Bannit un utilisateur du serveur',
  usage: 'ban <membre> [raison]',
  examples: ['ban @Utilisateur Spam répété', 'ban 123456789012345678 Publicité'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'membre', type: 'user', required: true, description: "L'utilisateur à bannir (mention ou identifiant)" },
    { name: 'raison', type: 'string', required: false, rest: true, description: 'Raison du bannissement' },
  ],
  async execute(ctx) {
    const reason = ctx.options.raison ?? t('common.noReason');
    const result = await banService.banUser(ctx, ctx.options.membre, reason);
    return replyResult(ctx, result);
  },
};

const unban = {
  name: 'unban',
  description: "Révoque le bannissement d'un utilisateur",
  usage: 'unban <identifiant> [raison]',
  examples: ['unban 123456789012345678 A présenté ses excuses'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'utilisateur', type: 'user', required: true, description: "L'utilisateur à débannir (identifiant)" },
    { name: 'raison', type: 'string', required: false, rest: true, description: 'Raison du débannissement' },
  ],
  async execute(ctx) {
    const reason = ctx.options.raison ?? t('common.noReason');
    const result = await banService.unbanUser(ctx, ctx.options.utilisateur, reason);
    return replyResult(ctx, result);
  },
};

module.exports = [ban, unban];
