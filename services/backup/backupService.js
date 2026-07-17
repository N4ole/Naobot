/**
 * Sauvegarde et restauration de serveur.
 *
 * Une sauvegarde capture la **structure Discord** (rôles, catégories,
 * salons — avec leurs permissions et leur ordre) et la **configuration du
 * bot** propre au serveur (logs, bump, tickets, rôles réactions,
 * protections, bienvenue, sanctions, réputation…).
 *
 * La restauration est **non destructive** : elle recrée uniquement les
 * éléments manquants (rôles/catégories/salons compatibles) et réapplique la
 * configuration du bot, puis journalise. Chaque sauvegarde a un identifiant
 * unique, un auteur et une date ; le nombre est plafonné par serveur.
 */
const { ChannelType, PermissionsBitField } = require('discord.js');
const repository = require('../../database/backupRepository');
const botConfigBackup = require('./botConfigBackup');
const logService = require('../logging/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const SNAPSHOTTABLE_TYPES = [
  ChannelType.GuildCategory,
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildForum,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
];

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

function snapshotRoles(guild) {
  return guild.roles.cache
    .filter((role) => role.id !== guild.roles.everyone.id && !role.managed)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
      icon: role.iconURL() ?? null,
    }));
}

function snapshotOverwrites(channel) {
  return [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString(),
  }));
}

function snapshotChannels(guild) {
  return guild.channels.cache
    .filter((channel) => SNAPSHOTTABLE_TYPES.includes(channel.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId ?? null,
      position: channel.rawPosition,
      topic: 'topic' in channel ? channel.topic ?? null : null,
      nsfw: 'nsfw' in channel ? channel.nsfw ?? false : false,
      bitrate: 'bitrate' in channel ? channel.bitrate ?? null : null,
      overwrites: snapshotOverwrites(channel),
    }));
}

/**
 * Crée une sauvegarde du serveur.
 * @returns {Promise<{ backup: object, evicted: object|null }>}
 */
async function createBackup(guild, name, byUser) {
  const backup = {
    id: repository.generateId(),
    name: name || t('backup.defaultName'),
    createdBy: byUser.id,
    createdAt: new Date().toISOString(),
    data: {
      roles: snapshotRoles(guild),
      channels: snapshotChannels(guild),
      botConfig: botConfigBackup.capture(guild.id),
    },
  };
  const result = repository.addBackup(guild.id, backup);

  await logService.log(
    guild,
    'sauvegardes',
    logEventEmbed({
      title: `💾 ${t('backup.logs.created')}`,
      color: COLORS.LOG_CREATE,
      user: byUser,
      fields: [
        { name: t('backup.field.id'), value: `\`${backup.id}\``, inline: true },
        { name: t('backup.field.roles'), value: String(backup.data.roles.length), inline: true },
        { name: t('backup.field.channels'), value: String(backup.data.channels.length), inline: true },
      ],
    }),
  );
  return result;
}

/** Résumé détaillé d'une sauvegarde (pour la confirmation de restauration). */
function summarize(backup) {
  const channels = backup.data.channels;
  const byType = (type) => channels.filter((channel) => channel.type === type).length;
  return {
    roles: backup.data.roles.length,
    categories: byType(ChannelType.GuildCategory),
    text: byType(ChannelType.GuildText),
    voice: byType(ChannelType.GuildVoice),
    forums: byType(ChannelType.GuildForum),
    announcements: byType(ChannelType.GuildAnnouncement),
    configSystems: Object.keys(backup.data.botConfig).length,
  };
}

// ---------------------------------------------------------------------------
// Restauration (non destructive : recrée les éléments manquants)
// ---------------------------------------------------------------------------

async function restoreRoles(guild, roles) {
  let created = 0;
  // Du plus bas au plus haut pour respecter approximativement l'ordre.
  for (const role of [...roles].reverse()) {
    if (guild.roles.cache.some((existing) => existing.name === role.name)) continue;
    const ok = await guild.roles
      .create({
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: new PermissionsBitField(BigInt(role.permissions)),
        reason: 'Restauration de sauvegarde',
      })
      .then(() => true)
      .catch(() => false);
    if (ok) created += 1;
  }
  return created;
}

async function restoreChannels(guild, channels) {
  let created = 0;
  const categoryMap = new Map(); // ancien id de catégorie → nouvelle catégorie

  // 1) Catégories d'abord.
  for (const channel of channels.filter((c) => c.type === ChannelType.GuildCategory)) {
    let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === channel.name);
    if (!category) {
      category = await guild.channels.create({ name: channel.name, type: ChannelType.GuildCategory, reason: 'Restauration de sauvegarde' }).catch(() => null);
      if (category) created += 1;
    }
    if (category) categoryMap.set(channel.id, category);
  }

  // 2) Autres salons, rattachés à leur catégorie recréée.
  for (const channel of channels.filter((c) => c.type !== ChannelType.GuildCategory)) {
    const parent = channel.parentId ? categoryMap.get(channel.parentId) : null;
    const exists = guild.channels.cache.some((c) => c.type === channel.type && c.name === channel.name && (c.parentId ?? null) === (parent?.id ?? null));
    if (exists) continue;
    const ok = await guild.channels
      .create({
        name: channel.name,
        type: channel.type,
        parent: parent?.id,
        topic: channel.topic ?? undefined,
        nsfw: channel.nsfw,
        reason: 'Restauration de sauvegarde',
      })
      .then(() => true)
      .catch(() => false);
    if (ok) created += 1;
  }
  return created;
}

/**
 * Restaure une sauvegarde (non destructif).
 * @returns {Promise<{ rolesCreated: number, channelsCreated: number, configRestored: number }>}
 */
async function restoreBackup(guild, backup, byUser) {
  const rolesCreated = await restoreRoles(guild, backup.data.roles);
  const channelsCreated = await restoreChannels(guild, backup.data.channels);
  const configRestored = botConfigBackup.restore(guild.id, backup.data.botConfig);

  await logService.log(
    guild,
    'sauvegardes',
    logEventEmbed({
      title: `♻️ ${t('backup.logs.restored')}`,
      color: COLORS.LOG_UPDATE,
      user: byUser,
      fields: [
        { name: t('backup.field.id'), value: `\`${backup.id}\``, inline: true },
        { name: t('backup.field.rolesCreated'), value: String(rolesCreated), inline: true },
        { name: t('backup.field.channelsCreated'), value: String(channelsCreated), inline: true },
        { name: t('backup.field.configRestored'), value: String(configRestored), inline: true },
      ],
    }),
  );
  return { rolesCreated, channelsCreated, configRestored };
}

async function deleteBackup(guild, backupId, byUser) {
  const ok = repository.deleteBackup(guild.id, backupId);
  if (ok) {
    await logService.log(
      guild,
      'sauvegardes',
      logEventEmbed({
        title: `🗑️ ${t('backup.logs.deleted')}`,
        color: COLORS.LOG_DELETE,
        user: byUser,
        fields: [{ name: t('backup.field.id'), value: `\`${backupId}\``, inline: true }],
      }),
    );
  }
  return ok;
}

module.exports = {
  MAX_BACKUPS: repository.MAX_BACKUPS,
  createBackup,
  summarize,
  restoreBackup,
  deleteBackup,
  getBackups: repository.getBackups,
  getBackup: repository.getBackup,
};
