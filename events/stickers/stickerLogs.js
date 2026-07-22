/**
 * Logs des stickers du serveur : création, renommage, suppression. Modérateur
 * via audit logs. Catégorie « stickers » → « Modération ».
 */
const { Events, AuditLogEvent } = require('discord.js');
const logService = require('../../services/logs/logService');
const auditLogService = require('../../services/logs/auditLogService');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const stickerCreate = {
  name: Events.GuildStickerCreate,
  async execute(sticker) {
    if (!sticker.guild || !logService.isEnabled(sticker.guild.id, 'stickers')) return;
    const audit = await auditLogService.resolveExecutor(sticker.guild, { type: AuditLogEvent.StickerCreate, targetId: sticker.id });
    await logService.record(sticker.guild, 'stickers', {
      title: t('logs.events.stickerCreated'),
      emoji: 'thumb',
      color: COLORS.LOG_CREATE,
      description: `\`${sticker.name}\` (\`${sticker.id}\`)`,
      moderator: audit?.executor ?? null,
      signature: `${sticker.guild.id}:stickercreate:${sticker.id}`,
    });
  },
};

const stickerDelete = {
  name: Events.GuildStickerDelete,
  async execute(sticker) {
    if (!sticker.guild || !logService.isEnabled(sticker.guild.id, 'stickers')) return;
    const audit = await auditLogService.resolveExecutor(sticker.guild, { type: AuditLogEvent.StickerDelete, targetId: sticker.id });
    await logService.record(sticker.guild, 'stickers', {
      title: t('logs.events.stickerDeleted'),
      emoji: 'crying',
      color: COLORS.LOG_DELETE,
      description: `\`${sticker.name}\` (\`${sticker.id}\`)`,
      moderator: audit?.executor ?? null,
      signature: `${sticker.guild.id}:stickerdelete:${sticker.id}`,
    });
  },
};

const stickerUpdate = {
  name: Events.GuildStickerUpdate,
  async execute(oldSticker, newSticker) {
    if (!newSticker.guild) return;
    if (oldSticker.name === newSticker.name && oldSticker.description === newSticker.description) return;
    if (!logService.isEnabled(newSticker.guild.id, 'stickers')) return;
    const audit = await auditLogService.resolveExecutor(newSticker.guild, { type: AuditLogEvent.StickerUpdate, targetId: newSticker.id });
    await logService.record(newSticker.guild, 'stickers', {
      title: t('logs.events.stickerUpdated'),
      emoji: 'doubt',
      color: COLORS.LOG_UPDATE,
      description: `\`${oldSticker.name}\` → \`${newSticker.name}\` (\`${newSticker.id}\`)`,
      moderator: audit?.executor ?? null,
      signature: `${newSticker.guild.id}:stickerupdate:${newSticker.id}`,
    });
  },
};

module.exports = [stickerCreate, stickerDelete, stickerUpdate];
