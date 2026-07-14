/**
 * Logs des modifications de messages (catégorie « messages-modifies ») :
 * contenu avant / après, avec lien direct vers le message.
 */
const { Events } = require('discord.js');
const logService = require('../../services/logging/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild) return;
    if (newMessage.author?.bot) return;
    // Le chargement d'un aperçu de lien déclenche aussi un messageUpdate :
    // on ne consigne que les vraies modifications de contenu.
    const before = oldMessage.content ?? null;
    const after = newMessage.content ?? null;
    if (before === after) return;

    await logService.log(
      newMessage.guild,
      'messages-modifies',
      logEventEmbed({
        title: t('logs.events.messageEdited'),
        color: COLORS.LOG_UPDATE,
        description: `[${t('logs.events.jumpToMessage')}](${newMessage.url})`,
        user: newMessage.author ?? null,
        fields: [
          {
            name: t('logs.events.author'),
            value: newMessage.author ? `${newMessage.author.tag} (\`${newMessage.author.id}\`)` : t('logs.events.unknownContent'),
            inline: true,
          },
          { name: t('common.channel'), value: `${newMessage.channel}`, inline: true },
          { name: t('logs.events.before'), value: before?.slice(0, 1024) || t('logs.events.unknownContent') },
          { name: t('logs.events.after'), value: after?.slice(0, 1024) || t('logs.events.unknownContent') },
        ],
      }),
    );
  },
};
