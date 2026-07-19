/**
 * Commandes reputation / globalprofile (même famille) : consultation de la
 * réputation GLOBALE (inter-serveurs) d'un utilisateur.
 *
 * Confidentialité : un utilisateur classique ne voit que sa propre réputation ;
 * celle d'un autre n'est visible que par les owners du bot et les
 * administrateurs d'un serveur (partagé) où la cible est présente. Toute
 * consultation d'un tiers est journalisée (catégorie « repglobale »).
 */
const { EmbedBuilder } = require('discord.js');
const globalReputationService = require('../../services/reputation/globalReputationService');
const { canViewReputation } = require('../../middlewares/reputation/reputationAccess');
const { errorEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const LEVEL_COLORS = { excellent: COLORS.LOG_CREATE, good: COLORS.LOG_CREATE, neutral: COLORS.LOG_UPDATE, risky: 0xe67e22, critical: COLORS.LOG_DELETE };

function statLine(stats) {
  return t('repglobale.statsLine', {
    warns: stats.warns ?? 0,
    timeouts: stats.timeouts ?? 0,
    mutes: stats.mutes ?? 0,
    kicks: stats.kicks ?? 0,
    bans: stats.bans ?? 0,
  });
}

function historyLines(history, client, limit) {
  return history
    .slice(-limit)
    .reverse()
    .map((event) => {
      const guild = client.guilds.cache.get(event.guildId);
      return t('repglobale.historyEntry', {
        action: event.action,
        server: guild?.name ?? event.guildId ?? '—',
        date: Math.floor(Date.parse(event.date) / 1000),
      });
    })
    .join('\n');
}

/** Garde de confidentialité + journalisation d'une consultation sensible. */
async function guardAndLog(ctx, target) {
  if (target.id !== ctx.user.id) {
    if (!canViewReputation(ctx.user, target.id, ctx.client)) {
      await ctx.reply({ embeds: [errorEmbed(t('repglobale.errors.private'))], ephemeral: true });
      return false;
    }
    await globalReputationService.logRep(ctx.guild, 'view', [
      { name: t('repglobale.field.viewer'), value: `${ctx.user.tag}`, inline: true },
      { name: t('common.member'), value: `${target.tag}`, inline: true },
    ], COLORS.INFO);
  }
  return true;
}

const reputation = {
  name: 'reputation',
  description: 'Affiche la réputation globale (inter-serveurs) d’un utilisateur',
  usage: 'reputation [utilisateur]',
  examples: ['reputation', 'reputation @Membre'],
  aliases: ['globalrep', 'grep'],
  cooldown: 5,
  args: [{ name: 'utilisateur', type: 'user', required: false, description: 'L’utilisateur (par défaut : vous)' }],
  async execute(ctx) {
    const target = ctx.options.utilisateur ?? ctx.user;
    if (!(await guardAndLog(ctx, target))) return undefined;

    const profile = globalReputationService.getProfile(target.id);
    const embed = new EmbedBuilder()
      .setColor(LEVEL_COLORS[profile.level.key] ?? COLORS.INFO)
      .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
      .setTitle(t('repglobale.title'))
      .setDescription(t('repglobale.scoreLine', { score: profile.score, emoji: profile.level.emoji, level: profile.level.label }))
      .addFields(
        { name: t('repglobale.field.sanctions'), value: statLine(profile.stats) },
        { name: t('repglobale.field.servers'), value: String(profile.guildsCount), inline: true },
        { name: t('repglobale.field.account'), value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
      );
    if (profile.history.length) embed.addFields({ name: t('repglobale.field.history'), value: historyLines(profile.history, ctx.client, 5) });
    return ctx.reply({ embeds: [embed] });
  },
};

const globalprofile = {
  name: 'globalprofile',
  description: 'Affiche le profil global complet d’un utilisateur',
  usage: 'globalprofile [utilisateur]',
  examples: ['globalprofile', 'globalprofile @Membre'],
  aliases: ['gprofile'],
  cooldown: 5,
  dm: 'direct',
  args: [{ name: 'utilisateur', type: 'user', required: false, description: 'L’utilisateur (par défaut : vous)' }],
  async execute(ctx) {
    const target = ctx.options.utilisateur ?? ctx.user;
    if (!(await guardAndLog(ctx, target))) return undefined;

    const profile = globalReputationService.getProfile(target.id);
    const embed = new EmbedBuilder()
      .setColor(LEVEL_COLORS[profile.level.key] ?? COLORS.INFO)
      .setTitle(t('repglobale.profileTitle', { user: target.username }))
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: t('repglobale.field.user'), value: `${target.tag}`, inline: true },
        { name: t('repglobale.field.id'), value: `\`${target.id}\``, inline: true },
        { name: t('repglobale.field.account'), value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
        { name: t('repglobale.field.score'), value: t('repglobale.scoreLine', { score: profile.score, emoji: profile.level.emoji, level: profile.level.label }) },
        { name: t('repglobale.field.badges'), value: profile.badges.length ? profile.badges.join('\n') : t('repglobale.noBadges') },
        { name: t('repglobale.field.sanctions'), value: statLine(profile.stats) },
        { name: t('repglobale.field.servers'), value: String(profile.guildsCount), inline: true },
      );
    if (profile.history.length) embed.addFields({ name: t('repglobale.field.history'), value: historyLines(profile.history, ctx.client, 8) });
    return ctx.reply({ embeds: [embed] });
  },
};

module.exports = [reputation, globalprofile];
