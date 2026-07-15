/**
 * Commandes bumpcount / bumpunicount (même famille, même fichier) :
 * statistiques et classements de bump d'un utilisateur et du serveur.
 * La logique métier vit dans services/bump/bumpService.
 */
const bumpService = require('../../services/bump/bumpService');
const reputationService = require('../../services/reputation/reputationService');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

function formatRank({ rank, total }) {
  return rank === null ? t('bump.count.unranked') : `#${rank} / ${total}`;
}

function formatLastBump(lastBumpAt) {
  return lastBumpAt
    ? `<t:${Math.floor(Date.parse(lastBumpAt) / 1000)}:R>`
    : t('bump.count.never');
}

const bumpcount = {
  name: 'bumpcount',
  description: "Affiche les bumps et classements d'un utilisateur",
  usage: 'bumpcount [utilisateur]',
  examples: ['bumpcount', 'bumpcount @Utilisateur'],
  aliases: [],
  cooldown: 3,
  args: [
    {
      name: 'utilisateur',
      type: 'user',
      required: false,
      description: "L'utilisateur à consulter (vous-même par défaut)",
    },
  ],
  async execute(ctx) {
    const user = ctx.options.utilisateur ?? ctx.user;
    const stats = bumpService.getUserStats(user.id);

    const embed = infoEmbed(t('bump.count.title', { user: user.tag }), null).addFields(
      { name: t('bump.count.total'), value: String(stats.count), inline: true },
      {
        name: t('bump.count.globalRank'),
        value: formatRank(bumpService.getUserGlobalRank(user.id)),
        inline: true,
      },
      {
        name: t('bump.count.serverRank'),
        value: formatRank(bumpService.getUserServerRank(ctx.guild.id, user.id)),
        inline: true,
      },
      { name: t('bump.count.lastBump'), value: formatLastBump(stats.lastBumpAt), inline: true },
    );
    embed.setThumbnail(user.displayAvatarURL());
    return ctx.reply({ embeds: [embed] });
  },
};

const bumpunicount = {
  name: 'bumpunicount',
  description: 'Affiche les bumps et le classement du serveur',
  usage: 'bumpunicount',
  examples: ['bumpunicount'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    const stats = bumpService.getGuildConfig(ctx.guild.id);

    const embed = infoEmbed(t('bump.unicount.title', { guild: ctx.guild.name }), null).addFields(
      { name: t('bump.unicount.total'), value: String(stats.bumpCount), inline: true },
      {
        name: t('bump.unicount.rank'),
        value: formatRank(bumpService.getGuildRank(ctx.guild.id)),
        inline: true,
      },
      { name: t('bump.unicount.lastBump'), value: formatLastBump(stats.lastBumpAt), inline: true },
      {
        name: t('tracking.reputation'),
        value: reputationService.formatReputation(reputationService.getOrCompute(ctx.guild)),
        inline: true,
      },
      { name: t('bump.unicount.bumpers'), value: String(bumpService.countBumpers(ctx.guild.id)), inline: true },
    );
    const icon = ctx.guild.iconURL();
    if (icon) embed.setThumbnail(icon);
    return ctx.reply({ embeds: [embed] });
  },
};

module.exports = [bumpcount, bumpunicount];
