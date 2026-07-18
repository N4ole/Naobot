/**
 * Système de tickets avancé : cycle de vie complet d'un ticket rattaché à une
 * catégorie personnalisable (services/ticketCategories) et publié via des
 * panneaux (services/ticketPanels).
 *
 * Responsabilités : création du salon (catégorie Discord + format + accès +
 * message d'accueil + notifications), fermeture/réouverture, renommage,
 * suppression (avec transcript), ajout/retrait de membres, transfert de
 * catégorie, assignation (claim/unclaim), planificateur (fermeture et
 * suppression automatiques), statistiques et logs.
 *
 * Modulaire et extensible : le schéma des tickets accepte de nouveaux champs
 * (SLA, priorités, tags…) sans refonte des appelants.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const repository = require('../../database/ticketRepository');
const categoryRepository = require('../../database/ticketCategoryRepository');
const transcriptService = require('./transcriptService');
const logService = require('../logs/logService');
const { infoEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const ticketVariables = require('../../utils/constants/ticketVariables');
const { t } = require('../../utils/helpers/i18n');

const LOG_COLORS = {
  created: COLORS.LOG_CREATE,
  closed: COLORS.LOG_UPDATE,
  reopened: COLORS.LOG_CREATE,
  deleted: COLORS.LOG_DELETE,
  renamed: COLORS.LOG_NEUTRAL,
  assigned: COLORS.INFO,
  unassigned: COLORS.LOG_NEUTRAL,
  moved: COLORS.LOG_UPDATE,
  userAdded: COLORS.LOG_NEUTRAL,
  userRemoved: COLORS.LOG_NEUTRAL,
};

// ---------------------------------------------------------------------------
// Logs (catégorie globale « tickets » + salon de logs propre à la catégorie)
// ---------------------------------------------------------------------------

async function deliverLog(guild, category, action, ticket, byUser, extraFields = []) {
  const embed = logEventEmbed({
    title: `🎫 ${t(`tickets.logs.${action}`)}`,
    color: LOG_COLORS[action] ?? COLORS.LOG_NEUTRAL,
    user: byUser,
    fields: [
      { name: t('tickets.logs.ticket'), value: `\`${ticket.channelName}\` (<#${ticket.channelId}>)`, inline: true },
      { name: t('tickets.logs.category'), value: category ? `${category.emoji ?? '🎫'} ${category.name}` : ticket.categoryId, inline: true },
      ...extraFields,
    ],
  });
  await logService.log(guild, 'tickets', embed);
  // Salon de logs dédié à la catégorie, s'il est configuré.
  if (category?.logChannelId) {
    const channel = guild.channels.cache.get(category.logChannelId);
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] }).catch(() => null);
  }
}

// ---------------------------------------------------------------------------
// Message d'accueil
// ---------------------------------------------------------------------------

function ticketButtons(ticket) {
  if (ticket.status === 'closed') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:reopen').setLabel(t('tickets.buttons.reopen')).setEmoji('🔓').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket:delete').setLabel(t('tickets.buttons.delete')).setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:close').setLabel(t('tickets.buttons.close')).setEmoji('🔒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket:claim').setLabel(t('tickets.buttons.claim')).setEmoji('🙋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket:rename').setLabel(t('tickets.buttons.rename')).setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket:delete').setLabel(t('tickets.buttons.delete')).setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:adduser').setLabel(t('tickets.buttons.addUser')).setEmoji('➕').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket:removeuser').setLabel(t('tickets.buttons.removeUser')).setEmoji('➖').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildWelcomePayload(ticket, category) {
  const closed = ticket.status === 'closed';
  const instructions = category?.welcomeMessage
    ? ticketVariables.renderMessage(category.welcomeMessage, {
        user: { id: ticket.userId, username: ticket.creatorTag ?? ticket.userId },
        category,
        ticketId: ticket.channelName,
        date: Date.parse(ticket.createdAt),
      })
    : t('tickets.welcome.instructions');

  const embed = infoEmbed(t('tickets.welcome.title', { name: ticket.channelName }), instructions).addFields(
    { name: t('tickets.logs.category'), value: category ? `${category.emoji ?? '🎫'} ${category.name}` : ticket.categoryId, inline: true },
    { name: t('tickets.welcome.creator'), value: `<@${ticket.userId}>`, inline: true },
    { name: t('tickets.welcome.status'), value: closed ? t('tickets.welcome.statusClosed', { by: ticket.closedBy, at: Math.floor(Date.parse(ticket.closedAt) / 1000) }) : t('tickets.welcome.statusOpen'), inline: true },
  );
  if (ticket.subject) embed.addFields({ name: t('tickets.welcome.subject'), value: ticket.subject.slice(0, 1024) });
  embed.addFields({ name: t('tickets.welcome.assignee'), value: ticket.assignedTo ? `<@${ticket.assignedTo}>` : t('tickets.welcome.unassigned'), inline: true });
  if (category?.color != null) embed.setColor(category.color);
  if (closed) embed.setColor(COLORS.ERROR);
  return { embeds: [embed], components: ticketButtons(ticket) };
}

async function updateWelcomeMessage(guild, channel, ticket, category) {
  if (!ticket.welcomeMessageId) return;
  const message = await channel.messages.fetch(ticket.welcomeMessageId).catch(() => null);
  await message?.edit(buildWelcomePayload(ticket, category)).catch(() => null);
}

/** Embed d'information (lecture seule) sur un ticket (commande ticketinfo). */
function buildInfoEmbed(ticket, category) {
  const embed = infoEmbed(t('tickets.info.title', { name: ticket.channelName }), null).addFields(
    { name: t('tickets.logs.category'), value: category ? `${category.emoji ?? '🎫'} ${category.name}` : ticket.categoryId, inline: true },
    { name: t('tickets.welcome.creator'), value: `<@${ticket.userId}>`, inline: true },
    { name: t('tickets.welcome.assignee'), value: ticket.assignedTo ? `<@${ticket.assignedTo}>` : t('tickets.welcome.unassigned'), inline: true },
    { name: t('tickets.welcome.status'), value: ticket.status === 'closed' ? t('tickets.welcome.statusClosed', { by: ticket.closedBy, at: Math.floor(Date.parse(ticket.closedAt) / 1000) }) : t('tickets.welcome.statusOpen'), inline: true },
    { name: t('tickets.welcome.openedAt'), value: `<t:${Math.floor(Date.parse(ticket.createdAt) / 1000)}:f>`, inline: true },
    { name: t('tickets.info.participants'), value: ticket.participants.length ? ticket.participants.map((id) => `<@${id}>`).join(', ') : t('help.none'), inline: true },
  );
  if (ticket.subject) embed.addFields({ name: t('tickets.welcome.subject'), value: ticket.subject.slice(0, 1024) });
  if (category?.color != null) embed.setColor(category.color);
  return embed;
}

