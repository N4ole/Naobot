/**
 * Système de bump inter-serveurs.
 *
 * Les serveurs qui activent la fonctionnalité (bumpenable) définissent un
 * salon de réception : un bump depuis un serveur participant publie sa
 * publicité (embed + invitation native + bouton) dans les salons de tous
 * les autres serveurs participants. Cooldown global de 6 h **par serveur**.
 *
 * Tout est persisté dans database/bumpRepository (activation, salon,
 * compteurs serveur et utilisateur, historique) — les serveurs désactivés
 * n'envoient ni ne reçoivent rien, mais leurs statistiques sont conservées.
 *
 * Le module est conçu pour être étendu (classement mondial, récompenses,
 * badges, boosts, filtres par langue/catégorie…) : la sélection des
 * destinataires est isolée dans collectTargets(), le contenu dans
 * buildAdvert(), et les données par serveur portent un objet extensible.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const repository = require('../../database/bumpRepository');
const logService = require('../logs/logService');
const reputationService = require('../reputation/reputationService');
const { infoEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Cooldown global entre deux bumps d'un même serveur. */
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Permissions minimales du bot dans un salon de réception. */
const CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getGuildConfig(guildId) {
  return repository.getGuildBump(guildId);
}

async function setEnabled(guild, enabled, byUser) {
  const config = repository.getGuildBump(guild.id);
  config.enabled = enabled;
  repository.saveGuildBump(guild.id, config);
  await logService.log(
    guild,
    'bumps',
    logEventEmbed({
      title: t(enabled ? 'bump.logs.enabled' : 'bump.logs.disabled'),
      color: enabled ? COLORS.LOG_CREATE : COLORS.LOG_DELETE,
      user: byUser,
    }),
  );
}

async function setChannel(guild, channel, byUser) {
  const config = repository.getGuildBump(guild.id);
  config.channelId = channel.id;
  repository.saveGuildBump(guild.id, config);
  await logService.log(
    guild,
    'bumps',
    logEventEmbed({
      title: t('bump.logs.channelChanged'),
      color: COLORS.LOG_UPDATE,
      user: byUser,
      fields: [{ name: t('common.channel'), value: `${channel}`, inline: true }],
    }),
  );
}

// ---------------------------------------------------------------------------
// Helpers purs (testés unitairement)
// ---------------------------------------------------------------------------

/** Millisecondes restantes avant le prochain bump autorisé (0 = disponible). */
function remainingCooldown(lastBumpAt, now = Date.now()) {
  if (!lastBumpAt) return 0;
  const elapsed = now - Date.parse(lastBumpAt);
  return Math.max(COOLDOWN_MS - elapsed, 0);
}

/**
 * Classement d'un identifiant dans une table { id: total } (décroissant).
 * @returns {{ rank: number|null, total: number }}
 */
function rankOf(counts, id) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const index = entries.findIndex(([key]) => key === id);
  return { rank: index === -1 ? null : index + 1, total: entries.length };
}

// ---------------------------------------------------------------------------
// Statistiques et classements
// ---------------------------------------------------------------------------

function getUserStats(userId) {
  return repository.getUserBump(userId);
}

function getUserGlobalRank(userId) {
  const counts = Object.fromEntries(
    Object.entries(repository.getAllUserBumps()).map(([id, user]) => [id, user.count]),
  );
  return rankOf(counts, userId);
}

function getUserServerRank(guildId, userId) {
  return rankOf(repository.getGuildBump(guildId).bumpers, userId);
}

function getGuildRank(guildId) {
  const counts = Object.fromEntries(
    Object.entries(repository.getAllGuildBumps()).map(([id, guild]) => [id, guild.bumpCount ?? 0]),
  );
  return rankOf(counts, guildId);
}

/** Nombre de membres distincts ayant déjà bumpé le serveur. */
function countBumpers(guildId) {
  return Object.keys(repository.getGuildBump(guildId).bumpers).length;
}

// ---------------------------------------------------------------------------
// Bump
// ---------------------------------------------------------------------------

