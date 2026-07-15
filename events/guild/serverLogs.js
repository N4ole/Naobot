/**
 * Logs des événements liés au serveur (catégorie « serveur ») :
 * changements de nom / d'icône, émojis créés ou supprimés.
 */
const { Events } = require('discord.js');
const logService = require('../../services/logging/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const guildUpdate = {
  name: Events.GuildUpdate,
  async execute(oldGuild, newGuild) {
    const fields = [];
    if (oldGuild.name !== newGuild.name) {
      fields.push({ name: t('logs.events.name'), value: `\`${oldGuild.name}\` → \`${newGuild.name}\`` });
    }
    if (oldGuild.icon !== newGuild.icon) {
      fields.push({ name: t('logs.events.icon'), value: t('logs.events.iconChanged') });
    }
    if (fields.length === 0) return;

    await logService.log(
      newGuild,
      'serveur',
      logEventEmbed({ title: t('logs.events.serverUpdated'), color: COLORS.LOG_UPDATE, fields }),
    );
  },
};

const emojiCreate = {
  name: Events.GuildEmojiCreate,
  async execute(emoji) {
    await logService.log(
      emoji.guild,
      'serveur',
      logEventEmbed({
        title: t('logs.events.emojiCreated'),
        color: COLORS.LOG_CREATE,
        description: `${emoji} \`:${emoji.name}:\``,
      }),
    );
  },
};

const emojiDelete = {
  name: Events.GuildEmojiDelete,
  async execute(emoji) {
    await logService.log(
      emoji.guild,
      'serveur',
      logEventEmbed({
        title: t('logs.events.emojiDeleted'),
        color: COLORS.LOG_DELETE,
        description: `\`:${emoji.name}:\``,
      }),
    );
  },
};

module.exports = [guildUpdate, emojiCreate, emojiDelete];
