/**
 * Logs des suppressions de messages (catégorie « messages-supprimes ») :
 * suppressions unitaires et suppressions en masse (purge / bulkDelete).
 */
const { Events } = require('discord.js');
const logService = require('../../services/logging/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const messageDelete = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild) return;
    // Ignore les messages du bot (dont ses propres embeds de logs).
    if (message.author?.bot) return;

    const fields = [
      {
        name: t('logs.events.author'),
        value: message.author ? `${message.author.tag} (\`${message.author.id}\`)` : t('logs.events.unknownContent'),
        inline: true,
      },
      { name: t('common.channel'), value: `${message.channel}`, inline: true },
      {
        name: t('logs.events.content'),
        value: message.content?.slice(0, 1024) || t('logs.events.unknownContent'),
      },
    ];
    if (message.attachments?.size > 0) {
      fields.push({ name: t('logs.events.attachments'), value: String(message.attachments.size), inline: true });
    }

    await logService.log(
      message.guild,
      'messages-supprimes',
      logEventEmbed({
        title: t('logs.events.messageDeleted'),
        color: COLORS.LOG_DELETE,
        fields,
        user: message.author ?? null,
      }),
    );
  },
};

const messageBulkDelete = {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    if (!channel.guild) return;

    await logService.log(
      channel.guild,
      'messages-supprimes',
      logEventEmbed({
        title: t('logs.events.messagesBulkDeleted'),
        color: COLORS.LOG_DELETE,
        fields: [
          { name: t('common.channel'), value: `${channel}`, inline: true },
          { name: 'Messages', value: String(messages.size), inline: true },
        ],
      }),
    );
  },
};

module.exports = [messageDelete, messageBulkDelete];
