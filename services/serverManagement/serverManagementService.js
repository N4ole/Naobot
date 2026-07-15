/**
 * Gestion globale des serveurs (réservée aux owners du bot) :
 * - départ manuel d'un serveur (commande leave) ;
 * - liste noire globale (serverban / serverunban / serverbanlist) ;
 * - départ automatique et notification quand un serveur banni invite le bot ;
 * - journal des actions globales : embed envoyé en MP à tous les owners et,
 *   quand le bot est encore présent sur le serveur concerné, dans la
 *   catégorie de logs « gestion-serveurs » de ce serveur.
 *
 * Toute la logique vit ici : les fichiers de commandes ne font que
 * déclarer les arguments et relayer les résultats.
 */
const { EmbedBuilder } = require('discord.js');
const config = require('../../config/config');
const serverBanRepository = require('../../database/serverBanRepository');
const statsService = require('../tracking/guildStatsService');
const reputationService = require('../reputation/reputationService');
const logService = require('../logging/logService');
const { sendToOwners } = require('../tracking/ownerNotifier');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const ACTION_COLORS = {
  manualLeave: COLORS.LOG_DELETE,
  serverBanned: COLORS.ERROR,
  serverUnbanned: COLORS.LOG_CREATE,
  bannedJoinAttempt: COLORS.WARNING,
};

/**
 * Journal d'une action globale : action, serveur, owner responsable, date
 * (horodatage de l'embed) et raison. Envoyé en MP aux owners + dans les
 * logs du serveur concerné si le bot y est encore.
 * @param {import('discord.js').Client} client
 * @param {'manualLeave'|'serverBanned'|'serverUnbanned'|'bannedJoinAttempt'} action
 * @param {{ guild?: import('discord.js').Guild|null, guildId: string, name?: string|null,
 *           by?: import('discord.js').User|null, reason?: string|null }} details
 */
async function logGlobalAction(client, action, { guild = null, guildId, name = null, by = null, reason = null }) {
  const fields = [
    {
      name: t('serverManagement.logs.server'),
      value: `${name ?? guildId} (\`${guildId}\`)`,
      inline: true,
    },
  ];
  if (by) {
    fields.push({
      name: t('serverManagement.logs.responsible'),
      value: `${by.tag} (\`${by.id}\`)`,
      inline: true,
    });
  }
  fields.push({ name: t('common.reason'), value: reason ?? t('common.noReason') });

  const embed = logEventEmbed({
    title: `🌐 ${t(`serverManagement.logs.${action}`)}`,
    color: ACTION_COLORS[action] ?? COLORS.LOG_NEUTRAL,
    fields,
    user: by ?? null,
  });

  if (guild && guild.members.me) {
    await logService.log(guild, 'gestion-serveurs', embed).catch(() => null);
  }
  await sendToOwners(client, embed);
}

/**
 * Résumé d'un serveur pour l'embed de confirmation de départ.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{name: string, value: string, inline?: boolean}[]>}
 */
async function buildServerSummaryFields(guild) {
  const owner = await guild.fetchOwner().catch(() => null);
  const stats = statsService.getStats(guild.id);
  return [
    {
      name: t('owners.servers.owner'),
      value: owner ? `${owner.user.tag} (\`${owner.id}\`)` : t('owners.servers.unknown'),
      inline: true,
    },
    { name: t('owners.servers.members'), value: String(guild.memberCount), inline: true },
    {
      name: t('tracking.reputation'),
      value: reputationService.formatReputation(reputationService.getOrCompute(guild)),
      inline: true,
    },
    {
      name: t('owners.servers.created'),
      value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
      inline: true,
    },
    {
      name: t('owners.servers.joined'),
      value: guild.joinedTimestamp ? `<t:${Math.floor(guild.joinedTimestamp / 1000)}:D>` : t('owners.servers.unknown'),
      inline: true,
    },
    {
      name: t('reputation.command.statsTitle'),
      value: t('reputation.command.statsValue', {
        sanctions: stats.sanctionCount,
        commands: stats.commandCount,
        joins: stats.joinCount,
        leaves: stats.leaveCount,
      }),
    },
  ];
}

