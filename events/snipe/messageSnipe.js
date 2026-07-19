/**
 * Capture pour le snipe des événements de messages : suppressions unitaires,
 * suppressions massives (bulkDelete) et modifications. Les messages de bots
 * sont ignorés. La consultation se fait via les commandes snipe/editsnipe.
 */
const { Events } = require('discord.js');
const snipeService = require('../../services/snipe/snipeService');

/** Extrait les URLs des pièces jointes (et sépare les images). */
function splitAttachments(message) {
  const attachments = [];
  const images = [];
  for (const attachment of message.attachments?.values?.() ?? []) {
    const isImage = (attachment.contentType ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(attachment.name ?? '');
    (isImage ? images : attachments).push(attachment.url);
  }
  return { attachments, images };
}

const messageDelete = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    const { attachments, images } = splitAttachments(message);
    snipeService.record(message.guild, 'deleted', {
      type: 'delete',
      userId: message.author?.id ?? null,
      userTag: message.author?.tag ?? null,
      channelId: message.channel?.id ?? null,
      oldContent: message.content ?? null,
      attachments,
      images,
    });
  },
};

const messageBulkDelete = {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    if (!channel?.guild) return;
    snipeService.record(channel.guild, 'deleted', {
      type: 'bulk',
      channelId: channel.id,
      extra: { count: messages.size },
    });
  },
};

const messageUpdate = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    const before = oldMessage.content ?? null;
    const after = newMessage.content ?? null;
    if (before === after) return; // aperçu de lien, pas une vraie édition
    snipeService.record(newMessage.guild, 'edited', {
      type: 'edit',
      userId: newMessage.author?.id ?? null,
      userTag: newMessage.author?.tag ?? null,
      channelId: newMessage.channel?.id ?? null,
      oldContent: before,
      newContent: after,
    });
  },
};

module.exports = [messageDelete, messageBulkDelete, messageUpdate];
