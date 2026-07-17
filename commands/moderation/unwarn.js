/**
 * Commande unwarn : supprime un avertissement précis par son identifiant et
 * recalcule le total. La logique métier vit dans services/warnings/warnService.
 */
const warnService = require('../../services/warnings/warnService');
const sanctionService = require('../../services/warnings/sanctionService');
const { successEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'unwarn',
  description: "Supprime un avertissement d'un membre grâce à son identifiant",
  usage: 'unwarn <utilisateur> <identifiant_warn>',
  examples: ['unwarn @Utilisateur a1b2c3'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'utilisateur', type: 'user', required: true, description: "L'utilisateur concerné" },
    { name: 'identifiant', type: 'string', required: true, description: "L'identifiant du warn à supprimer" },
  ],
  async execute(ctx) {
    const user = ctx.options.utilisateur;
    const result = await warnService.removeWarn(ctx.guild, user, ctx.options.identifiant.toLowerCase(), ctx.user);
    if (!result.ok) {
      return ctx.reply({
        embeds: [errorEmbed(t('warns.errors.warnNotFound', { id: ctx.options.identifiant }))],
        ephemeral: true,
      });
    }

    const nextLabel = sanctionService.describeSanction(
      sanctionService.nextSanction(ctx.guild.id, result.total)?.sanction ?? null,
    );
    return ctx.reply({
      embeds: [
        successEmbed(
          t('warns.command.unwarned', { id: ctx.options.identifiant, user: user.tag, total: result.total, next: nextLabel }),
        ),
      ],
    });
  },
};
