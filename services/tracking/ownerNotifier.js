/**
 * Notifications privées envoyées à tous les owners du bot lorsque le bot
 * rejoint ou quitte un serveur. Embeds conformes à la charte graphique
 * (logEventEmbed), avec statistiques détaillées du serveur et globales.
 */
const { ChannelType } = require('discord.js');
const ownerService = require('../owners/ownerService');
const reputationService = require('../reputation/reputationService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

function discordDate(timestamp) {
  return `<t:${Math.floor(timestamp / 1000)}:D>`;
}

/** Champs communs aux notifications d'arrivée et de départ. */
async function buildGuildFields(client, guild) {
  let members = guild.members.cache;
  // Sur un départ, le fetch échoue (bot absent) : on retombe sur le cache.
  members = await guild.members.fetch({ time: 10_000 }).catch(() => members);
  const bots = members.filter((member) => member.user.bot).size;
  const totalMembers = guild.memberCount ?? members.size;
  const humans = Math.max(totalMembers - bots, 0);
  const owner = await guild.fetchOwner().catch(() => null);

  const channels = guild.channels.cache;
  const countType = (type) => channels.filter((channel) => channel.type === type).size;

  const totalUsers = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount ?? 0), 0);

  return [
    {
      name: t('owners.servers.owner'),
      value: owner ? `${owner.user.tag} (\`${owner.id}\`)` : t('owners.servers.unknown'),
      inline: true,
    },
    { name: t('owners.servers.members'), value: String(totalMembers), inline: true },
    { name: t('tracking.humans'), value: String(humans), inline: true },
    { name: t('owners.servers.bots'), value: String(bots), inline: true },
    { name: t('tracking.textChannels'), value: String(countType(ChannelType.GuildText)), inline: true },
    { name: t('tracking.voiceChannels'), value: String(countType(ChannelType.GuildVoice)), inline: true },
    { name: t('tracking.categories'), value: String(countType(ChannelType.GuildCategory)), inline: true },
    { name: t('owners.servers.roles'), value: String(guild.roles.cache.size), inline: true },
    {
      name: t('owners.servers.verification'),
      value: t(`owners.servers.verificationLevels.${guild.verificationLevel}`),
      inline: true,
    },
    { name: t('owners.servers.created'), value: discordDate(guild.createdTimestamp), inline: true },
    {
      name: t('owners.servers.joined'),
      value: guild.joinedTimestamp ? discordDate(guild.joinedTimestamp) : t('owners.servers.unknown'),
      inline: true,
    },
    { name: t('tracking.totalGuilds'), value: String(client.guilds.cache.size), inline: true },
    { name: t('tracking.totalUsers'), value: String(totalUsers), inline: true },
  ];
}

function applyGuildImages(embed, guild) {
  const icon = guild.iconURL({ size: 256 });
  if (icon) embed.setThumbnail(icon);
  const banner = guild.bannerURL({ size: 1024 });
  if (banner) embed.setImage(banner);
}

/** Envoie un embed en message privé à tous les owners du bot. */
async function sendToOwners(client, embed) {
  for (const ownerId of ownerService.getAllOwnerIds()) {
    const user = await client.users.fetch(ownerId).catch(() => null);
    if (user) await user.send({ embeds: [embed] }).catch(() => null);
  }
}

/**
 * Notification « le bot a rejoint un serveur ».
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 */
async function notifyGuildJoin(client, guild) {
  const embed = logEventEmbed({
    title: t('tracking.joinTitle'),
    color: COLORS.LOG_CREATE,
    description: `**${guild.name}** (\`${guild.id}\`)`,
    fields: await buildGuildFields(client, guild),
  });
  applyGuildImages(embed, guild);
  await sendToOwners(client, embed);
}

/**
 * Notification « le bot a quitté un serveur » (départ ou expulsion),
 * enrichie du temps passé, de la réputation, de la dernière activité et du
 * nombre de commandes exécutées.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {object} stats - Statistiques persistées du serveur
 */
async function notifyGuildLeave(client, guild, stats) {
  const fields = await buildGuildFields(client, guild);

  const joinedAt = guild.joinedTimestamp ?? Date.parse(stats.lastJoinedAt ?? '');
  fields.push({
    name: t('tracking.timeSpent'),
    value: Number.isFinite(joinedAt) ? formatDuration(Date.now() - joinedAt) : t('owners.servers.unknown'),
    inline: true,
  });

  const reputation = reputationService.getEffective(stats);
  fields.push({
    name: t('tracking.reputation'),
    value: reputation ? reputationService.formatReputation(reputation) : t('owners.servers.unknown'),
    inline: true,
  });
  fields.push({
    name: t('tracking.lastActivity'),
    value: stats.lastActivityAt ? discordDate(Date.parse(stats.lastActivityAt)) : t('tracking.none'),
    inline: true,
  });
  fields.push({
    name: t('tracking.commandsExecuted'),
    value: String(stats.commandCount),
    inline: true,
  });

  const embed = logEventEmbed({
    title: t('tracking.leaveTitle'),
    color: COLORS.LOG_DELETE,
    description: `**${guild.name}** (\`${guild.id}\`)`,
    fields,
  });
  applyGuildImages(embed, guild);
  await sendToOwners(client, embed);
}

module.exports = { notifyGuildJoin, notifyGuildLeave, sendToOwners };
