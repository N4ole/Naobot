/**
 * Orchestration du système de warns à sanctions progressives, partagée par
 * les commandes slash et préfixées.
 *
 * Un warn : vérifie la hiérarchie, l'enregistre (identifiant unique, date,
 * modérateur, raison), recalcule le total actif, applique automatiquement la
 * sanction du palier atteint (sanctionService), notifie l'utilisateur en MP
 * (jamais bloquant) et journalise dans la catégorie de logs « warns ».
 *
 * La persistance vit dans database/warnRepository (warns) et
 * database/warnConfigRepository (échelle) ; la logique de sanction dans
 * services/warnings/sanctionService.
 */
const warnRepository = require('../../database/warnRepository');
const sanctionService = require('./sanctionService');
const warnRoleService = require('./warnRoleService');
const globalReputationService = require('../reputation/globalReputationService');
const logService = require('../logging/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { dmUser } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

/** Journalise un événement warn dans la catégorie de logs dédiée. */
function logWarnEvent(guild, action, { target, moderator, reason, extraFields = [], color }) {
  return logService.log(
    guild,
    'warns',
    logEventEmbed({
      title: `📛 ${t(`warns.logs.${action}`)}`,
      color: color ?? COLORS.LOG_NEUTRAL,
      user: moderator ?? null,
      fields: [
        target ? { name: t('common.member'), value: `${target.tag ?? target} (\`${target.id ?? ''}\`)`, inline: true } : null,
        moderator ? { name: t('common.moderator'), value: `${moderator.tag}`, inline: true } : null,
        reason ? { name: t('common.reason'), value: reason } : null,
        ...extraFields,
      ].filter(Boolean),
    }),
  );
}

/**
 * Ajoute un warn et applique la sanction progressive correspondante.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member - Membre averti
 * @param {import('discord.js').User} moderator
 * @param {string} reason
 * @returns {Promise<{ warn, total, sanction, applied, sanctionLabel, nextLabel }>}
 */
async function addWarn(guild, member, moderator, reason) {
  const { warn, total } = warnRepository.addWarn(guild.id, member.id, moderator.id, reason);
  const resolved = sanctionService.resolveSanction(guild.id, total);
  const sanction = resolved?.sanction ?? null;
  const sanctionLabel = sanctionService.describeSanction(sanction);
  const nextLabel = sanctionService.describeSanction(sanctionService.nextSanction(guild.id, total)?.sanction ?? null);

  // Notification MP AVANT l'application (indispensable pour kick/ban).
  await dmUser(
    member.user,
    t('warns.dm', {
      guild: guild.name,
      reason,
      moderator: moderator.tag,
      sanction: sanctionLabel,
      total,
      next: nextLabel,
    }),
  );

  let applied = false;
  if (sanction && sanction.type !== 'warn') {
    const result = await sanctionService.executeSanction(guild, member, moderator, sanction, reason);
    applied = result.applied;
  } else if (sanction) {
    applied = true; // simple avertissement
  }

  const sanctionRecord = sanction
    ? { type: sanction.type, durationMs: sanction.durationMs ?? null, level: resolved.level, applied }
    : null;
  warnRepository.updateWarnSanction(guild.id, member.id, warn.id, sanctionRecord);

  await logWarnEvent(guild, 'added', {
    target: member.user,
    moderator,
    reason,
    color: COLORS.LOG_UPDATE,
    extraFields: [
      { name: t('warns.field.id'), value: `\`${warn.id}\``, inline: true },
      { name: t('warns.field.total'), value: String(total), inline: true },
      { name: t('warns.field.sanction'), value: applied ? sanctionLabel : t('warns.sanction.notApplied', { sanction: sanctionLabel }) },
    ],
  });
  if (sanction && sanction.type !== 'warn') {
    await logWarnEvent(guild, 'autoSanction', {
      target: member.user,
      reason,
      color: applied ? COLORS.LOG_DELETE : COLORS.ERROR,
      extraFields: [{ name: t('warns.field.sanction'), value: applied ? sanctionLabel : t('warns.sanction.failed', { sanction: sanctionLabel }) }],
    });
  }

  // Rôles automatiques : retire les anciens paliers, attribue le nouveau.
  await warnRoleService.syncMember(guild, member.id, total).catch(() => null);

  // Réputation globale : contribue au score inter-serveurs.
  globalReputationService.record({ guild, user: member.user, moderator, action: 'warn', reason }).catch(() => null);

  return { warn, total, sanction, applied, sanctionLabel, nextLabel };
}

/**
 * Supprime un warn par identifiant et recalcule le total.
 * @returns {{ ok: boolean, total?: number }}
 */
async function removeWarn(guild, targetUser, warnId, moderator) {
  const result = warnRepository.removeWarn(guild.id, targetUser.id, warnId);
  if (!result.ok) return { ok: false };

  await logWarnEvent(guild, 'removed', {
    target: targetUser,
    moderator,
    color: COLORS.LOG_CREATE,
    extraFields: [
      { name: t('warns.field.id'), value: `\`${warnId}\``, inline: true },
      { name: t('warns.field.total'), value: String(result.total), inline: true },
    ],
  });
  // Recalcule les rôles de warn selon le nouveau total.
  await warnRoleService.syncMember(guild, targetUser.id, result.total).catch(() => null);
  return { ok: true, total: result.total };
}

/**
 * Supprime tous les warns d'un utilisateur.
 * @returns {{ ok: boolean, count: number }}
 */
async function clearWarns(guild, targetUser, moderator) {
  const count = warnRepository.clearWarns(guild.id, targetUser.id);
  if (count === 0) return { ok: false, count: 0 };

  await logWarnEvent(guild, 'cleared', {
    target: targetUser,
    moderator,
    color: COLORS.LOG_CREATE,
    extraFields: [{ name: t('warns.field.removed'), value: String(count), inline: true }],
  });
  // Plus aucun warn : retire tous les rôles de sanction liés aux warns.
  await warnRoleService.syncMember(guild, targetUser.id, 0).catch(() => null);
  return { ok: true, count };
}

function getWarnings(guildId, userId) {
  return warnRepository.getWarns(guildId, userId);
}

function countWarns(guildId, userId) {
  return warnRepository.countWarns(guildId, userId);
}

/** Journalise une modification de l'échelle des sanctions. */
function logRulesChange(guild, moderator, detail) {
  return logWarnEvent(guild, 'rulesChanged', {
    moderator,
    color: COLORS.LOG_UPDATE,
    extraFields: [{ name: t('warns.field.change'), value: detail }],
  });
}

module.exports = {
  addWarn,
  removeWarn,
  clearWarns,
  getWarnings,
  countWarns,
  logRulesChange,
};