// ---------------------------------------------------------------------------
// Permissions du salon
// ---------------------------------------------------------------------------

function ticketOverwrites(guild, member, category) {
  const staffAllow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles];
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: staffAllow },
    {
      id: guild.members.me.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages],
    },
  ];
  // Staff : rôles d'accès + rôles à notifier (union), afin qu'ils puissent agir.
  const staffRoles = new Set([...(category.accessRoleIds ?? []), ...(category.pingRoleIds ?? [])]);
  for (const roleId of staffRoles) {
    if (guild.roles.cache.has(roleId)) overwrites.push({ id: roleId, allow: staffAllow });
  }
  for (const userId of category.pingUserIds ?? []) {
    if (userId !== member.id) overwrites.push({ id: userId, allow: staffAllow });
  }
  return overwrites;
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

/**
 * Crée un ticket dans une catégorie donnée.
 * @returns {Promise<{ ok: true, channel, ticket } | { ok: false, code, ... }>}
 */
async function createTicket(guild, member, category, { subject = null } = {}) {
  // Limite de tickets ouverts par membre.
  if (category.maxOpen > 0) {
    const open = repository.openByUser(guild.id, member.id, category.id);
    if (open.length >= category.maxOpen) {
      return { ok: false, code: 'limitReached', channelId: open[0].channelId, max: category.maxOpen };
    }
  }
  // Délai entre deux tickets.
  if (category.cooldownMs > 0) {
    const last = repository.lastCreatedAt(guild.id, member.id, category.id);
    if (last && Date.now() - last < category.cooldownMs) {
      return { ok: false, code: 'cooldown', retryAt: last + category.cooldownMs };
    }
  }

  const number = categoryRepository.nextNumber(guild.id, category.id);
  const channelName = ticketVariables.renderChannelName(category.channelFormat, { counter: number, category, user: member.user, date: Date.now() });
  const parent = category.discordCategoryId && guild.channels.cache.get(category.discordCategoryId)?.type === ChannelType.GuildCategory ? category.discordCategoryId : undefined;

  const channel = await guild.channels
    .create({
      name: channelName,
      type: ChannelType.GuildText,
      parent,
      permissionOverwrites: ticketOverwrites(guild, member, category),
      reason: `Ticket ${category.name} ouvert par ${member.user.tag}`,
    })
    .catch(() => null);
  if (!channel) return { ok: false, code: 'createFailed' };

  const now = new Date().toISOString();
  const ticket = {
    id: number,
    categoryId: category.id,
    guildId: guild.id,
    channelId: channel.id,
    channelName: channel.name,
    userId: member.id,
    creatorTag: member.user.tag,
    subject,
    status: 'open',
    assignedTo: null,
    participants: [],
    createdAt: now,
    closedAt: null,
    closedBy: null,
    lastActivityAt: now,
    welcomeMessageId: null,
  };

  const mentions = [`<@${member.id}>`, ...(category.pingRoleIds ?? []).map((id) => `<@&${id}>`), ...(category.pingUserIds ?? []).map((id) => `<@${id}>`)];
  const welcome = await channel.send({ content: mentions.join(' '), ...buildWelcomePayload(ticket, category) }).catch(() => null);
  if (welcome) ticket.welcomeMessageId = welcome.id;

  repository.saveTicket(ticket);
  repository.recordCreated(guild.id, category.id);
  await deliverLog(guild, category, 'created', ticket, member.user);
  return { ok: true, channel, ticket };
}

