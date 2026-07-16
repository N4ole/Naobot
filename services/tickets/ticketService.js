/**
 * Système de tickets multi-serveurs.
 *
 * Toute la logique métier vit ici : panneaux par type, création de salons
 * privés (catégorie « 📁 Tickets » créée/réutilisée automatiquement),
 * compteur persistant par serveur (ticket-n001…), fermeture/réouverture/
 * suppression, gestion des participants, renommage, et logs (catégorie
 * « tickets »).
 *
 * Le module est conçu pour être étendu : les tickets archivés
 * (repository.archiveTicket) sont la base des futurs transcripts ; le
 * schéma des tickets accepte de nouveaux champs (priorité, assignation…) ;
 * ajouter un type = une entrée dans utils/constants/ticketTypes.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const repository = require('../../database/ticketRepository');
const ticketTypes = require('../../utils/constants/ticketTypes');
const logService = require('../logging/logService');
const { infoEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const TICKETS_CATEGORY_NAME = '📁 Tickets';

function isValidType(type) {
  return type in ticketTypes;
}

/** « ticket-n001 », « ticket-n002 »… */
function formatTicketChannelName(number) {
  return `ticket-n${String(number).padStart(3, '0')}`;
}

/** Nettoie un nom de salon saisi par un utilisateur (renommage). */
function sanitizeChannelName(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9à-ÿ_-]/g, '')
    .slice(0, 100);
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