/**
 * Départ manuel d'un serveur : journal global puis départ. L'historique,
 * la date de départ et la conservation des statistiques sont assurés par
 * le suivi existant (événement guildDelete → guildStatsService).
 * @returns {Promise<{ ok: boolean }>}
 */
async function leaveServer(guild, byUser) {
  await logGlobalAction(guild.client, 'manualLeave', {
    guild,
    guildId: guild.id,
    name: guild.name,
    by: byUser,
  });
  const left = await guild
    .leave()
    .then(() => true)
    .catch(() => false);
  return { ok: left };
}

/** Embed envoyé en MP au propriétaire d'un serveur banni. */
function bannedNoticeEmbed(client, guildName, ban) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle(t('serverManagement.ban.noticeTitle', { bot: client.user.username }))
    .setDescription(t('serverManagement.ban.noticeDescription', { name: guildName }))
    .addFields(
      { name: t('common.reason'), value: ban?.reason ?? t('common.noReason'), inline: true },
      {
        name: t('serverManagement.ban.noticeDate'),
        value: ban?.date ? `<t:${Math.floor(Date.parse(ban.date) / 1000)}:D>` : t('owners.servers.unknown'),
        inline: true,
      },
    )
    .setTimestamp();
  if (config.supportContact) {
    embed.addFields({ name: t('serverManagement.ban.noticeContact'), value: config.supportContact });
  }
  return embed;
}

/** Prévient le propriétaire du serveur banni en MP (jamais bloquant). */
async function notifyGuildOwnerBanned(guild) {
  const ban = serverBanRepository.getBan(guild.id);
  const owner = await guild.fetchOwner().catch(() => null);
  if (!owner) return;
  await owner.send({ embeds: [bannedNoticeEmbed(guild.client, guild.name, ban)] }).catch(() => null);
}

/**
 * Ajoute un serveur à la liste noire. Si le bot y est présent, le
 * propriétaire est prévenu en MP et le bot quitte immédiatement.
 * @returns {Promise<{ ok: true, name: string|null } | { ok: false, code: 'alreadyBanned' }>}
 */
async function banServer(client, guildId, reason, byUser) {
  if (serverBanRepository.isBanned(guildId)) return { ok: false, code: 'alreadyBanned' };

  const guild = client.guilds.cache.get(guildId) ?? null;
  const name = guild?.name ?? statsService.getStats(guildId).name ?? null;
  serverBanRepository.addBan({ id: guildId, name, reason, bannedBy: byUser.id });

  await logGlobalAction(client, 'serverBanned', { guild, guildId, name, by: byUser, reason });

  if (guild) {
    await notifyGuildOwnerBanned(guild);
    await guild.leave().catch(() => null);
  }
  return { ok: true, name };
}

/**
 * Retire un serveur de la liste noire.
 * @returns {Promise<{ ok: true } | { ok: false, code: 'notBanned' }>}
 */
async function unbanServer(client, guildId, byUser) {
  const ban = serverBanRepository.getBan(guildId);
  if (!ban) return { ok: false, code: 'notBanned' };
  serverBanRepository.removeBan(guildId);
  await logGlobalAction(client, 'serverUnbanned', {
    guildId,
    name: ban.name,
    by: byUser,
    reason: ban.reason,
  });
  return { ok: true };
}

/**
 * Traite l'arrivée du bot sur un serveur banni : notification du
 * propriétaire, trace dans l'historique, journal global (tentative +
 * départ automatique) et départ immédiat. Aucune initialisation normale
 * n'a lieu (les autres écouteurs et le pipeline de commandes vérifient
 * isBanned).
 * @returns {Promise<boolean>} true si le serveur était banni
 */
async function handleBannedGuildJoin(guild) {
  const ban = serverBanRepository.getBan(guild.id);
  if (!ban) return false;

  serverBanRepository.recordAttempt(guild.id);
  await notifyGuildOwnerBanned(guild);
  await logGlobalAction(guild.client, 'bannedJoinAttempt', {
    guildId: guild.id,
    name: guild.name,
    reason: ban.reason,
  });
  await guild.leave().catch(() => null);
  return true;
}

module.exports = {
  isBanned: serverBanRepository.isBanned,
  getBans: serverBanRepository.getAll,
  buildServerSummaryFields,
  leaveServer,
  banServer,
  unbanServer,
  handleBannedGuildJoin,
  logGlobalAction,
};
