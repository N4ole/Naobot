/**
 * Commandes warn / warnings (même famille, même fichier).
 * La logique métier vit dans services/moderation/warnService ; la persistance
 * dans database/warnRepository.
 */
const warnService = require('../../services/moderation/warnService');
const { replyResult } = require('../../utils/helpers/discordUtils');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const warn = {
  name: 'warn',
  description: 'Ajoute un avertissement à un membre',
  usage: 'warn <membre> <raison>',
  examples: ['warn @Utilisateur Langage inapproprié'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'membre', type: 'member', required: true, description: 'Le membre à avertir' },
    { name: 'raison', type: 'string', required: true, rest: true, description: "Raison de l'avertissement" },
  ],
  async execute(ctx) {
    const result = await warnService.warnMember(ctx, ctx.options.membre, ctx.options.raison);
    return replyResult(ctx, result);
  },
};

const warnings = {
  name: 'warnings',
  description: "Affiche les avertissements d'un membre",
  usage: 'warnings <membre>',
  examples: ['warnings @Utilisateur'],
  aliases: ['warns'],
  cooldown: 3,
  args: [
    { name: 'membre', type: 'member', required: true, description: 'Le membre dont afficher les avertissements' },
  ],
  async execute(ctx) {
    const member = ctx.options.membre;
    const list = warnService.getWarnings(ctx.guild.id, member.id);

    if (list.length === 0) {
      return ctx.reply({
        embeds: [errorEmbed(t('moderation.warnings.none', { user: member.user.tag }))],
        ephemeral: true,
      });
    }

    const lines = list.map((entry) =>
      t('moderation.warnings.entry', {
        id: entry.id,
        timestamp: Math.floor(new Date(entry.createdAt).getTime() / 1000),
        moderatorId: entry.moderatorId,
        reason: entry.reason,
      }),
    );
    const title = t('moderation.warnings.title', { user: member.user.tag, count: list.length });
    return ctx.reply({ embeds: [infoEmbed(title, lines.join('\n\n'))] });
  },
};

module.exports = [warn, warnings];