// ---------------------------------------------------------------------------
// Cycle de vie
// ---------------------------------------------------------------------------

function categoryOf(ticket) {
  return categoryRepository.getCategory(ticket.guildId, ticket.categoryId);
}

async function closeTicket(guild, channel, byUser, { system = false } = {}) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  if (ticket.status === 'closed') return { ok: false, code: 'alreadyClosed' };

  for (const userId of [ticket.userId, ...ticket.participants]) {
    await channel.permissionOverwrites.edit(userId, { SendMessages: false }).catch(() => null);
  }
  ticket.status = 'closed';
  ticket.closedAt = new Date().toISOString();
  ticket.closedBy = system ? guild.members.me.id : byUser.id;
  repository.saveTicket(ticket);

  const category = categoryOf(ticket);
  repository.recordClosed(guild.id, ticket.categoryId, Date.parse(ticket.closedAt) - Date.parse(ticket.createdAt), ticket.closedBy);
  await updateWelcomeMessage(guild, channel, ticket, category);
  await deliverLog(guild, category, 'closed', ticket, system ? guild.members.me.user : byUser, system ? [{ name: t('tickets.logs.reason'), value: t('tickets.logs.autoClose'), inline: true }] : []);
  return { ok: true, ticket };
}

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
  ticket.lastActivityAt = new Date().toISOString();
  repository.saveTicket(ticket);

  const category = categoryOf(ticket);
  await updateWelcomeMessage(guild, channel, ticket, category);
  await deliverLog(guild, category, 'reopened', ticket, byUser);
  return { ok: true, ticket };
}

