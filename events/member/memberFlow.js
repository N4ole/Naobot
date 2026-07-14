/**
 * Logs des arrivées et départs de membres (catégorie « arrivees-departs »).
 */
const { Events } = require('discord.js');
const logService = require('../../services/logging/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const memberAdd = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await logService.log(
      member.guild,
      'arrivees-departs',
      logEventEmbed({
        title: t('logs.events.memberJoined'),
        color: COLORS.LOG_CREATE,
        description: `${member} (\`${member.id}\`)`,
        user: member.user,
        fields: [
          {
            name: t('logs.events.accountCreated'),
            value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
        ],
      }),
    );
  },
};

const memberRemove = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const roles = member.roles?.cache
      ?.filter((role) => role.id !== member.guild.roles.everyone.id)
      .map((role) => `${role}`)
      .join(', ');

    await logService.log(
      member.guild,
      'arrivees-departs',
      logEventEmbed({
        title: t('logs.events.memberLeft'),
        color: COLORS.LOG_DELETE,
        description: `${member.user?.tag ?? member.id} (\`${member.id}\`)`,
        user: member.user ?? null,
        fields: [{ name: t('logs.events.roles'), value: roles || t('help.none'), inline: true }],
      }),
    );
  },
};

module.exports = [memberAdd, memberRemove];
