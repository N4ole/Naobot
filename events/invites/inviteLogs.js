/**
 * Logs des invitations : création (durée, utilisations max, créateur) et
 * suppression. Modérateur via audit logs. Catégorie « invitations » →
 * « Modération ».
 */
const { Events, AuditLogEvent } = require('discord.js');
const logService = require('../../services/logs/logService');
const auditLogService = require('../../services/logs/auditLogService');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

function formatMaxAge(seconds) {
  if (!seconds) return t('logs.events.permanent');
  if (seconds % 86400 === 0) return `${seconds / 86400} j`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

const inviteCreate = {
  name: Events.InviteCreate,
  async execute(invite) {
    if (!invite.guild || !logService.isEnabled(invite.guild.id, 'invitations')) return;
    await logService.record(invite.guild, 'invitations', {
      title: t('logs.events.inviteCreated'),
      emoji: 'thumb',
      color: COLORS.LOG_CREATE,
      fields: [
        { name: t('logs.events.inviteCode'), value: `\`${invite.code}\``, inline: true },
        { name: t('common.channel'), value: invite.channel ? `${invite.channel}` : t('logs.events.none'), inline: true },
        { name: t('logs.events.inviteMaxAge'), value: formatMaxAge(invite.maxAge), inline: true },
        { name: t('logs.events.inviteMaxUses'), value: invite.maxUses ? String(invite.maxUses) : t('logs.events.unlimited'), inline: true },
        { name: t('logs.events.inviter'), value: invite.inviter ? `${invite.inviter.tag} (\`${invite.inviter.id}\`)` : t('logs.events.none'), inline: true },
      ],
      moderator: invite.inviter ?? null,
      signature: `${invite.guild.id}:invitecreate:${invite.code}`,
    });
  },
};

const inviteDelete = {
  name: Events.InviteDelete,
  async execute(invite) {
    if (!invite.guild || !logService.isEnabled(invite.guild.id, 'invitations')) return;
    const audit = await auditLogService.resolveExecutor(invite.guild, { type: AuditLogEvent.InviteDelete });
    await logService.record(invite.guild, 'invitations', {
      title: t('logs.events.inviteDeleted'),
      emoji: 'crying',
      color: COLORS.LOG_DELETE,
      fields: [
        { name: t('logs.events.inviteCode'), value: `\`${invite.code}\``, inline: true },
        { name: t('common.channel'), value: invite.channel ? `${invite.channel}` : t('logs.events.none'), inline: true },
      ],
      moderator: audit?.executor ?? null,
      signature: `${invite.guild.id}:invitedelete:${invite.code}`,
    });
  },
};

module.exports = [inviteCreate, inviteDelete];