/** Salon de réception configuré, seulement s'il est utilisable par le bot. */
function resolveBumpChannel(guild, config) {
  if (!config.channelId) return null;
  const channel = guild.channels.cache.get(config.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  if (!guild.members.me.permissionsIn(channel).has(CHANNEL_PERMISSIONS)) return null;
  return channel;
}

/** Crée une invitation valide (permanente si possible, sinon 7 jours). */
async function createBumpInvite(guild, channel) {
  const reason = 'Bump inter-serveurs';
  let invite = null;
  if (guild.members.me.permissionsIn(channel).has(PermissionFlagsBits.CreateInstantInvite)) {
    invite = await channel.createInvite({ maxAge: 0, unique: false, reason }).catch(() => null);
    if (!invite) {
      invite = await channel
        .createInvite({ maxAge: 7 * 24 * 60 * 60, unique: false, reason })
        .catch(() => null);
    }
  }
  return invite;
}

/** Publicité du serveur : embed complet + bouton « Rejoindre ». */
function buildAdvert(guild, invite, totals, user) {
  const cached = guild.members.cache;
  const bots = cached.filter((member) => member.user.bot).size;
  const totalMembers = guild.memberCount ?? cached.size;
  const humans = Math.max(totalMembers - bots, 0);

  const embed = infoEmbed(guild.name, guild.description || t('bump.advert.defaultDescription'))
    .addFields(
      { name: t('owners.servers.members'), value: String(totalMembers), inline: true },
      { name: t('tracking.humans'), value: String(humans), inline: true },
      { name: t('owners.servers.bots'), value: String(bots), inline: true },
      {
        name: t('owners.servers.created'),
        value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
        inline: true,
      },
      {
        name: t('tracking.reputation'),
        value: reputationService.formatReputation(reputationService.getOrCompute(guild)),
        inline: true,
      },
      { name: t('bump.advert.totalBumps'), value: String(totals.guildCount), inline: true },
      { name: t('bump.advert.invitation'), value: invite.url },
    )
    .setTimestamp()
    .setFooter({ text: t('bump.advert.footer', { count: totals.guildCount, user: user.tag }) });

  const icon = guild.iconURL({ size: 256 });
  if (icon) embed.setThumbnail(icon);
  const banner = guild.bannerURL({ size: 1024 });
  if (banner) embed.setImage(banner);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(invite.url)
      .setLabel(t('bump.advert.join', { name: guild.name }).slice(0, 80)),
  );

  // Le contenu du message porte l'URL : Discord affiche ainsi son embed
  // d'invitation natif en plus de la publicité.
  return { content: invite.url, embeds: [embed], components: [buttons] };
}

/**
 * Salons de réception de tous les serveurs participants (hors serveur
 * source), sans doublon. Les serveurs désactivés ou mal configurés sont
 * ignorés silencieusement. Point d'extension pour de futurs filtres
 * (langue, catégorie, boosts…).
 */
function collectTargets(client, sourceGuildId) {
  const targets = [];
  const seen = new Set();
  for (const guild of client.guilds.cache.values()) {
    if (guild.id === sourceGuildId) continue;
    const config = repository.getGuildBump(guild.id);
    if (!config.enabled) continue;
    const channel = resolveBumpChannel(guild, config);
    if (!channel || seen.has(channel.id)) continue;
    seen.add(channel.id);
    targets.push(channel);
  }
  return targets;
}

/**
 * Effectue un bump complet : vérifications, invitation, compteurs,
 * diffusion vers les serveurs participants, logs.
 * @returns {Promise<{ ok: true, sent: number, failed: number, totalBumps: number, nextAt: number }
 *   | { ok: false, code: string, remaining?: number }>}
 */
async function performBump(guild, user, client) {
  const config = repository.getGuildBump(guild.id);
  if (!config.enabled) return { ok: false, code: 'notEnabled' };

  const sourceChannel = resolveBumpChannel(guild, config);
  if (!sourceChannel) return { ok: false, code: 'noChannel' };

  const remaining = remainingCooldown(config.lastBumpAt);
  if (remaining > 0) return { ok: false, code: 'cooldown', remaining };

  const invite = await createBumpInvite(guild, sourceChannel);
  if (!invite) {
    await logService.log(
      guild,
      'bumps',
      logEventEmbed({ title: t('bump.logs.bumpError'), color: COLORS.ERROR, user, description: t('bump.command.inviteFailed') }),
    );
    return { ok: false, code: 'inviteFailed' };
  }

  // Trace des invitations non permanentes (surveillance des expirations).
  if (invite.expiresAt) {
    await logService.log(
      guild,
      'bumps',
      logEventEmbed({
        title: t('bump.logs.inviteExpiry'),
        color: COLORS.WARNING,
        fields: [
          { name: t('bump.logs.invitation'), value: invite.url, inline: true },
          { name: t('bump.logs.expiresAt'), value: `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>`, inline: true },
        ],
      }),
    );
  }

  // Le cooldown est armé avant la diffusion : un envoi partiellement
  // échoué ne permet pas de spammer les autres serveurs.
  const totals = repository.recordBump(guild.id, user.id);
  const payload = buildAdvert(guild, invite, totals, user);

  let sent = 0;
  let failed = 0;
  for (const channel of collectTargets(client, guild.id)) {
    const delivered = await channel
      .send(payload)
      .then(() => true)
      .catch(() => false);
    if (delivered) sent += 1;
    else failed += 1;
  }

  await logService.log(
    guild,
    'bumps',
    logEventEmbed({
      title: t('bump.logs.bumped'),
      color: COLORS.LOG_NEUTRAL,
      user,
      fields: [
        { name: t('bump.logs.sentTo'), value: String(sent), inline: true },
        { name: t('bump.logs.failures'), value: String(failed), inline: true },
      ],
    }),
  );

  return { ok: true, sent, failed, totalBumps: totals.guildCount, nextAt: Date.now() + COOLDOWN_MS };
}

module.exports = {
  COOLDOWN_MS,
  CHANNEL_PERMISSIONS,
  getGuildConfig,
  setEnabled,
  setChannel,
  remainingCooldown,
  rankOf,
  getUserStats,
  getUserGlobalRank,
  getUserServerRank,
  getGuildRank,
  countBumpers,
  resolveBumpChannel,
  performBump,
};
