/**
 * **Messagerie** de l'interface web : owners du bot ↔ propriétaires de serveurs.
 *
 * Ce module est une **façade de lecture + délégation** : l'envoi réel des
 * messages appartient à `services/contact/contactService` (le même service que
 * la commande Discord `contactowner` et `respond`). Rien n'est dupliqué : une
 * réponse envoyée depuis le site et une réponse envoyée depuis Discord suivent
 * exactement le même chemin, et apparaissent toutes deux dans la conversation.
 *
 * Ajoute uniquement ce dont une interface a besoin : liste paginée, recherche,
 * filtres et normalisation des conversations pour l'affichage.
 */
const contactService = require('../contact/contactService');
const contactPositionService = require('../contact/contactPositionService');
const contactStatuses = require('../../utils/constants/contactStatuses');

/** Taille maximale d'une pièce jointe transférée (limite Discord de base). */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Normalise une conversation pour l'affichage (aperçu + compteurs). */
function toSummary(conversation) {
  const messages = conversation.messages ?? [];
  const last = messages[messages.length - 1] ?? null;
  return {
    id: conversation.id,
    guildId: conversation.guildId,
    guildName: conversation.guildName,
    ownerId: conversation.ownerId,
    ownerName: conversation.ownerName,
    // Poste occupé par l'auteur de la demande (propriétaire, administrateur,
    // modérateur) : mis en forme par le service métier, jamais recalculé ici.
    authorPosition: conversation.authorPosition ?? null,
    positionLabel: contactPositionService.format(conversation.authorPosition),
    status: conversation.status,
    statusLabel: contactService.statusLabel(conversation.status),
    initiatedBy: conversation.initiatedBy ?? 'owner',
    createdAt: conversation.createdAt,
    lastActivityAt: conversation.lastActivityAt,
    messageCount: messages.length,
    unreadFromOwner: last?.from === 'owner',
    lastMessage: last ? { from: last.from, author: last.authorName, preview: String(last.title ?? last.content ?? '').slice(0, 160), at: last.at } : null,
  };
}

/** Texte indexé d'une conversation, pour la recherche plein texte. */
function searchableText(conversation) {
  return [
    conversation.id,
    conversation.guildName,
    conversation.ownerName,
    ...(conversation.messages ?? []).map((m) => `${m.title ?? ''} ${m.content ?? ''} ${m.authorName ?? ''}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Liste des conversations : filtres (statut, serveur), recherche et pagination,
 * les plus récemment actives en premier.
 * @returns {{ conversations: object[], total: number, page: number, pages: number, statuses: object }}
 */
function list({ page = 1, pageSize = 20, status, guildId, query } = {}) {
  let conversations = contactService.getAllConversations();
  if (status) conversations = conversations.filter((c) => c.status === status);
  if (guildId) conversations = conversations.filter((c) => c.guildId === guildId);
  if (query) {
    const needle = String(query).toLowerCase();
    conversations = conversations.filter((c) => searchableText(c).includes(needle));
  }
  conversations.sort((a, b) => Date.parse(b.lastActivityAt ?? 0) - Date.parse(a.lastActivityAt ?? 0));

  const size = Math.min(Math.max(1, Number(pageSize) || 20), 100);
  const pages = Math.max(1, Math.ceil(conversations.length / size));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  return {
    conversations: conversations.slice((current - 1) * size, current * size).map(toSummary),
    total: conversations.length,
    page: current,
    pages,
    pageSize: size,
    statuses: contactStatuses,
  };
}

/** Conversation complète (fil de discussion). */
function conversation(id) {
  const found = contactService.getConversation(id);
  if (!found) return null;
  return {
    ...toSummary(found),
    messages: (found.messages ?? []).map((m) => ({
      from: m.from,
      authorId: m.authorId,
      author: m.authorName,
      title: m.title ?? null,
      content: m.content,
      attachment: m.attachment ?? null,
      at: m.at,
    })),
  };
}

/**
 * Décode une pièce jointe transmise en base64 par le formulaire web.
 * @returns {{ ok: true, attachment: { name: string, data: Buffer } | null } | { ok: false, code: string }}
 */
function decodeAttachment(attachment) {
  if (!attachment || !attachment.data) return { ok: true, attachment: null };
  if (typeof attachment.data !== 'string') return { ok: false, code: 'invalidAttachment' };
  let data;
  try {
    data = Buffer.from(attachment.data, 'base64');
  } catch {
    return { ok: false, code: 'invalidAttachment' };
  }
  if (data.length === 0) return { ok: false, code: 'invalidAttachment' };
  if (data.length > MAX_ATTACHMENT_BYTES) return { ok: false, code: 'attachmentTooLarge' };
  // Nom de fichier assaini : pas de chemin, longueur bornée.
  const name = String(attachment.name || 'piece-jointe').split(/[/\\]/).pop().slice(0, 100);
  return { ok: true, attachment: { name, data } };
}

/**
 * Envoie un message au propriétaire d'un serveur (délégué à `contactService`).
 * @param {import('discord.js').Client} client
 * @param {object} author  owner du bot à l'origine de l'envoi (session web)
 * @param {{ guildId: string, title: string, message: string, attachment?: object, conversationId?: string }} body
 */
async function send(client, author, body = {}) {
  const guildId = String(body.guildId ?? '').trim();
  const title = String(body.title ?? '').trim().slice(0, 240);
  const content = String(body.message ?? '').trim().slice(0, 4000);
  if (!guildId) return { ok: false, code: 'missingGuild' };
  if (!title) return { ok: false, code: 'missingTitle' };
  if (!content) return { ok: false, code: 'missingMessage' };

  const decoded = decodeAttachment(body.attachment);
  if (!decoded.ok) return decoded;

  return contactService.messageGuildOwner(client, {
    guildId,
    title,
    content,
    author,
    attachment: decoded.attachment,
    conversationId: body.conversationId ? String(body.conversationId) : null,
  });
}

/** Change le statut d'une conversation (délégué à `contactService`). */
function setStatus(client, conversationId, status, author) {
  return contactService.setStatus(client, conversationId, status, author);
}

/** Compteurs pour les badges de l'interface. */
function summary() {
  const conversations = contactService.getAllConversations();
  const byStatus = {};
  for (const conversation of conversations) byStatus[conversation.status] = (byStatus[conversation.status] ?? 0) + 1;
  return {
    total: conversations.length,
    byStatus,
    awaitingReply: conversations.filter((c) => (c.messages ?? [])[c.messages.length - 1]?.from === 'owner').length,
  };
}

module.exports = { list, conversation, send, setStatus, summary, decodeAttachment, MAX_ATTACHMENT_BYTES };
