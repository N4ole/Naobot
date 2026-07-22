/**
 * Logs des rôles du serveur : création, modification (nom, couleur, permissions),
 * suppression. Modérateur via audit logs. Catégorie « roles ».
 */
const { Events, AuditLogEvent, PermissionsBitField } = require('discord.js');
const logService = require('../../services/logs/logService');
const auditLogService = require('../../services/logs/auditLogService');
const permissionLabels = require('../../utils/constants/permissionLabels');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

function permNames(bitfield) {
  return new PermissionsBitField(bitfield).toArray().map((p) => permissionLabels[p] ?? p);
}

function colorHex(role) {
  return role.color ? `#${role.color.toString(16).padStart(6, '0')}` : t('logs.events.none');
}

const roleCreate = {
  name: Events.GuildRoleCreate,
  async execute(role) {
    if (!logService.isEnabled(role.guild.id, 'roles')) return;
    const audit = await auditLogService.resolveExecutor(role.guild, { type: AuditLogEvent.RoleCreate, targetId: role.id });
    const perms = permNames(role.permissions.bitfield);

    await logService.record(role.guild, 'roles', {
      title: t('logs.events.roleCreated'),
      emoji: 'thumb',
      color: COLORS.LOG_CREATE,
      fields: [
        { name: t('logs.events.name'), value: `${role} (\`${role.id}\`)`, inline: true },
        { name: t('logs.events.color'), value: colorHex(role), inline: true },
        { name: t('logs.events.position'), value: String(role.position), inline: true },
        { name: t('logs.events.permissions'), value: perms.length ? perms.join(', ').slice(0, 1024) : t('logs.events.none') },
      ],
      moderator: audit?.executor ?? null,
      signature: `${role.guild.id}:rolecreate:${role.id}`,
    });
  },
};

const roleDelete = {
  name: Events.GuildRoleDelete,
  async execute(role) {
    if (!logService.isEnabled(role.guild.id, 'roles')) return;
    const audit = await auditLogService.resolveExecutor(role.guild, { type: AuditLogEvent.RoleDelete, targetId: role.id });
    const perms = permNames(role.permissions.bitfield);

    await logService.record(role.guild, 'roles', {
      title: t('logs.events.roleDeleted'),
      emoji: 'crying',
      color: COLORS.LOG_DELETE,
      fields: [
        { name: t('logs.events.name'), value: `\`${role.name}\` (\`${role.id}\`)`, inline: true },
        { name: t('logs.events.permissions'), value: perms.length ? perms.join(', ').slice(0, 1024) : t('logs.events.none') },
      ],
      moderator: audit?.executor ?? null,
      signature: `${role.guild.id}:roledelete:${role.id}`,
    });
  },
};

const roleUpdate = {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    if (!logService.isEnabled(newRole.guild.id, 'roles')) return;

    const fields = [];
    if (oldRole.name !== newRole.name) {
      fields.push({ name: t('logs.events.name'), value: `\`${oldRole.name}\` → \`${newRole.name}\`` });
    }
    if (oldRole.color !== newRole.color) {
      fields.push({ name: t('logs.events.color'), value: `${colorHex(oldRole)} → ${colorHex(newRole)}`, inline: true });
    }
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      const before = new Set(permNames(oldRole.permissions.bitfield));
      const after = new Set(permNames(newRole.permissions.bitfield));
      const added = [...after].filter((p) => !before.has(p));
      const removed = [...before].filter((p) => !after.has(p));
      if (added.length) fields.push({ name: `➕ ${t('logs.events.permissions')}`, value: added.join(', ').slice(0, 1024) });
      if (removed.length) fields.push({ name: `➖ ${t('logs.events.permissions')}`, value: removed.join(', ').slice(0, 1024) });
    }
    if (fields.length === 0) return;

    const audit = await auditLogService.resolveExecutor(newRole.guild, { type: AuditLogEvent.RoleUpdate, targetId: newRole.id });

    await logService.record(newRole.guild, 'roles', {
      title: t('logs.events.roleUpdated'),
      emoji: 'doubt',
      color: COLORS.LOG_UPDATE,
      description: `${newRole} (\`${newRole.id}\`)`,
      fields,
      moderator: audit?.executor ?? null,
      signature: `${newRole.guild.id}:roleupdate:${newRole.id}:${fields.length}`,
    });
  },
};

module.exports = [roleCreate, roleDelete, roleUpdate];
