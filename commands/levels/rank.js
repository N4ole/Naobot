/**
 * Commandes rank / level : affichent le profil de progression d'un membre
 * (niveau, XP actuelle, XP nécessaire, progression, classement serveur,
 * messages envoyés, temps vocal cumulé).
 *
 * La construction des **données** (levelService.buildRankData) est séparée de
 * la présentation, afin d'ajouter plus tard une carte graphique de profil sans
 * refonte. `rank` et `level` partagent la même logique.
 */
const levelService = require('../../services/levels/levelService');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

/** Barre de progression textuelle (10 segments). */
function progressBar(ratio) {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

function buildRankPayload(guild, user) {
  if (!levelService.isEnabled(guild.id)) {
    return { embeds: [errorEmbed(t('levels.disabled'))], ephemeral: true };
  }
  const data = levelService.buildRankData(guild, user.id);
  const p = data.progress;
  const embed = infoEmbed(t('levels.rank.title', { user: user.username }), null)
    .setThumbnail(user.displayAvatarURL?.({ size: 128 }) ?? null)
    .addFields(
      { name: t('levels.field.level'), value: `**${data.level}**`, inline: true },
      { name: t('levels.field.rank'), value: data.rank ? `#${data.rank} / ${data.total}` : '—', inline: true },
      { name: t('levels.field.xp'), value: `${data.xp} XP`, inline: true },
      { name: t('levels.rank.progress'), value: `${progressBar(p.ratio)}\n${p.into} / ${p.needed} XP → ${t('levels.field.level')} ${data.level + 1}`, inline: false },
      { name: t('levels.field.messages'), value: String(data.messages), inline: true },
      { name: t('levels.field.voice'), value: data.voiceMs > 0 ? formatDuration(data.voiceMs) : '—', inline: true },
    );
  return { embeds: [embed] };
}

function makeCommand(name) {
  return {
    name,
    description: 'Affiche votre progression (niveau, XP, classement, activité)',
    usage: `${name} [membre]`,
    examples: [name, `${name} @Membre`],
    aliases: name === 'rank' ? ['niveau'] : [],
    cooldown: 3,
    args: [{ name: 'membre', type: 'user', required: false, description: 'Le membre (par défaut : vous)' }],
    async execute(ctx) {
      const target = ctx.options.membre ?? ctx.user;
      return ctx.reply(buildRankPayload(ctx.guild, target));
    },
  };
}

module.exports = [makeCommand('rank'), makeCommand('level')];
