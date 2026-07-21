/**
 * Commandes mute / unmute (même famille, même fichier).
 * Mute par rôle : sans limite de durée, jusqu'à unmute. Pour une sanction
 * temporaire, utiliser la commande timeout (mécanisme natif de Discord).
 * La logique métier vit dans services/moderation/muteService.
 */
const muteService = require('../../services/moderation/muteService');
const { replyResult } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

const mute = {
  name: 'mute',
  description: "Rend un membre muet (rôle de mute, jusqu'à unmute)",
  usage: 'mute <membre> [raison]',
  examples: ['mute @Utilisateur Insultes répétées'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'membre', type: 'member', required: true, description: 'Le membre à rendre muet' },
    { name: 'raison', type: 'string', required: false, rest: true, description: 'Raison du mute' },
  ],
  async execute(ctx) {
    const reason = ctx.options.raison ?? t('common.noReason');
    const result = await muteService.muteMember(ctx, ctx.options.membre, reason);
    return replyResult(ctx, result, { successEmoji: 'crying' });
  },
};

const unmute = {
  name: 'unmute',
  description: 'Redonne la parole à un membre muet',
  usage: 'unmute <membre> [raison]',
  examples: ['unmute @Utilisateur'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'membre', type: 'member', required: true, description: 'Le membre à démuter' },
    { name: 'raison', type: 'string', required: false, rest: true, description: 'Raison du unmute' },
  ],
  async execute(ctx) {
    const reason = ctx.options.raison ?? t('common.noReason');
    const result = await muteService.unmuteMember(ctx, ctx.options.membre, reason);
    return replyResult(ctx, result);
  },
};

module.exports = [mute, unmute];
