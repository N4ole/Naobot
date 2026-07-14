/**
 * Logs des salons créés, modifiés ou supprimés (catégorie « salons »).
 * Les salons du système de logs lui-même sont ignorés pour éviter le bruit
 * lors de l'activation des catégories.
 */
const { Events, ChannelType } = require('discord.js');
const logService = require('../../services/logging/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

function isLogChannel(channel) {
  return channel.name?.startsWith('logs-') || channel.name === logService.LOGS_PARENT_NAME;
}

function channelTypeLabel(channel) {
  return channel.type === ChannelType.GuildCategory ? t('logs.events.category') : t('common.channel');
}

const channelCreate = {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel.guild || isLogChannel(channel)) return;

    await logService.log(
      channel.guild,
      'salons',
      logEventEmbed({
        title: t('logs.events.channelCreated'),
        color: COLORS.LOG_CREATE,
        fields: [
          { name: channelTypeLabel(channel), value: `${channel} (\`${channel.name}\`)`, inline: true },
        ],
      }),
    );
  },
};

const channelDelete = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild || isLogChannel(channel)) return;

    await logService.log(
      channel.guild,
      'salons',
      logEventEmbed({
        title: t('logs.events.channelDeleted'),
        color: COLORS.LOG_DELETE,
        fields: [{ name: channelTypeLabel(channel), value: `\`${channel.name}\``, inline: true }],
      }),
    );
  },
};

const channelUpdate = {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild || isLogChannel(newChannel)) return;

    // Seuls le nom et le sujet sont consignés : les autres mises à jour
    // (positions, permissions…) sont trop fréquentes pour être utiles.
    const fields = [];
    if (oldChannel.name !== newChannel.name) {
      fields.push({
        name: t('logs.events.name'),
        value: `\`${oldChannel.name}\` → \`${newChannel.name}\``,
      });
    }
    if ('topic' in oldChannel && oldChannel.topic !== newChannel.topic) {
      fields.push({
        name: t('logs.events.topic'),
        value: `${oldChannel.topic || t('help.none')} → ${newChannel.topic || t('help.none')}`.slice(0, 1024),
      });
    }
    if (fields.length === 0) return;

    await logService.log(
      newChannel.guild,
      'salons',
      logEventEmbed({
        title: t('logs.events.channelUpdated'),
        color: COLORS.LOG_UPDATE,
        description: `${newChannel}`,
        fields,
      }),
    );
  },
};

module.exports = [channelCreate, channelDelete, channelUpdate];
