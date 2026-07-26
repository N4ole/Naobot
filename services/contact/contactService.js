/**
 * Système de communication sécurisée propriétaires de serveurs ↔ owners du bot.
 *
 * Toutes les communications transitent par le bot : le compte Discord
 * personnel d'un owner n'est jamais exposé au propriétaire, et
 * réciproquement les owners voient l'identité du propriétaire mais lui
 * répondent uniquement via le bot. Chaque conversation porte un
 * identifiant unique (CONTACT-000001) et un historique persistant.
 *
 * Extensible (pièces jointes, catégories, priorités, notes privées,
 * assignation…) : le schéma d'une conversation accepte de nouveaux champs,
 * la persistance est isolée dans database/contactRepository.
 */
const repository = require('../../database/contactRepository');
const ownerService = require('../owners/ownerService');
const reputationService = require('../reputation/reputationService');
const contactStatuses = require('../../utils/constants/contactStatuses');
const logService = require('../logs/logService');
const webNotifier = require('../web/webNotifier');
const emojis = require('../../config/emojis');
const { infoEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const SIGNATURE_LINE = '━━━━━━━━━━━━━━';

// ---------------------------------------------------------------------------
// Journalisation (catégorie de logs « contact ») — vers les owners en MP.
// ---------------------------------------------------------------------------

/**
 * Envoie un embed en MP à tous les owners du bot.
 * @returns {Promise<number>} nombre d'owners effectivement notifiés
 */
async function sendToOwners(client, embed, { exceptId = null } = {}) {
  let delivered = 0;
  for (const ownerId of ownerService.getAllOwnerIds()) {
    if (ownerId === exceptId) continue;
    const user = await client.users.fetch(ownerId).catch(() => null);
    if (user && (await user.send({ embeds: [embed] }).then(() => true).catch(() => false))) {
      delivered += 1;
    }
  }
  return delivered;
}

/** Journalise un événement de contact dans la catégorie de logs dédiée. */
function logContactEvent(guild, action, conversation, extraFields = []) {
  if (!guild) return Promise.resolve();
  return logService.log(
    guild,
    'contact',
    logEventEmbed({
      title: `✉️ ${t(`contact.logs.${action}`)}`,
      color: {
        opened: COLORS.LOG_CREATE,
        responded: COLORS.INFO,
        status: COLORS.LOG_UPDATE,
        closed: COLORS.LOG_DELETE,
        error: COLORS.ERROR,
      }[action] ?? COLORS.LOG_NEUTRAL,
      fields: [
        { name: t('contact.field.id'), value: `\`${conversation.id}\``, inline: true },
        ...extraFields,
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------

function statusLabel(status) {
  const def = contactStatuses[status];
  return def ? `${def.emoji} ${def.label}` : status;
}

/** Embed reçu par les owners à l'ouverture / à chaque nouveau message. */
function buildOwnerNotificationEmbed(guild, conversation, content, isNew) {
  const reputation = guild ? reputationService.formatReputation(reputationService.getOrCompute(guild)) : t('owners.servers.unknown');
  return infoEmbed(
    isNew ? t('contact.owner.newTitle', { id: conversation.id }) : t('contact.owner.messageTitle', { id: conversation.id }),
    null,
  )
    .setColor(isNew ? COLORS.LOG_CREATE : COLORS.INFO)
    .addFields(
      { name: t('contact.field.server'), value: `${conversation.guildName} (\`${conversation.guildId}\`)`, inline: true },
      { name: t('contact.field.owner'), value: `${conversation.ownerName} (\`${conversation.ownerId}\`)`, inline: true },
      { name: t('tracking.reputation'), value: reputation, inline: true },
      { name: t('contact.field.members'), value: guild ? String(guild.memberCount) : '—', inline: true },
      { name: t('contact.field.status'), value: statusLabel(conversation.status), inline: true },
      { name: t('contact.field.date'), value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
      { name: t('contact.field.message'), value: content.slice(0, 1024) },
      { name: t('contact.field.replyHint'), value: t('contact.owner.replyHint', { id: conversation.id }) },
    );
}

/**
 * Embed **officiel** reçu par le propriétaire d'un serveur lorsqu'un owner du
 * bot le contacte depuis l'interface web. Présentation professionnelle : titre,
 * contenu, date, et signature « Message officiel de l'équipe NaoBot ».
 * Le compte Discord de l'owner n'est jamais exposé.
 */
function buildOfficialEmbed({ title, content, botName, conversationId }) {
  return infoEmbed(`${emojis.get('wink')} ${title}`, content.slice(0, 4000))
    .setColor(COLORS.INFO)
    .setTimestamp()
    .addFields({ name: t('contact.field.date'), value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true })
    .setFooter({ text: t('contact.official.signature', { bot: botName ?? 'NaoBot', id: conversationId }) });
}

/** Message signé envoyé au propriétaire du serveur (réponse d'un owner). */
function buildOwnerReplyText(ownerName, content) {
  return [
    SIGNATURE_LINE,
    '',
    `**${t('contact.reply.header')}**`,
    '',
    t('contact.reply.by', { name: ownerName }),
    t('contact.reply.date', { date: new Date().toLocaleDateString('fr-FR') }),
    '',
    t('contact.reply.messageLabel'),
    '',
    content,
    '',
    t('contact.reply.footer', { id: '{id}' }),
    SIGNATURE_LINE,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Ouvre une conversation (ou ajoute un message à défaut ? Non : chaque
 * contactowner crée une nouvelle demande). Notifie tous les owners du bot.
 * @returns {Promise<{ ok: true, conversation, delivered: number } | { ok: false, code: string }>}
 */
async function openConversation(ctx, content) {
  if (ownerService.getAllOwnerIds().length === 0) return { ok: false, code: 'noOwners' };

  const now = new Date().toISOString();
  const conversation = {
    id: repository.nextId(),
    guildId: ctx.guild.id,
    guildName: ctx.guild.name,
    ownerId: ctx.user.id,
    ownerName: ctx.user.tag,
    status: 'open',
    createdAt: now,
    lastActivityAt: now,
    respondedBy: [],
    messages: [{ from: 'owner', authorId: ctx.user.id, authorName: ctx.user.tag, content, at: now }],
  };
  repository.saveConversation(conversation);

  const delivered = await sendToOwners(ctx.client, buildOwnerNotificationEmbed(ctx.guild, conversation, content, true));
  await logContactEvent(ctx.guild, 'opened', conversation, [
    { name: t('contact.field.server'), value: `${conversation.guildName}`, inline: true },
  ]);
  // L'interface web (section « Messagerie ») voit apparaître la conversation
  // en direct, sans rafraîchissement.
  webNotifier.publish('contactMessage', {
    conversationId: conversation.id,
    guild: { id: conversation.guildId, name: conversation.guildName },
    from: 'owner',
    author: conversation.ownerName,
    preview: content.slice(0, 200),
  });
  return { ok: true, conversation, delivered };
}

/**
 * Message **sortant** : un owner du bot contacte le propriétaire d'un serveur
 * depuis l'interface web. Ouvre une conversation (ou poursuit celle fournie),
 * envoie un embed officiel en MP au propriétaire et transfère la pièce jointe.
 *
 * La logique vit ici — l'interface web ne fait que déléguer, exactement comme
 * une commande Discord le ferait.
 *
 * @param {import('discord.js').Client} client
 * @param {{ guildId: string, title: string, content: string, author: object,
 *   attachment?: { name: string, data: Buffer }, conversationId?: string }} params
 * @returns {Promise<{ ok: true, conversation: object } | { ok: false, code: string }>}
 */
async function messageGuildOwner(client, { guildId, title, content, author, attachment = null, conversationId = null }) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, code: 'guildNotFound' };

  const guildOwner = await guild.fetchOwner().catch(() => null);
  if (!guildOwner) return { ok: false, code: 'ownerUnreachable' };

  const now = new Date().toISOString();
  // Poursuite d'une conversation existante, ou ouverture d'une nouvelle.
  let conversation = conversationId ? repository.getConversation(conversationId) : null;
  if (!conversation) {
    conversation = {
      id: repository.nextId(),
      guildId: guild.id,
      guildName: guild.name,
      ownerId: guildOwner.id,
      ownerName: guildOwner.user.tag,
      status: 'handled',
      createdAt: now,
      lastActivityAt: now,
      respondedBy: [],
      messages: [],
      initiatedBy: 'botOwner',
    };
  }

  const embed = buildOfficialEmbed({ title, content, botName: client.user?.username, conversationId: conversation.id });
  const payload = { embeds: [embed] };
  if (attachment?.data) payload.files = [{ attachment: attachment.data, name: attachment.name || 'piece-jointe' }];

  const sent = await guildOwner.user.send(payload).then(() => true).catch(() => false);
  if (!sent) {
    await logContactEvent(guild, 'error', conversation, [{ name: t('contact.field.detail'), value: t('contact.errors.dmClosed') }]);
    return { ok: false, code: 'dmClosed' };
  }

  conversation.messages.push({
    from: 'botOwner',
    authorId: author.id,
    authorName: author.tag,
    title,
    content,
    attachment: attachment ? { name: attachment.name, size: attachment.data.length } : null,
    at: now,
  });
  conversation.lastActivityAt = now;
  if (!conversation.respondedBy.includes(author.id)) conversation.respondedBy.push(author.id);
  repository.saveConversation(conversation);

  // Les autres owners sont tenus informés (transparence entre owners).
  const syncEmbed = infoEmbed(t('contact.sync.outgoingTitle', { id: conversation.id }), null)
    .setColor(COLORS.LOG_CREATE)
    .addFields(
      { name: t('contact.field.respondedBy'), value: `${author.tag}`, inline: true },
      { name: t('contact.field.server'), value: `${conversation.guildName}`, inline: true },
      { name: t('contact.field.message'), value: `**${title}**\n${content}`.slice(0, 1024) },
    );
  await sendToOwners(client, syncEmbed, { exceptId: author.id });
  await logContactEvent(guild, 'responded', conversation, [{ name: t('contact.field.respondedBy'), value: `${author.tag}`, inline: true }]);

  webNotifier.publish('contactMessage', {
    conversationId: conversation.id,
    guild: { id: conversation.guildId, name: conversation.guildName },
    from: 'botOwner',
    author: author.tag,
    preview: title,
  });
  return { ok: true, conversation };
}

/**
 * Réponse d'un owner du bot : message signé envoyé au propriétaire, tous
 * les autres owners synchronisés, historique et statut mis à jour.
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
async function respond(client, conversationId, ownerUser, content) {
  const conversation = repository.getConversation(conversationId);
  if (!conversation) return { ok: false, code: 'notFound' };

  const guild = client.guilds.cache.get(conversation.guildId) ?? null;
  const targetOwner = await client.users.fetch(conversation.ownerId).catch(() => null);
  if (!targetOwner) {
    await logContactEvent(guild, 'error', conversation, [{ name: t('contact.field.detail'), value: t('contact.errors.ownerUnreachable') }]);
    return { ok: false, code: 'ownerUnreachable' };
  }

  // Message signé — jamais le compte Discord de l'owner n'est exposé.
  const signed = buildOwnerReplyText(ownerUser.tag, content).replace('{id}', conversation.id);
  const sent = await targetOwner.send(signed).then(() => true).catch(() => false);
  if (!sent) {
    await logContactEvent(guild, 'error', conversation, [{ name: t('contact.field.detail'), value: t('contact.errors.dmClosed') }]);
    return { ok: false, code: 'dmClosed' };
  }

  const now = new Date().toISOString();
  conversation.messages.push({ from: 'botOwner', authorId: ownerUser.id, authorName: ownerUser.tag, content, at: now });
  conversation.lastActivityAt = now;
  if (!conversation.respondedBy.includes(ownerUser.id)) conversation.respondedBy.push(ownerUser.id);
  if (conversation.status === 'open') conversation.status = 'handled';
  repository.saveConversation(conversation);

  // Synchronisation : tous les AUTRES owners sont informés de la réponse.
  const syncEmbed = infoEmbed(t('contact.sync.title', { id: conversation.id }), null)
    .setColor(COLORS.INFO)
    .addFields(
      { name: t('contact.field.respondedBy'), value: `${ownerUser.tag}`, inline: true },
      { name: t('contact.field.server'), value: `${conversation.guildName}`, inline: true },
      { name: t('contact.field.date'), value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
      { name: t('contact.field.message'), value: content.slice(0, 1024) },
    );
  await sendToOwners(client, syncEmbed, { exceptId: ownerUser.id });

  await logContactEvent(guild, 'responded', conversation, [
    { name: t('contact.field.respondedBy'), value: `${ownerUser.tag}`, inline: true },
  ]);
  webNotifier.publish('contactMessage', {
    conversationId: conversation.id,
    guild: { id: conversation.guildId, name: conversation.guildName },
    from: 'botOwner',
    author: ownerUser.tag,
    preview: content.slice(0, 200),
  });
  return { ok: true };
}

/**
 * Change le statut d'une conversation.
 * @returns {Promise<{ ok: true, conversation } | { ok: false, code: string }>}
 */
async function setStatus(client, conversationId, status, byOwner) {
  const conversation = repository.getConversation(conversationId);
  if (!conversation) return { ok: false, code: 'notFound' };
  if (!(status in contactStatuses)) return { ok: false, code: 'invalidStatus' };

  const previous = conversation.status;
  conversation.status = status;
  conversation.lastActivityAt = new Date().toISOString();
  repository.saveConversation(conversation);

  const guild = client.guilds.cache.get(conversation.guildId) ?? null;
  await logContactEvent(guild, status === 'closed' ? 'closed' : 'status', conversation, [
    { name: t('contact.field.status'), value: `${statusLabel(previous)} → ${statusLabel(status)}`, inline: true },
    { name: t('common.moderator'), value: `${byOwner.tag}`, inline: true },
  ]);
  return { ok: true, conversation };
}

module.exports = {
  SIGNATURE_LINE,
  statusLabel,
  buildOwnerNotificationEmbed,
  buildOwnerReplyText,
  buildOfficialEmbed,
  openConversation,
  messageGuildOwner,
  respond,
  setStatus,
  getConversation: repository.getConversation,
  getAllConversations: repository.getAllConversations,
};
