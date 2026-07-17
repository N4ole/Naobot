/**
 * Carte de bienvenue.
 *
 * En l'absence de bibliothèque de génération d'image (canvas), la carte est
 * rendue sous forme d'**embed** riche : avatar du membre (grande image ou
 * vignette selon le modèle), pseudo, nom du serveur et nombre total de
 * membres. L'architecture par **modèles** (TEMPLATES) permet d'ajouter
 * facilement de nouveaux rendus — y compris une vraie génération d'image
 * plus tard, sans toucher aux appelants.
 */
const { infoEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Interpole {user} {username} {server} {count}. */
function render(text, member) {
  return String(text)
    .replaceAll('{user}', `${member}`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
}

/** Modèles de carte disponibles (extensible). */
const TEMPLATES = {
  classic: (member, config) => {
    const embed = infoEmbed(t('welcome.card.title', { server: member.guild.name }), render(config.message, member))
      .setColor(typeof config.color === 'number' ? config.color : COLORS.SUCCESS)
      .setThumbnail(member.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: t('welcome.card.member'), value: `${member.user.tag}`, inline: true },
        { name: t('welcome.card.count'), value: `#${member.guild.memberCount}`, inline: true },
      )
      .setTimestamp();
    return embed;
  },
  banner: (member, config) => {
    const embed = infoEmbed(t('welcome.card.welcome', { username: member.user.username }), render(config.message, member))
      .setColor(typeof config.color === 'number' ? config.color : COLORS.SUCCESS)
      .setImage(member.displayAvatarURL({ size: 512 }))
      .setFooter({ text: t('welcome.card.footer', { server: member.guild.name, count: member.guild.memberCount }) });
    return embed;
  },
};

function buildCard(member, config) {
  const template = TEMPLATES[config.template] ?? TEMPLATES.classic;
  return template(member, config);
}

module.exports = { render, buildCard, TEMPLATES };
