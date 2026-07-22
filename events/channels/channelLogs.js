/**
 * Logs des salons : création, modification (uniquement les propriétés réellement
 * modifiées), suppression. Modérateur récupéré via les audit logs Discord.
 * Catégorie « salons » → « Modération ». Les salons du système de logs sont
 * ignorés (bruit à l'activation).
 */
const { Events, ChannelType, AuditLogEvent } = require('discord.js');
const logService = require('../../services/logs/logService');
const auditLogService = require('../../services/logs/auditLogService');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const TYPE_LABELS = {
  [ChannelType.GuildText]: 'Salon textuel',
  [ChannelType.GuildVoice]: 'Salon vocal',
  [ChannelType.GuildCategory]: 'Catégorie',
  [ChannelType.GuildAnnouncement]: 'Salon d’annonces',
  [ChannelType.GuildStageVoice]: 'Salon de conférence',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildMedia]: 'Salon média',
};

function typeLabel(channel) {
  return TYPE_LABELS[channel.type] ?? 'Salon';
}

function isLogChannel(channel) {
  return channel.name === logService.LOGS_PARENT_NAME || Object.values(require('../../utils/constants/logCategories')).some((c) => c.channelName === channel.name);
}

const channelCreate = {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel.guild || isLogChannel(channel)) return;
    if (!logService.isEnabled(channel.guild.id, 'salons')) return;

    const audit = await auditLogService.resolveExecutor(channel.guild, { type: AuditLogEvent.ChannelCreate, targetId: channel.id });
    const fields = [
      { name: t('logs.events.name'), value: `${channel} (\`${channel.id}\`)`, inline: true },
      { name: t('logs.events.type'), value: typeLabel(channel), inline: true },
    ];
    if (channel.parent) fields.push({ name: t('logs.events.parentCategory'), value: `${channel.parent.name}`, inline: true });

    await logService.record(channel.guild, 'salons', {
      title: t('logs.events.channelCreated'),
      emoji: 'thumb',
      color: COLORS.LOG_CREATE,
      fields,
      moderator: audit?.executor ?? null,
      signature: `${channel.guild.id}:chancreate:${channel.id}`,
    });
  },
};

const channelDelete = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild || isLogChannel(channel)) return;
    if (!logService.isEnabled(channel.guild.id, 'salons')) return;

    const audit = await auditLogService.resolveExecutor(channel.guild, { type: AuditLogEvent.ChannelDelete, targetId: channel.id });
    const fields = [
      { name: t('logs.events.name'), value: `\`${channel.name}\` (\`${channel.id}\`)`, inline: true },
      { name: t('logs.events.type'), value: typeLabel(channel), inline: true },
    ];
    if (channel.parent) fields.push({ name: t('logs.events.parentCategory'), value: `${channel.parent.name}`, inline: true });

    await logService.record(channel.guild, 'salons', {
      title: t('logs.events.channelDeleted'),
      emoji: 'crying',
      color: COLORS.LOG_DELETE,
      fields,
      moderator: audit?.executor ?? null,
      signature: `${channel.guild.id}:chandelete:${channel.id}`,
    });
  },
};

const channelUpdate = {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild || isLogChannel(newChannel)) return;
    if (!logService.isEnabled(newChannel.guild.id, 'salons')) return;

    const none = t('logs.events.none');
    const fields = [];
    if (oldChannel.name !== newChannel.name) {
      fields.push({ name: t('logs.events.name'), value: `\`${oldChannel.name}\` → \`${newChannel.name}\`` });
    }
    if ('topic' in oldChannel && oldChannel.topic !== newChannel.topic) {
      fields.push({ name: t('logs.events.topic'), value: `${oldChannel.topic || none} → ${newChannel.topic || none}`.slice(0, 1024) });
    }
    if (oldChannel.parentId !== newChannel.parentId) {
      fields.push({ name: t('logs.events.parentCategory'), value: `${oldChannel.parent?.name || none} → ${newChannel.parent?.name || none}` });
    }
    if ('rateLimitPerUser' in oldChannel && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
      fields.push({ name: t('logs.events.slowmode'), value: `${oldChannel.rateLimitPerUser ?? 0}s → ${newChannel.rateLimitPerUser ?? 0}s`, inline: true });
    }
    if ('nsfw' in oldChannel && oldChannel.nsfw !== newChannel.nsfw) {
      fields.push({ name: t('logs.events.nsfw'), value: `${oldChannel.nsfw ? '✅' : '❌'} → ${newChannel.nsfw ? '✅' : '❌'}`, inline: true });
    }
    if ('bitrate' in oldChannel && oldChannel.bitrate !== newChannel.bitrate) {
      fields.push({ name: t('logs.events.bitrate'), value: `${Math.round((oldChannel.bitrate ?? 0) / 1000)}kbps → ${Math.round((newChannel.bitrate ?? 0) / 1000)}kbps`, inline: true });
    }
    if ('userLimit' in oldChannel && oldChannel.userLimit !== newChannel.userLimit) {
      fields.push({ name: t('logs.events.userLimit'), value: `${oldChannel.userLimit || none} → ${newChannel.userLimit || none}`, inline: true });
    }
    // Changement de permissions (overwrites) : on signale sans détailler.
    const oldPerms = oldChannel.permissionOverwrites?.cache?.size ?? 0;
    const newPerms = newChannel.permissionOverwrites?.cache?.size ?? 0;
    const permsHash = (c) => [...(c.permissionOverwrites?.cache?.values() ?? [])].map((o) => `${o.id}:${o.allow.bitfield}:${o.deny.bitfield}`).sort().join('|');
    if (oldPerms !== newPerms || permsHash(oldChannel) !== permsHash(newChannel)) {
      fields.push({ name: t('logs.events.permissions'), value: t('logs.events.permissionsChanged'), inline: true });
    }
    // N'enregistrer que les propriétés réellement modifiées (sinon rien).
    if (fields.length === 0) return;

    const audit = await auditLogService.resolveExecutor(newChannel.guild, { type: AuditLogEvent.ChannelUpdate, targetId: newChannel.id });

    await logService.record(newChannel.guild, 'salons', {
      title: t('logs.events.channelUpdated'),
      emoji: 'doubt',
      color: COLORS.LOG_UPDATE,
      description: `${newChannel} (\`${newChannel.id}\`)`,
      fields,
      moderator: audit?.executor ?? null,
      signature: `${newChannel.guild.id}:chanupdate:${newChannel.id}:${fields.length}`,
    });
  },
};

module.exports = [channelCreate, channelDelete, channelUpdate];
