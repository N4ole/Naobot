/**
 * Système de surveillance de modération.
 *
 * ⚠️ Cadre d'usage : cette fonctionnalité est un outil de modération. Elle
 * est réservée aux administrateurs / modérateurs / owners, strictement
 * limitée à 7 jours (arrêt automatique), et doit être annoncée aux membres
 * conformément au RGPD, aux règles de Discord et aux lois locales. Un
 * avertissement explicite est affiché avant toute activation
 * (buildWarningEmbed) et journalisé.
 *
 * La collecte se fait dans un salon privé dédié par utilisateur surveillé
 * (jamais visible du surveillé), sous une catégorie « 📁 Surveillance ».
 * Toute la logique vit ici ; les événements Discord délèguent à
 * recordMessage / recordEdit / recordDelete / recordVoice.
 *
 * Extensible : export d'historique, statistiques avancées, tableaux de
 * bord et durée paramétrable pourront s'ajouter sans toucher aux appelants
 * (persistance isolée dans database/watchRepository, durée dans WATCH_DURATION_MS).
 */
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const repository = require('../../database/watchRepository');
const logService = require('../logging/logService');
const { infoEmbed, errorEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

/** Durée maximale d'une surveillance (arrêt automatique). */
const WATCH_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const CATEGORY_NAME = '📁 Surveillance';

// ---------------------------------------------------------------------------
// Avertissement légal
// ---------------------------------------------------------------------------

/** Embed d'avertissement affiché avant toute activation. */
function buildWarningEmbed(targetTag) {
  return infoEmbed(t('watch.warning.title'), t('watch.warning.body', { user: targetTag }))
    .setColor(COLORS.WARNING)
    .addFields(
      { name: t('watch.warning.purposeName'), value: t('watch.warning.purpose') },
      { name: t('watch.warning.abuseName'), value: t('watch.warning.abuse') },
      { name: t('watch.warning.durationName'), value: t('watch.warning.duration') },
      { name: t('watch.warning.responsibilityName'), value: t('watch.warning.responsibility') },
    );
}

// ---------------------------------------------------------------------------
// Logs de la catégorie « surveillance »
// ---------------------------------------------------------------------------

async function logWatchEvent(guild, action, targetId, byUser, extraFields = []) {
  await logService.log(
    guild,
    'surveillance',
    logEventEmbed({
      title: `👁️ ${t(`watch.logs.${action}`)}`,
      color: {
        started: COLORS.LOG_CREATE,
        resumed: COLORS.LOG_CREATE,
        stopped: COLORS.LOG_UPDATE,
        expired: COLORS.LOG_DELETE,
        error: COLORS.ERROR,
      }[action] ?? COLORS.LOG_NEUTRAL,
      user: byUser ?? null,
      fields: [
        { name: t('watch.logs.target'), value: `<@${targetId}> (\`${targetId}\`)`, inline: true },
        ...extraFields,
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// Catégorie et salon dédiés
// ---------------------------------------------------------------------------

/** Rôles autorisés (Administrateur ou Modérer les membres) → accès au salon. */
function authorizedRoleOverwrites(guild) {
  return guild.roles.cache
    .filter(
      (role) =>
        role.id !== guild.roles.everyone.id &&
        !role.managed &&
        role.permissions.any([PermissionFlagsBits.Administrator, PermissionFlagsBits.ModerateMembers]),
    )
    .map((role) => ({
      id: role.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
    }));
}

/** Retrouve ou crée la catégorie « 📁 Surveillance » (privée, jamais de doublon). */
async function ensureCategory(guild) {
  const data = repository.getGuild(guild.id);
  let category = data.categoryId ? guild.channels.cache.get(data.categoryId) : null;
  if (!category || category.type !== ChannelType.GuildCategory) {
    category =
      guild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildCategory && channel.name === CATEGORY_NAME,
      ) ?? null;
  }
  if (!category) {
    category = await guild.channels.create({
      name: CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }],
      reason: 'Création de la catégorie de surveillance',
    });
  }
  if (data.categoryId !== category.id) repository.setCategory(guild.id, category.id);
  return category;
}

/** Nom de salon à partir du membre surveillé : « surveillance-johndoe ». */
function channelNameFor(member) {
  const base = (member.user?.username ?? String(member.id))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 80);
  return `surveillance-${base || member.id}`;
}

/**
 * Retrouve ou crée le salon privé de surveillance d'un membre.
 * Le membre surveillé n'y a jamais accès.
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function ensureWatchChannel(guild, targetMember, existingChannelId) {
  if (existingChannelId) {
    const channel = guild.channels.cache.get(existingChannelId);
    if (channel) return channel;
  }
  const category = await ensureCategory(guild).catch(() => null);
  if (!category) return null;

  return guild.channels
    .create({
      name: channelNameFor(targetMember),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        // Le membre surveillé ne doit jamais voir le salon.
        { id: targetMember.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        ...authorizedRoleOverwrites(guild),
      ],
      reason: `Surveillance de modération : ${targetMember.user.tag}`,
    })
    .catch(() => null);
}

// ---------------------------------------------------------------------------
// Démarrage / reprise / arrêt / expiration
// ---------------------------------------------------------------------------

/**
 * Démarre (ou reprend) une surveillance. Réutilise le salon existant le cas
 * échéant et envoie « Surveillance reprise ».
 * @returns {Promise<{ ok: true, channel, resumed: boolean, expiresAt: number }
 *   | { ok: false, code: string }>}
 */
async function startWatch(guild, targetMember, byUser) {
  const existing = repository.getWatch(guild.id, targetMember.id);
  const channel = await ensureWatchChannel(guild, targetMember, existing?.channelId);
  if (!channel) {
    await logWatchEvent(guild, 'error', targetMember.id, byUser, [
      { name: t('watch.logs.detail'), value: t('watch.errors.channelFailed') },
    ]);
    return { ok: false, code: 'channelFailed' };
  }

  const now = Date.now();
  const expiresAt = now + WATCH_DURATION_MS;
  const resumed = Boolean(existing);
  const watch = {
    channelId: channel.id,
    active: true,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    startedBy: byUser.id,
    watchCount: (existing?.watchCount ?? 0) + 1,
    totalDurationMs: existing?.totalDurationMs ?? 0,
    lastWatchAt: new Date(now).toISOString(),
  };
  repository.saveWatch(guild.id, targetMember.id, watch);

  // Statistiques serveur (classements owners).
  const stats = repository.getGuildStats(guild.id);
  stats.watchCount += 1;
  stats.lastUsedAt = new Date(now).toISOString();
  repository.saveGuildStats(guild.id, stats);

  const startEmbed = infoEmbed(
    t(resumed ? 'watch.channel.resumedTitle' : 'watch.channel.startedTitle'),
    t('watch.channel.started', {
      user: `${targetMember}`,
      by: `${byUser}`,
      expires: `<t:${Math.floor(expiresAt / 1000)}:R>`,
    }),
  ).setColor(resumed ? COLORS.INFO : COLORS.WARNING);
  await channel.send({ embeds: [startEmbed] }).catch(() => null);
  if (resumed) {
    await channel.send({ embeds: [infoEmbed(null, t('watch.channel.resumed'))] }).catch(() => null);
  }

  await logWatchEvent(guild, resumed ? 'resumed' : 'started', targetMember.id, byUser, [
    { name: t('watch.logs.channel'), value: `${channel}`, inline: true },
    { name: t('watch.logs.expiresAt'), value: `<t:${Math.floor(expiresAt / 1000)}:f>`, inline: true },
  ]);
  return { ok: true, channel, resumed, expiresAt };
}

/** Termine une surveillance (arrêt manuel ou expiration), en conservant tout. */
async function finishWatch(guild, userId, reason, byUser = null) {
  const watch = repository.getWatch(guild.id, userId);
  if (!watch || !watch.active) return { ok: false, code: 'notWatched' };

  const durationMs = Date.now() - Date.parse(watch.startedAt);
  watch.active = false;
  watch.totalDurationMs = (watch.totalDurationMs ?? 0) + durationMs;
  watch.endedAt = new Date().toISOString();
  repository.saveWatch(guild.id, userId, watch);

  const stats = repository.getGuildStats(guild.id);
  stats.totalDurationMs = (stats.totalDurationMs ?? 0) + durationMs;
  repository.saveGuildStats(guild.id, stats);

  const channel = guild.channels.cache.get(watch.channelId);
  if (channel) {
    const embed =
      reason === 'expired'
        ? infoEmbed(t('watch.channel.expiredTitle'), t('watch.channel.expired')).setColor(COLORS.LOG_DELETE)
        : infoEmbed(t('watch.channel.stoppedTitle'), t('watch.channel.stopped', { by: byUser ? `${byUser}` : t('watch.channel.system') })).setColor(COLORS.LOG_UPDATE);
    await channel.send({ embeds: [embed] }).catch(() => null);
  }

  await logWatchEvent(guild, reason === 'expired' ? 'expired' : 'stopped', userId, byUser, [
    { name: t('watch.logs.duration'), value: formatDuration(durationMs), inline: true },
  ]);
  return { ok: true, durationMs };
}

// ---------------------------------------------------------------------------
// Expiration automatique
// ---------------------------------------------------------------------------

/** Termine toutes les surveillances dont la durée maximale est atteinte. */
async function sweepExpiredWatches(client) {
  for (const { guildId, userId, watch } of repository.getAllActiveWatches()) {
    if (Date.parse(watch.expiresAt) > Date.now()) continue;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    await finishWatch(guild, userId, 'expired').catch(() => null);
  }
}

/** Démarre la surveillance périodique des expirations (appelée au ready). */
function startExpirySweeper(client) {
  sweepExpiredWatches(client).catch(() => null);
  const timer = setInterval(() => sweepExpiredWatches(client).catch(() => null), 5 * 60 * 1000);
  timer.unref?.();
  return timer;
}

// ---------------------------------------------------------------------------
// Collecte des événements (délégué par les écouteurs Discord)
// ---------------------------------------------------------------------------

/** Salon de surveillance actif d'un utilisateur, ou null (avec purge lazy des expirées). */
function activeChannel(guild, userId) {
  const watch = repository.getWatch(guild.id, userId);
  if (!watch?.active) return null;
  if (Date.parse(watch.expiresAt) <= Date.now()) {
    finishWatch(guild, userId, 'expired').catch(() => null);
    return null;
  }
  return guild.channels.cache.get(watch.channelId) ?? null;
}

async function recordMessage(message) {
  if (!message.guild || message.author?.bot) return;
  const channel = activeChannel(message.guild, message.author.id);
  if (!channel || channel.id === message.channel.id) return;

  const fields = [
    { name: t('watch.event.channel'), value: `${message.channel}`, inline: true },
    { name: t('watch.event.time'), value: `<t:${Math.floor(message.createdTimestamp / 1000)}:T>`, inline: true },
    { name: t('watch.event.link'), value: `[${t('watch.event.jump')}](${message.url})`, inline: true },
  ];
  if (message.reference?.messageId) {
    fields.push({ name: t('watch.event.replyTo'), value: `[${t('watch.event.jump')}](https://discord.com/channels/${message.guild.id}/${message.channelId}/${message.reference.messageId})`, inline: true });
  }
  const mentions = message.mentions?.users?.map((user) => `${user}`).join(', ');
  if (mentions) fields.push({ name: t('watch.event.mentions'), value: mentions.slice(0, 1024) });
  if (message.attachments?.size > 0) {
    fields.push({
      name: t('watch.event.attachments'),
      value: message.attachments.map((attachment) => `[${attachment.name}](${attachment.url})`).join('\n').slice(0, 1024),
    });
  }

  const embed = logEventEmbed({
    title: `💬 ${t('watch.event.message')}`,
    color: COLORS.LOG_NEUTRAL,
    description: message.content?.slice(0, 4000) || t('watch.event.noContent'),
    user: message.author,
    fields,
  });
  const firstImage = message.attachments?.find((attachment) => attachment.contentType?.startsWith('image/'));
  if (firstImage) embed.setImage(firstImage.url);
  await channel.send({ embeds: [embed] }).catch(() => null);
}

async function recordEdit(oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot) return;
  const channel = activeChannel(newMessage.guild, newMessage.author.id);
  if (!channel || channel.id === newMessage.channel.id) return;
  if ((oldMessage.content ?? null) === (newMessage.content ?? null)) return;

  await channel
    .send({
      embeds: [
        logEventEmbed({
          title: `✏️ ${t('watch.event.edited')}`,
          color: COLORS.LOG_UPDATE,
          description: `[${t('watch.event.jump')}](${newMessage.url})`,
          user: newMessage.author,
          fields: [
            { name: t('watch.event.channel'), value: `${newMessage.channel}`, inline: true },
            { name: t('watch.event.time'), value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true },
            { name: t('logs.events.before'), value: oldMessage.content?.slice(0, 1024) || t('watch.event.noContent') },
            { name: t('logs.events.after'), value: newMessage.content?.slice(0, 1024) || t('watch.event.noContent') },
          ],
        }),
      ],
    })
    .catch(() => null);
}

async function recordDelete(message) {
  if (!message.guild || message.author?.bot) return;
  const channel = activeChannel(message.guild, message.author.id);
  if (!channel || channel.id === message.channel.id) return;

  await channel
    .send({
      embeds: [
        logEventEmbed({
          title: `🗑️ ${t('watch.event.deleted')}`,
          color: COLORS.LOG_DELETE,
          description: message.content?.slice(0, 4000) || t('watch.event.noContent'),
          user: message.author,
          fields: [
            { name: t('watch.event.channel'), value: `${message.channel}`, inline: true },
            { name: t('watch.event.time'), value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true },
          ],
        }),
      ],
    })
    .catch(() => null);
}

/** Autres membres présents dans un salon vocal (hors surveillé et bots). */
function othersInVoice(voiceChannel, excludeId) {
  if (!voiceChannel) return t('help.none');
  const others = voiceChannel.members
    .filter((member) => member.id !== excludeId && !member.user.bot)
    .map((member) => `${member}`);
  return others.length ? others.join(', ').slice(0, 1024) : t('help.none');
}

async function recordVoice(oldState, newState) {
  const guild = newState.guild;
  const userId = newState.id;
  const channel = activeChannel(guild, userId);
  if (!channel) return;

  const member = newState.member;
  let action = null;
  const fields = [];

  if (!oldState.channelId && newState.channelId) {
    action = 'voiceJoin';
    fields.push(
      { name: t('watch.event.voiceChannel'), value: `${newState.channel}`, inline: true },
      { name: t('watch.event.joinedAt'), value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true },
      { name: t('watch.event.othersPresent'), value: othersInVoice(newState.channel, userId) },
    );
  } else if (oldState.channelId && !newState.channelId) {
    action = 'voiceLeave';
    fields.push(
      { name: t('watch.event.voiceChannel'), value: `${oldState.channel}`, inline: true },
      { name: t('watch.event.leftAt'), value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true },
      { name: t('watch.event.othersPresent'), value: othersInVoice(oldState.channel, userId) },
    );
  } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    action = 'voiceMove';
    fields.push(
      { name: t('watch.event.from'), value: `${oldState.channel}`, inline: true },
      { name: t('watch.event.to'), value: `${newState.channel}`, inline: true },
      { name: t('watch.event.time'), value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true },
      { name: t('watch.event.othersPresent'), value: othersInVoice(newState.channel, userId) },
    );
  }
  if (!action) return;

  await channel
    .send({
      embeds: [
        logEventEmbed({
          title: `🔊 ${t(`watch.event.${action}`)}`,
          color: COLORS.INFO,
          user: member?.user ?? null,
          fields,
        }),
      ],
    })
    .catch(() => null);
}

module.exports = {
  WATCH_DURATION_MS,
  CATEGORY_NAME,
  buildWarningEmbed,
  startWatch,
  finishWatch,
  sweepExpiredWatches,
  startExpirySweeper,
  recordMessage,
  recordEdit,
  recordDelete,
  recordVoice,
  errorEmbed,
};
