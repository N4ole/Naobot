/**
 * Commandes userinfo / avatar (même famille, même fichier) :
 * informations sur un membre et affichage d'avatar.
 */
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const MAX_ROLES_SHOWN = 10;

const userinfo = {
  name: 'userinfo',
  description: "Affiche les informations d'un membre",
  usage: 'userinfo [membre]',
  examples: ['userinfo', 'userinfo @Utilisateur'],
  aliases: ['ui', 'whois'],
  cooldown: 5,
  args: [
    { name: 'membre', type: 'member', required: false, description: 'Le membre à consulter (vous-même par défaut)' },
  ],
  async execute(ctx) {
    const member = ctx.options.membre ?? ctx.member;
    const { user } = member;

    const roles = member.roles.cache
      .filter((role) => role.id !== ctx.guild.roles.everyone.id)
      .sort((a, b) => b.position - a.position);
    const shown = [...roles.values()].slice(0, MAX_ROLES_SHOWN).map((role) => `${role}`);
    const rolesValue =
      shown.length > 0
        ? shown.join(' ') + (roles.size > MAX_ROLES_SHOWN ? ` (+${roles.size - MAX_ROLES_SHOWN})` : '')
        : t('help.none');

    const embed = infoEmbed(user.tag, `${member}`)
      .setThumbnail(member.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: t('info.id'), value: `\`${user.id}\``, inline: true },
        { name: t('info.bot'), value: user.bot ? t('info.yes') : t('info.no'), inline: true },
        { name: t('info.highestRole'), value: `${member.roles.highest}`, inline: true },
        {
          name: t('info.created'),
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`,
          inline: true,
        },
        {
          name: t('info.joined'),
          value: member.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`
            : t('owners.servers.unknown'),
          inline: true,
        },
        { name: `${t('info.roles')} (${roles.size})`, value: rolesValue },
      );
    return ctx.reply({ embeds: [embed] });
  },
};

const avatar = {
  name: 'avatar',
  description: "Affiche l'avatar d'un utilisateur en grand",
  usage: 'avatar [utilisateur]',
  examples: ['avatar', 'avatar @Utilisateur'],
  aliases: ['pdp'],
  cooldown: 5,
  args: [
    { name: 'utilisateur', type: 'user', required: false, description: "L'utilisateur (vous-même par défaut)" },
  ],
  async execute(ctx) {
    const user = ctx.options.utilisateur ?? ctx.user;
    const url = user.displayAvatarURL({ size: 4096 });
    const embed = infoEmbed(t('info.avatarOf', { user: user.tag }), `[${t('info.openOriginal')}](${url})`)
      .setImage(url);
    return ctx.reply({ embeds: [embed] });
  },
};

module.exports = [userinfo, avatar];
