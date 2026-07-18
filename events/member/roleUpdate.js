/**
 * Logs des changements de rôles des membres (catégorie « roles »).
 */
const { Events } = require('discord.js');
const logService = require('../../services/logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    const added = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
    if (added.size === 0 && removed.size === 0) return;

    const fields = [
      { name: t('common.member'), value: `${newMember.user.tag} (\`${newMember.id}\`)`, inline: true },
    ];
    if (added.size > 0) {
      fields.push({ name: t('logs.events.rolesAdded'), value: added.map((r) => `${r}`).join(', ') });
    }
    if (removed.size > 0) {
      fields.push({ name: t('logs.events.rolesRemoved'), value: removed.map((r) => `${r}`).join(', ') });
    }

    await logService.log(
      newMember.guild,
      'roles',
      logEventEmbed({
        title: t('logs.events.rolesUpdated'),
        color: COLORS.LOG_UPDATE,
        user: newMember.user,
        fields,
      }),
    );
  },
};
