/**
 * Compatibilité des commandes en messages privés (DM).
 *
 * Certaines commandes sont **utilisables sans serveur** (personnelles :
 * rappels, réputation globale, aide…) : elles déclarent `dm: 'direct'` et sont
 * exécutées directement en DM. Les autres nécessitent un serveur : en DM, le
 * bot propose une **sélection de serveur** (menu déroulant des serveurs
 * partagés) et explique clairement la marche à suivre.
 *
 * La dernière sélection de serveur de l'utilisateur est conservée
 * (database/dmRepository) pour améliorer l'expérience.
 */
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const dmRepository = require('../../database/dmRepository');
const { t } = require('../../utils/helpers/i18n');

/** Mode DM d'une commande : 'direct' (sans serveur) ou null (serveur requis). */
function dmMode(command) {
  return command?.dm === 'direct' ? 'direct' : null;
}

/** true si la commande est exécutable directement en DM (sans serveur). */
function isDirect(command) {
  return dmMode(command) === 'direct';
}

/**
 * Serveurs partagés entre l'utilisateur et le bot (bornés au cache pour rester
 * sûrs sur un bot multi-serveurs).
 * @returns {import('discord.js').Guild[]}
 */
function sharedGuilds(client, userId) {
  return [...(client?.guilds?.cache?.values?.() ?? [])].filter((guild) => guild.members.cache.has(userId));
}

/** Dernière sélection de serveur de l'utilisateur (ou null). */
function getLastGuild(userId) {
  return dmRepository.getLastGuild(userId);
}

function setLastGuild(userId, guildId) {
  dmRepository.setLastGuild(userId, guildId);
}

/**
 * Menu déroulant de sélection de serveur (ou null si aucun serveur partagé).
 * @returns {ActionRowBuilder|null}
 */
function buildServerPicker(client, userId) {
  const guilds = sharedGuilds(client, userId);
  if (guilds.length === 0) return null;
  const last = getLastGuild(userId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`servers:pick:${userId}`)
    .setPlaceholder(t('dm.selectPlaceholder'))
    .addOptions(
      guilds.slice(0, 25).map((guild) => ({
        label: guild.name.slice(0, 100),
        value: guild.id,
        description: t('dm.serverMembers', { count: guild.memberCount ?? 0 }).slice(0, 100),
        default: guild.id === last,
      })),
    );
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = { dmMode, isDirect, sharedGuilds, getLastGuild, setLastGuild, buildServerPicker };
