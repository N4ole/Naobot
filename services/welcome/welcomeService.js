/**
 * Système de bienvenue : à l'arrivée d'un membre, envoie la carte de
 * bienvenue dans le salon configuré, attribue les rôles automatiques,
 * envoie un MP optionnel, et propose (si des questions d'accueil sont
 * définies) un bouton ouvrant un formulaire de réponses.
 *
 * Multi-serveurs : toute la configuration vit par serveur dans
 * database/welcomeRepository. Sécurité : les rôles automatiques ne sont
 * attribués que s'ils sont inférieurs au rôle le plus haut du bot.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const repository = require('../../database/welcomeRepository');
const welcomeCardService = require('./welcomeCardService');
const logService = require('../logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { dmUser } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

function getConfig(guildId) {
  return repository.getConfig(guildId);
}

function saveConfig(guildId, config) {
  repository.saveConfig(guildId, config);
}

/** Attribue les rôles automatiques (uniquement ceux gérables par le bot). */
async function assignAutoRoles(member, roleIds) {
  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return 0;
  let assigned = 0;
  for (const roleId of roleIds) {
    const role = member.guild.roles.cache.get(roleId);
    if (!role || role.managed || me.roles.highest.comparePositionTo(role) <= 0) continue;
    if (await member.roles.add(role, 'Rôle automatique de bienvenue').then(() => true).catch(() => false)) assigned += 1;
  }
  return assigned;
}

/** Bouton d'accès au formulaire de questions d'accueil (si configuré). */
function questionsComponents(config) {
  if (!config.questions.length) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setwelcome:answer').setLabel(t('welcome.questions.button')).setEmoji('📝').setStyle(ButtonStyle.Primary),
    ),
  ];
}

/**
 * Traite l'arrivée d'un membre (appelé par events/welcome).
 * @returns {Promise<boolean>} true si une bienvenue a été envoyée
 */
async function handleMemberJoin(member) {
  const config = repository.getConfig(member.guild.id);
  if (!config.enabled || member.user.bot) return false;

  const assigned = await assignAutoRoles(member, config.autoRoleIds);

  const channel = config.channelId ? member.guild.channels.cache.get(config.channelId) : null;
  let sent = false;
  if (channel?.isTextBased()) {
    const card = welcomeCardService.buildCard(member, config);
    sent = await channel
      .send({ content: `${member}`, embeds: [card], components: questionsComponents(config) })
      .then(() => true)
      .catch(() => false);
  }

  if (config.dmEnabled) {
    await dmUser(member.user, welcomeCardService.render(config.dmMessage, member));
  }

  await logService.log(
    member.guild,
    'bienvenue',
    logEventEmbed({
      title: `👋 ${t('welcome.logs.joined')}`,
      color: COLORS.LOG_CREATE,
      user: member.user,
      fields: [
        { name: t('welcome.field.member'), value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
        { name: t('welcome.field.autoRoles'), value: String(assigned), inline: true },
      ],
    }),
  );
  return sent;
}

module.exports = { getConfig, saveConfig, handleMemberJoin, assignAutoRoles, saveAnswers: repository.saveAnswers };
