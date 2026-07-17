/**
 * Commande warncount : aperçu rapide des avertissements d'un membre (total
 * actif, prochaine sanction prévue, date du dernier warn).
 * La logique métier vit dans services/warnings/warnService et sanctionService.
 */
const warnService = require('../../services/warnings/warnService');
const sanctionService = require('../../services/warnings/sanctionService');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'warncount',
  description: "Aperçu rapide des avertissements d'un membre et de la prochaine sanction",
  usage: 'warncount <utilisateur>',
  examples: ['warncount @Utilisateur'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'utilisateur', type: 'user', required: true, description: 'Le membre à consulter' },
  ],
  async execute(ctx) {
    const user = ctx.options.utilisateur;
    const warns = warnService.getWarnings(ctx.guild.id, user.id);
    const total = warns.length;
    const last = warns[warns.length - 1] ?? null;
    const nextLabel = sanctionService.describeSanction(
      sanctionService.nextSanction(ctx.guild.id, total)?.sanction ?? null,
    );

    const embed = infoEmbed(t('warns.command.countTitle', { user: user.tag }), null)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: t('warns.field.total'), value: String(total), inline: true },
        { name: t('warns.field.next'), value: nextLabel, inline: true },
        {
          name: t('warns.field.lastWarn'),
          value: last ? `<t:${Math.floor(Date.parse(last.createdAt) / 1000)}:R>` : t('warns.command.never'),
          inline: true,
        },
      );
    return ctx.reply({ embeds: [embed] });
  },
};
