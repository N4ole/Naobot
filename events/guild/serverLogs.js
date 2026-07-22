/**
 * Logs des modifications du serveur : nom, icône, bannière, niveau de
 * vérification, paramètres communautaires. Modérateur via audit logs.
 * Catégorie « serveur » → « Modération ». (Les émojis/stickers/invitations ont
 * leurs propres listeners dédiés.)
 */
const { Events, AuditLogEvent, GuildVerificationLevel } = require('discord.js');
const logService = require('../../services/logs/logService');
const auditLogService = require('../../services/logs/auditLogService');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const VERIF_LABELS = {
  [GuildVerificationLevel.None]: 'Aucun',
  [GuildVerificationLevel.Low]: 'Faible',
  [GuildVerificationLevel.Medium]: 'Moyen',
  [GuildVerificationLevel.High]: 'Élevé',
  [GuildVerificationLevel.VeryHigh]: 'Très élevé',
};

module.exports = {
  name: Events.GuildUpdate,
  async execute(oldGuild, newGuild) {
    if (!logService.isEnabled(newGuild.id, 'serveur')) return;

    const fields = [];
    if (oldGuild.name !== newGuild.name) {
      fields.push({ name: t('logs.events.name'), value: `\`${oldGuild.name}\` → \`${newGuild.name}\`` });
    }
    if (oldGuild.icon !== newGuild.icon) {
      fields.push({ name: t('logs.events.icon'), value: t('logs.events.iconChanged'), inline: true });
    }
    if (oldGuild.banner !== newGuild.banner) {
      fields.push({ name: t('logs.events.banner'), value: t('logs.events.bannerChanged'), inline: true });
    }
    if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
      fields.push({
        name: t('logs.events.verificationLevel'),
        value: `${VERIF_LABELS[oldGuild.verificationLevel] ?? oldGuild.verificationLevel} → ${VERIF_LABELS[newGuild.verificationLevel] ?? newGuild.verificationLevel}`,
        inline: true,
      });
    }
    const oldFeatures = new Set(oldGuild.features ?? []);
    const newFeatures = new Set(newGuild.features ?? []);
    const addedFeatures = [...newFeatures].filter((f) => !oldFeatures.has(f));
    const removedFeatures = [...oldFeatures].filter((f) => !newFeatures.has(f));
    if (addedFeatures.length || removedFeatures.length) {
      const parts = [];
      if (addedFeatures.length) parts.push(`➕ ${addedFeatures.join(', ')}`);
      if (removedFeatures.length) parts.push(`➖ ${removedFeatures.join(', ')}`);
      fields.push({ name: t('logs.events.features'), value: parts.join('\n').slice(0, 1024) });
    }
    if (fields.length === 0) return;

    const audit = await auditLogService.resolveExecutor(newGuild, { type: AuditLogEvent.GuildUpdate, targetId: newGuild.id });

    await logService.record(newGuild, 'serveur', {
      title: t('logs.events.serverUpdated'),
      emoji: 'doubt',
      color: COLORS.LOG_UPDATE,
      fields,
      moderator: audit?.executor ?? null,
      signature: `${newGuild.id}:guildupdate:${fields.length}`,
    });
  },
};