async function logTicketEvent(guild, action, ticket, byUser, extraFields = []) {
  const definition = ticketTypes[ticket.type];
  await logService.log(
    guild,
    'tickets',
    logEventEmbed({
      title: `🎫 ${t(`tickets.logs.${action}`)}`,
      color: {
        created: COLORS.LOG_CREATE,
        closed: COLORS.LOG_UPDATE,
        reopened: COLORS.LOG_CREATE,
        deleted: COLORS.LOG_DELETE,
      }[action] ?? COLORS.LOG_NEUTRAL,
      user: byUser,
      fields: [
        {
          name: t('tickets.logs.ticket'),
          value: `${formatTicketChannelName(ticket.id)} (<#${ticket.channelId}>)`,
          inline: true,
        },
        {
          name: t('tickets.logs.type'),
          value: definition ? `${definition.emoji} ${definition.label}` : ticket.type,
          inline: true,
        },
        ...extraFields,
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// Catégorie et panneaux
// ---------------------------------------------------------------------------

/** Retrouve ou crée la catégorie « 📁 Tickets » (jamais de doublon). */
async function ensureTicketsCategory(guild) {
  const data = repository.getGuildData(guild.id);
  let category = data.categoryId ? guild.channels.cache.get(data.categoryId) : null;
  if (!category || category.type !== ChannelType.GuildCategory) {
    category =
      guild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildCategory && channel.name === TICKETS_CATEGORY_NAME,
      ) ?? null;
  }
  if (!category) {
    category = await guild.channels.create({
      name: TICKETS_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ],
      reason: 'Création de la catégorie des tickets',
    });
  }
  if (data.categoryId !== category.id) {
    data.categoryId = category.id;
    repository.saveGuildData(guild.id, data);
  }
  return category;
}

/** Panneau d'un type de ticket : embed (description, règles, compteur) + bouton. */
function buildPanelPayload(guild, type) {
  const definition = ticketTypes[type];
  const embed = infoEmbed(`${definition.emoji} ${definition.label}`, definition.description).addFields(
    { name: t('tickets.panel.rules'), value: definition.rules },
    {
      name: t('tickets.panel.openCount'),
      value: String(repository.countOpenTickets(guild.id, type)),
      inline: true,
    },
  );
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:open:${type}`)
      .setLabel(t('tickets.panel.openButton'))
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [buttons] };
}

/** Publie (ou republie) le panneau d'un type dans un salon, et le persiste. */
async function setupPanel(guild, channel, type, byUser) {
  const data = repository.getGuildData(guild.id);

  // Supprime l'ancien panneau du même type pour éviter les doublons.
  const previous = data.panels[type];
  if (previous) {
    const previousChannel = guild.channels.cache.get(previous.channelId);
    const previousMessage = await previousChannel?.messages
      .fetch(previous.messageId)
      .catch(() => null);
    await previousMessage?.delete().catch(() => null);
  }

  await ensureTicketsCategory(guild);
  const message = await channel.send(buildPanelPayload(guild, type));
  data.panels[type] = { channelId: channel.id, messageId: message.id };
  repository.saveGuildData(guild.id, data);

  const definition = ticketTypes[type];
  await logService.log(
    guild,
    'tickets',
    logEventEmbed({
      title: `🎫 ${t('tickets.logs.panelConfigured')}`,
      color: COLORS.LOG_CREATE,
      user: byUser,
      fields: [
        { name: t('tickets.logs.type'), value: `${definition.emoji} ${definition.label}`, inline: true },
        { name: t('common.channel'), value: `${channel}`, inline: true },
      ],
    }),
  );
  return message;
}

/** Met à jour le compteur affiché sur le panneau d'un type (best effort). */
async function refreshPanel(guild, type) {
  const panel = repository.getGuildData(guild.id).panels[type];
  if (!panel) return;
  const channel = guild.channels.cache.get(panel.channelId);
  const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
  await message?.edit(buildPanelPayload(guild, type)).catch(() => null);
}

// ---------------------------------------------------------------------------
// Message d'accueil du ticket
// ---------------------------------------------------------------------------

function ticketButtons(closed) {
  if (closed) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:reopen')
          .setLabel(t('tickets.buttons.reopen'))
          .setEmoji('🔓')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('ticket:delete')
          .setLabel(t('tickets.buttons.delete'))
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:close')
        .setLabel(t('tickets.buttons.close'))
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ticket:rename')
        .setLabel(t('tickets.buttons.rename'))
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ticket:delete')
        .setLabel(t('tickets.buttons.delete'))
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:adduser')
        .setLabel(t('tickets.buttons.addUser'))
        .setEmoji('➕')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('ticket:removeuser')
        .setLabel(t('tickets.buttons.removeUser'))
        .setEmoji('➖')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/** Embed d'accueil (reconstruit à la fermeture/réouverture). */
function buildWelcomePayload(ticket) {
  const definition = ticketTypes[ticket.type];
  const closed = ticket.status === 'closed';
  const embed = infoEmbed(
    t('tickets.welcome.title', { number: String(ticket.id).padStart(3, '0') }),
    t('tickets.welcome.instructions'),
  ).addFields(
    {
      name: t('tickets.logs.type'),
      value: definition ? `${definition.emoji} ${definition.label}` : ticket.type,
      inline: true,
    },
    { name: t('tickets.welcome.creator'), value: `<@${ticket.userId}>`, inline: true },
    { name: t('tickets.welcome.ticketId'), value: `\`${formatTicketChannelName(ticket.id)}\``, inline: true },
    {
      name: t('tickets.welcome.openedAt'),
      value: `<t:${Math.floor(Date.parse(ticket.createdAt) / 1000)}:f>`,
      inline: true,
    },
    {
      name: t('tickets.welcome.status'),
      value: closed
        ? t('tickets.welcome.statusClosed', {
            by: ticket.closedBy,
            at: Math.floor(Date.parse(ticket.closedAt) / 1000),
          })
        : t('tickets.welcome.statusOpen'),
      inline: true,
    },
  );
  if (closed) embed.setColor(COLORS.ERROR);
  return { embeds: [embed], components: ticketButtons(closed) };
}

/** Réédite le message d'accueil pour refléter l'état du ticket. */
async function updateWelcomeMessage(guild, channel, ticket) {
  if (!ticket.welcomeMessageId) return;
  const message = await channel.messages.fetch(ticket.welcomeMessageId).catch(() => null);
  await message?.edit(buildWelcomePayload(ticket)).catch(() => null);
}

// ---------------------------------------------------------------------------
// Cycle de vie des tickets
// ---------------------------------------------------------------------------

/** Rôles de modération (Modérer les membres) autorisés à voir les tickets. */
function moderatorRoleOverwrites(guild) {
  return guild.roles.cache
    .filter(
      (role) =>
        !role.managed &&
        role.id !== guild.roles.everyone.id &&
        role.permissions.has(PermissionFlagsBits.ModerateMembers) &&
        !role.permissions.has(PermissionFlagsBits.Administrator),
    )
    .map((role) => ({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    }));
}

/**
 * Crée un ticket : salon privé (créateur + modérateurs + bot), message
 * d'accueil avec boutons, persistance, log, rafraîchissement du panneau.
 * @returns {Promise<{ ok: true, channel, ticket } | { ok: false, code: string, channelId?: string }>}
 */
async function createTicket(guild, member, type) {
  if (!isValidType(type)) return { ok: false, code: 'unknownType' };

  const existing = repository.findOpenTicketByUser(guild.id, member.id, type);
  if (existing) return { ok: false, code: 'alreadyOpen', channelId: existing.channelId };

  const category = await ensureTicketsCategory(guild).catch(() => null);
  if (!category) return { ok: false, code: 'createFailed' };

  const number = repository.nextTicketNumber(guild.id);
  const channel = await guild.channels
    .create({
      name: formatTicketChannelName(number),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
          ],
        },
        ...moderatorRoleOverwrites(guild),
      ],
      reason: `Ticket ${type} ouvert par ${member.user.tag}`,
    })
    .catch(() => null);
  if (!channel) return { ok: false, code: 'createFailed' };

  const ticket = {
    id: number,
    type,
    userId: member.id,
    status: 'open',
    channelId: channel.id,
    createdAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
    participants: [],
    welcomeMessageId: null,
  };
  const welcome = await channel
    .send({ content: `<@${member.id}>`, ...buildWelcomePayload(ticket) })
    .catch(() => null);
  if (welcome) ticket.welcomeMessageId = welcome.id;
  repository.saveTicket(guild.id, channel.id, ticket);

  await logTicketEvent(guild, 'created', ticket, member.user);
  await refreshPanel(guild, type);
  return { ok: true, channel, ticket };
}

