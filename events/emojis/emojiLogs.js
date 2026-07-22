/**
 * Logs des émojis du serveur : création, renommage, suppression. Modérateur via
 * audit logs. Catégorie « emojis » → « Modération ».
 */
const { Events, AuditLogEvent } = require('discord.js');
const logService = require('../../services/logs/logService');
const auditLogService = require('../../services/logs/auditLogService');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const emojiCreate = {
  name: Events.GuildEmojiCreate,
  async execute(emoji) {
    if (!logService.isEnabled(emoji.guild.id, 'emojis')) return;
    const audit = await auditLogService.resolveExecutor(emoji.guild, { type: AuditLogEvent.EmojiCreate, targetId: emoji.id });
    await logService.record(emoji.guild, 'emojis', {
      title: t('logs.events.emojiCreated'),
      emoji: 'thumb',
      color: COLORS.LOG_CREATE,
      description: `${emoji} \`:${emoji.name}:\` (\`${emoji.id}\`)`,
      moderator: audit?.executor ?? null,
      signature: `${emoji.guild.id}:emojicreate:${emoji.id}`,
    });
  },
};

const emojiDelete = {
  name: Events.GuildEmojiDelete,
  async execute(emoji) {
    if (!logService.isEnabled(emoji.guild.id, 'emojis')) return;
    const audit = await auditLogService.resolveExecutor(emoji.guild, { type: AuditLogEvent.EmojiDelete, targetId: emoji.id });
    await logService.record(emoji.guild, 'emojis', {
      title: t('logs.events.emojiDeleted'),
      emoji: 'crying',
      color: COLORS.LOG_DELETE,
      description: `\`:${emoji.name}:\` (\`${emoji.id}\`)`,
      moderator: audit?.executor ?? null,
      signature: `${emoji.guild.id}:emojidelete:${emoji.id}`,
    });
  },
};

const emojiUpdate = {
  name: Events.GuildEmojiUpdate,
  async execute(oldEmoji, newEmoji) {
    if (oldEmoji.name === newEmoji.name) return;
    if (!logService.isEnabled(newEmoji.guild.id, 'emojis')) return;
    const audit = await auditLogService.resolveExecutor(newEmoji.guild, { type: AuditLogEvent.EmojiUpdate, targetId: newEmoji.id });
    await logService.record(newEmoji.guild, 'emojis', {
      title: t('logs.events.emojiUpdated'),
      emoji: 'doubt',
      color: COLORS.LOG_UPDATE,
      description: `${newEmoji} \`:${oldEmoji.name}:\` → \`:${newEmoji.name}:\``,
      moderator: audit?.executor ?? null,
      signature: `${newEmoji.guild.id}:emojiupdate:${newEmoji.id}`,
    });
  },
};

module.exports = [emojiCreate, emojiDelete, emojiUpdate];
