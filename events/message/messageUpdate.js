/**
 * Logs des modifications de messages : contenu avant / après, salon, auteur et
 * identifiant du message. Un simple chargement d'aperçu de lien (embed) ne
 * modifie pas `content` et ne produit donc **aucun** log inutile. Catégorie
 * « messages-modifies » → « Modération ».
 */
const { Events } = require('discord.js');
const logService = require('../../services/logs/logService');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    const before = oldMessage.content ?? null;
    const after = newMessage.content ?? null;
    // Seule une vraie modification de contenu est consignée (embed-only ignoré).
    if (before === after) return;
    if (!logService.isEnabled(newMessage.guild.id, 'messages-modifies')) return;

    await logService.record(newMessage.guild, 'messages-modifies', {
      title: t('logs.events.messageEdited'),
      emoji: 'doubt',
      color: COLORS.LOG_UPDATE,
      description: `[${t('logs.events.jumpToMessage')}](${newMessage.url})`,
      user: newMessage.author ?? null,
      fields: [
        { name: t('common.channel'), value: `${newMessage.channel} (\`${newMessage.channelId}\`)`, inline: true },
        { name: t('logs.events.messageId'), value: `\`${newMessage.id}\``, inline: true },
        { name: t('logs.events.before'), value: before?.slice(0, 1024) || t('logs.events.unknownContent') },
        { name: t('logs.events.after'), value: after?.slice(0, 1024) || t('logs.events.unknownContent') },
      ],
      signature: `${newMessage.guild.id}:msgedit:${newMessage.id}:${after?.length ?? 0}`,
    });
  },
};