/**
 * Ferme un ticket : plus aucun message possible pour le créateur et les
 * participants, embed d'accueil mis à jour (fermé par X, date), log.
 */
async function closeTicket(guild, channel, byUser) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  if (ticket.status === 'closed') return { ok: false, code: 'alreadyClosed' };

  for (const userId of [ticket.userId, ...ticket.participants]) {
    await channel.permissionOverwrites.edit(userId, { SendMessages: false }).catch(() => null);
  }
  ticket.status = 'closed';
  ticket.closedAt = new Date().toISOString();
  ticket.closedBy = byUser.id;
  repository.saveTicket(guild.id, channel.id, ticket);

  await updateWelcomeMessage(guild, channel, ticket);
  await logTicketEvent(guild, 'closed', ticket, byUser);
  await refreshPanel(guild, ticket.type);
  return { ok: true, ticket };
}

/** Réouvre un ticket fermé : parole rendue, embed d'accueil restauré, log. */
async function reopenTicket(guild, channel, byUser) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  if (ticket.status !== 'closed') return { ok: false, code: 'notClosed' };

  for (const userId of [ticket.userId, ...ticket.participants]) {
    await channel.permissionOverwrites.edit(userId, { SendMessages: true }).catch(() => null);
  }
  ticket.status = 'open';
  ticket.closedAt = null;
  ticket.closedBy = null;
  repository.saveTicket(guild.id, channel.id, ticket);

  await updateWelcomeMessage(guild, channel, ticket);
  await logTicketEvent(guild, 'reopened', ticket, byUser);
  await refreshPanel(guild, ticket.type);
  return { ok: true, ticket };
}

/**
 * Supprime définitivement un ticket : les informations importantes sont
 * archivées (base des futurs transcripts), puis le salon est supprimé.
 * La confirmation préalable est gérée côté commande/composants.
 */
async function deleteTicket(guild, channel, byUser) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };

  repository.archiveTicket(guild.id, channel.id, {
    deletedAt: new Date().toISOString(),
    deletedBy: byUser.id,
  });
  await logTicketEvent(guild, 'deleted', ticket, byUser);
  await refreshPanel(guild, ticket.type);
  await channel.delete(`Ticket supprimé par ${byUser.tag}`).catch(() => null);
  return { ok: true, ticket };
}

/** Renomme le salon d'un ticket (nom nettoyé), avec log ancien → nouveau. */
async function renameTicket(guild, channel, rawName, byUser) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };

  const name = sanitizeChannelName(rawName);
  if (!name) return { ok: false, code: 'invalidName' };

  const oldName = channel.name;
  const renamed = await channel
    .setName(name, `Ticket renommé par ${byUser.tag}`)
    .then(() => true)
    .catch(() => false);
  if (!renamed) return { ok: false, code: 'actionFailed' };

  await logTicketEvent(guild, 'renamed', ticket, byUser, [
    { name: t('logs.events.name'), value: `\`${oldName}\` → \`${name}\`` },
  ]);
  return { ok: true, oldName, newName: name };
}

/** Ajoute un utilisateur au ticket (accès complet tant qu'il est ouvert). */
async function addUserToTicket(guild, channel, user, byUser) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  if (user.id === ticket.userId || ticket.participants.includes(user.id)) {
    return { ok: false, code: 'alreadyParticipant' };
  }

  const added = await channel.permissionOverwrites
    .edit(user.id, {
      ViewChannel: true,
      SendMessages: ticket.status === 'open',
      ReadMessageHistory: true,
    })
    .then(() => true)
    .catch(() => false);
  if (!added) return { ok: false, code: 'actionFailed' };

  ticket.participants = [...ticket.participants, user.id];
  repository.saveTicket(guild.id, channel.id, ticket);
  await logTicketEvent(guild, 'userAdded', ticket, byUser, [
    { name: t('common.member'), value: `${user.tag} (\`${user.id}\`)`, inline: true },
  ]);
  return { ok: true };
}

/** Retire un utilisateur ajouté (le créateur ne peut pas être retiré). */
async function removeUserFromTicket(guild, channel, user, byUser) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  if (!ticket.participants.includes(user.id)) return { ok: false, code: 'notParticipant' };

  await channel.permissionOverwrites.delete(user.id).catch(() => null);
  ticket.participants = ticket.participants.filter((id) => id !== user.id);
  repository.saveTicket(guild.id, channel.id, ticket);
  await logTicketEvent(guild, 'userRemoved', ticket, byUser, [
    { name: t('common.member'), value: `${user.tag} (\`${user.id}\`)`, inline: true },
  ]);
  return { ok: true };
}

module.exports = {
  TICKETS_CATEGORY_NAME,
  isValidType,
  formatTicketChannelName,
  sanitizeChannelName,
  buildPanelPayload,
  buildWelcomePayload,
  setupPanel,
  refreshPanel,
  createTicket,
  closeTicket,
  reopenTicket,
  deleteTicket,
  renameTicket,
  addUserToTicket,
  removeUserFromTicket,
};
