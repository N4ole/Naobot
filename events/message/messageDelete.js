/**
 * Logs des suppressions de messages (unitaires et en masse).
 * Passe par le point d'entrée centralisé `logService.record` : émoji système,
 * horodatage, membre concerné, modérateur (via audit logs), anti-doublon et
 * persistance au journal. La catégorie « messages-supprimes » est routée vers
 * « Modération ».
 */
const { Events, AuditLogEvent } = require('discord.js');
const logService = require('../../services/logs/logService');
const auditLogService = require('../../services/logs/auditLogService');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const messageDelete = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    if (!logService.isEnabled(message.guild.id, 'messages-supprimes')) return;

    const fields = [
      {
        name: t('logs.events.author'),
        value: message.author ? `${message.author.tag} (\`${message.author.id}\`)` : t('logs.events.unknownContent'),
        inline: true,
      },
      { name: t('common.channel'), value: `${message.channel} (\`${message.channelId}\`)`, inline: true },
      { name: t('logs.events.messageId'), value: `\`${message.id}\``, inline: true },
      {
        name: t('logs.events.content'),
        value: message.content?.slice(0, 1024) || t('logs.events.unknownContent'),
      },
    ];
    if (message.attachments?.size > 0) {
      fields.push({
        name: t('logs.events.attachmentsList'),
        value: message.attachments.map((a) => `[${a.name}](${a.url})`).join('\n').slice(0, 1024),
      });
    }

    // Modérateur : uniquement si un tiers a supprimé le message (audit log).
    const audit = message.author
      ? await auditLogService.resolveExecutor(message.guild, { type: AuditLogEvent.MessageDelete, targetId: message.author.id })
      : null;
    const moderator = audit?.executor && audit.executor.id !== message.author?.id ? audit.executor : null;

    await logService.record(message.guild, 'messages-supprimes', {
      title: t('logs.events.messageDeleted'),
      emoji: 'crying',
      color: COLORS.LOG_DELETE,
      fields,
      user: message.author ?? null,
      moderator,
      signature: `${message.guild.id}:msgdel:${message.id}`,
    });
  },
};

const messageBulkDelete = {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    if (!channel.guild) return;
    if (!logService.isEnabled(channel.guild.id, 'messages-supprimes')) return;

    const audit = await auditLogService.resolveExecutor(channel.guild, { type: AuditLogEvent.MessageBulkDelete, targetId: channel.id });

    await logService.record(channel.guild, 'messages-supprimes', {
      title: t('logs.events.messagesBulkDeleted'),
      emoji: 'glitch',
      color: COLORS.LOG_DELETE,
      fields: [
        { name: t('common.channel'), value: `${channel} (\`${channel.id}\`)`, inline: true },
        { name: t('logs.events.messages'), value: String(messages.size), inline: true },
      ],
      moderator: audit?.executor ?? null,
      signature: `${channel.guild.id}:bulkdel:${channel.id}:${Date.now()}`,
    });
  },
};

module.exports = [messageDelete, messageBulkDelete];