/** Supprime le ticket : transcript (si archivage), archive puis suppression. */
async function deleteTicket(guild, channel, byUser, { system = false } = {}) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  const category = categoryOf(ticket);

  let transcript = { count: 0, attachments: [] };
  if (category?.archive) {
    const header = { channelName: ticket.channelName, categoryName: category?.name ?? ticket.categoryId, creatorTag: ticket.creatorTag ?? ticket.userId };
    transcript = await transcriptService.generate(channel, ticket, header).catch(() => ({ count: 0, attachments: [] }));
  }

  repository.archiveTicket(guild.id, channel.id, {
    deletedAt: new Date().toISOString(),
    deletedBy: system ? guild.members.me.id : byUser.id,
    transcriptMessages: transcript.count,
  });
  await deliverLog(
    guild,
    category,
    'deleted',
    ticket,
    system ? guild.members.me.user : byUser,
    transcript.count ? [{ name: t('tickets.logs.transcript'), value: t('tickets.logs.transcriptValue', { count: transcript.count }), inline: true }] : [],
  );
  // Joint le transcript au salon de logs (ou au salon global des tickets).
  if (transcript.attachments.length) {
    const logChannel = category?.logChannelId ? guild.channels.cache.get(category.logChannelId) : null;
    await logChannel?.send({ content: t('tickets.logs.transcriptFor', { name: ticket.channelName }), files: transcript.attachments }).catch(() => null);
  }
  await channel.delete(`Ticket supprimé par ${system ? 'le système' : byUser.tag}`).catch(() => null);
  return { ok: true, ticket, transcript };
}

async function renameTicket(guild, channel, rawName, byUser) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  const name = ticketVariables.renderChannelName(rawName, { counter: ticket.id, category: categoryOf(ticket), user: { id: ticket.userId, username: ticket.creatorTag ?? '' } });
  if (!name) return { ok: false, code: 'invalidName' };

  const oldName = channel.name;
  const renamed = await channel.setName(name, `Ticket renommé par ${byUser.tag}`).then(() => true).catch(() => false);
  if (!renamed) return { ok: false, code: 'actionFailed' };
  ticket.channelName = name;
  repository.saveTicket(ticket);
  await deliverLog(guild, categoryOf(ticket), 'renamed', ticket, byUser, [{ name: t('logs.events.name'), value: `\`${oldName}\` → \`${name}\`` }]);
  return { ok: true, oldName, newName: name };
}

async function addUserToTicket(guild, channel, user, byUser) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  if (user.id === ticket.userId || ticket.participants.includes(user.id)) return { ok: false, code: 'alreadyParticipant' };

  const added = await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: ticket.status === 'open', ReadMessageHistory: true }).then(() => true).catch(() => false);
  if (!added) return { ok: false, code: 'actionFailed' };
  ticket.participants = [...ticket.participants, user.id];
  repository.saveTicket(ticket);
  await deliverLog(guild, categoryOf(ticket), 'userAdded', ticket, byUser, [{ name: t('common.member'), value: `${user.tag}`, inline: true }]);
  return { ok: true };
}

async function removeUserFromTicket(guild, channel, user, byUser) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  if (!ticket.participants.includes(user.id)) return { ok: false, code: 'notParticipant' };

  await channel.permissionOverwrites.delete(user.id).catch(() => null);
  ticket.participants = ticket.participants.filter((id) => id !== user.id);
  repository.saveTicket(ticket);
  await deliverLog(guild, categoryOf(ticket), 'userRemoved', ticket, byUser, [{ name: t('common.member'), value: `${user.tag}`, inline: true }]);
  return { ok: true };
}

/** Transfère un ticket vers une autre catégorie (salon déplacé + renuméroté). */
async function moveTicket(guild, channel, targetCategory, byUser) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  if (ticket.categoryId === targetCategory.id) return { ok: false, code: 'sameCategory' };

  const number = categoryRepository.nextNumber(guild.id, targetCategory.id);
  const name = ticketVariables.renderChannelName(targetCategory.channelFormat, { counter: number, category: targetCategory, user: { id: ticket.userId, username: ticket.creatorTag ?? '' }, date: Date.now() });
  const parent = targetCategory.discordCategoryId && guild.channels.cache.get(targetCategory.discordCategoryId)?.type === ChannelType.GuildCategory ? targetCategory.discordCategoryId : null;

  await channel.edit({ name, parent, reason: `Ticket transféré par ${byUser.tag}` }).catch(() => null);
  // Ajoute les accès du staff de la catégorie cible.
  for (const roleId of new Set([...(targetCategory.accessRoleIds ?? []), ...(targetCategory.pingRoleIds ?? [])])) {
    if (guild.roles.cache.has(roleId)) await channel.permissionOverwrites.edit(roleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => null);
  }
  const fromCategory = categoryOf(ticket);
  ticket.categoryId = targetCategory.id;
  ticket.id = number;
  ticket.channelName = name;
  repository.saveTicket(ticket);
  await updateWelcomeMessage(guild, channel, ticket, targetCategory);
  await deliverLog(guild, targetCategory, 'moved', ticket, byUser, [
    { name: t('tickets.logs.from'), value: fromCategory ? fromCategory.name : ticket.categoryId, inline: true },
    { name: t('tickets.logs.to'), value: targetCategory.name, inline: true },
  ]);
  return { ok: true, ticket };
}

