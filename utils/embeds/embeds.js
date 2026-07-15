/**
 * Constructeurs d'embeds réutilisables : toutes les réponses du bot passent
 * par ces fonctions afin de garantir une présentation homogène.
 */
const { EmbedBuilder } = require('discord.js');
const COLORS = require('../constants/colors');
const { t } = require('../helpers/i18n');

function successEmbed(description) {
  return new EmbedBuilder().setColor(COLORS.SUCCESS).setDescription(`✅ ${description}`);
}

function errorEmbed(description) {
  return new EmbedBuilder().setColor(COLORS.ERROR).setDescription(`❌ ${description}`);
}

function infoEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.INFO).setTitle(title).setDescription(description);
}

/**
 * Embed standardisé pour le salon de logs de modération.
 * @param {object} params
 * @param {string} params.action - Libellé de l'action ("Bannissement"…)
 * @param {import('discord.js').User} params.target - Utilisateur sanctionné
 * @param {import('discord.js').User} params.moderator - Modérateur à l'origine de l'action
 * @param {string} params.reason
 * @param {{name: string, value: string}[]} [params.extraFields] - Champs additionnels (durée, nombre…)
 */
function modLogEmbed({ action, target, moderator, reason, extraFields = [] }) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.MODLOG)
    .setTitle(`📋 ${action}`)
    .setTimestamp();

  if (target) {
    embed.addFields({ name: t('common.member'), value: `${target.tag} (\`${target.id}\`)`, inline: true });
    embed.setThumbnail(target.displayAvatarURL());
  }
  embed.addFields(
    { name: t('common.moderator'), value: `${moderator.tag} (\`${moderator.id}\`)`, inline: true },
    { name: t('common.reason'), value: reason || t('common.noReason') },
    ...extraFields,
  );
  return embed;
}

/**
 * Embed standardisé pour les salons du système de logs par catégories :
 * même charte pour tous les événements (couleur selon la nature de
 * l'événement, horodatage, auteur éventuel).
 * @param {object} params
 * @param {string} params.title
 * @param {number} [params.color]
 * @param {string} [params.description]
 * @param {{name: string, value: string, inline?: boolean}[]} [params.fields]
 * @param {import('discord.js').User} [params.user] - Utilisateur concerné (affiché en auteur)
 */
function logEventEmbed({ title, color = COLORS.LOG_NEUTRAL, description = null, fields = [], user = null }) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields);
  if (user) embed.setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() });
  return embed;
}

module.exports = { successEmbed, errorEmbed, infoEmbed, modLogEmbed, logEventEmbed };