async function claimTicket(guild, channel, moderator) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  if (ticket.assignedTo === moderator.id) return { ok: false, code: 'alreadyClaimedSelf' };
  if (ticket.assignedTo) return { ok: false, code: 'alreadyClaimed', by: ticket.assignedTo };

  ticket.assignedTo = moderator.id;
  repository.saveTicket(ticket);
  await channel.permissionOverwrites.edit(moderator.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => null);
  const category = categoryOf(ticket);
  await updateWelcomeMessage(guild, channel, ticket, category);
  await deliverLog(guild, category, 'assigned', ticket, moderator, [{ name: t('tickets.logs.assignee'), value: `${moderator}`, inline: true }]);
  return { ok: true, ticket };
}

async function unclaimTicket(guild, channel, moderator) {
  const ticket = repository.getTicket(guild.id, channel.id);
  if (!ticket) return { ok: false, code: 'notTicket' };
  if (!ticket.assignedTo) return { ok: false, code: 'notClaimed' };

  const previous = ticket.assignedTo;
  ticket.assignedTo = null;
  repository.saveTicket(ticket);
  const category = categoryOf(ticket);
  await updateWelcomeMessage(guild, channel, ticket, category);
  await deliverLog(guild, category, 'unassigned', ticket, moderator, [{ name: t('tickets.logs.previousAssignee'), value: `<@${previous}>`, inline: true }]);
  return { ok: true, ticket };
}

/** Met à jour l'horodatage d'activité (pour la fermeture automatique). */
function touchActivity(guildId, channelId) {
  const ticket = repository.getTicket(guildId, channelId);
  if (!ticket || ticket.status !== 'open') return;
  ticket.lastActivityAt = new Date().toISOString();
  repository.saveTicket(ticket);
}

// ---------------------------------------------------------------------------
// Planificateur : fermeture / suppression automatiques
// ---------------------------------------------------------------------------

async function sweep(client) {
  const now = Date.now();
  for (const flat of repository.allTickets()) {
    const guild = client.guilds.cache.get(flat.guildId);
    if (!guild) continue;
    const category = categoryRepository.getCategory(flat.guildId, flat.categoryId);
    if (!category) continue;
    const channel = guild.channels.cache.get(flat.channelId);

    if (flat.status === 'open' && category.autoCloseHours > 0) {
      const idle = now - (Date.parse(flat.lastActivityAt) || Date.parse(flat.createdAt));
      if (channel && idle >= category.autoCloseHours * 3600 * 1000) {
        await closeTicket(guild, channel, null, { system: true }).catch(() => null);
        continue;
      }
    }
    if (flat.status === 'closed' && category.autoDeleteHours > 0) {
      const since = now - (Date.parse(flat.closedAt) || now);
      if (since >= category.autoDeleteHours * 3600 * 1000) {
        if (channel) await deleteTicket(guild, channel, null, { system: true }).catch(() => null);
        else repository.archiveTicket(flat.guildId, flat.channelId, { deletedAt: new Date().toISOString(), deletedBy: guild.members.me.id });
      }
    }
  }
}

function startScheduler(client) {
  sweep(client).catch(() => null);
  const timer = setInterval(() => sweep(client).catch(() => null), 60 * 1000);
  timer.unref?.();
  return timer;
}

module.exports = {
  buildWelcomePayload,
  buildInfoEmbed,
  createTicket,
  closeTicket,
  reopenTicket,
  deleteTicket,
  renameTicket,
  addUserToTicket,
  removeUserFromTicket,
  moveTicket,
  claimTicket,
  unclaimTicket,
  touchActivity,
  sweep,
  startScheduler,
  deliverLog,
  categoryOf,
};
