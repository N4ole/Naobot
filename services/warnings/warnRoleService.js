/**
 * Liaison warns → rôles automatiques.
 *
 * À chaque variation du nombre de warns d'un membre, ce service synchronise
 * ses rôles : il retire les anciens rôles de warn et attribue celui du palier
 * atteint (comportement « plafond » : le plus haut palier configuré ≤ total).
 * À zéro warn, tous les rôles de warn sont retirés.
 *
 * Une tâche de cohérence (syncGuild / startScheduler) corrige périodiquement
 * les écarts éventuels (rôles ajoutés/retirés manuellement, redémarrages…).
 * Les changements sont journalisés dans la catégorie de logs « warns ».
 */
const repository = require('../../database/warnRoleRepository');
const warnRepository = require('../../database/warnRepository');
const logService = require('../logging/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { auditReason } = require('../../utils/helpers/discordUtils');
const { t } = require('../../utils/helpers/i18n');

const SYNC_INTERVAL_MS = 30 * 60 * 1000;

/** Palier cible pour un nombre de warns : plus haut niveau configuré ≤ count. */
function targetLevel(mapping, count) {
  if (count <= 0) return null;
  const eligible = repository.sortedLevels(mapping).filter((level) => level <= count);
  return eligible.length ? eligible[eligible.length - 1] : null;
}

/** Rôle attendu pour un nombre de warns (ou null). */
function targetRoleId(guildId, count) {
  const mapping = repository.getMapping(guildId);
  const level = targetLevel(mapping, count);
  return level ? mapping[level] : null;
}

async function logRoleChange(guild, action, member, extraFields = []) {
  await logService.log(
    guild,
    'warns',
    logEventEmbed({
      title: `📛 ${t(`warns.logs.${action}`)}`,
      color: action === 'roleRemoved' ? COLORS.LOG_CREATE : COLORS.LOG_UPDATE,
      fields: [{ name: t('common.member'), value: `${member.user.tag} (\`${member.id}\`)`, inline: true }, ...extraFields],
    }),
  );
}

/** Le bot peut-il gérer ce rôle ? (existe, non géré, sous son rôle le plus haut) */
function manageableRole(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  if (!role || role.managed) return null;
  const me = guild.members.me;
  if (!me || role.position >= me.roles.highest.position) return null;
  return role;
}

/**
 * Synchronise les rôles de warn d'un membre pour un total donné.
 * @returns {Promise<{ added: string[], removed: string[] }>}
 */
async function syncMember(guild, userId, count, { silent = false } = {}) {
  const mapping = repository.getMapping(guild.id);
  const roleIds = Object.values(mapping);
  if (roleIds.length === 0) return { added: [], removed: [] };

  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  if (!member) return { added: [], removed: [] };

  const wantedRoleId = targetRoleId(guild.id, count);
  const audit = auditReason(guild.members.me?.user ?? { tag: 'NaoBot' }, t('warns.roles.auditReason'));
  const added = [];
  const removed = [];

  // Retire tous les rôles de warn sauf celui attendu.
  for (const roleId of roleIds) {
    if (roleId === wantedRoleId) continue;
    if (!member.roles.cache.has(roleId)) continue;
    const role = manageableRole(guild, roleId);
    if (!role) continue;
    if (await member.roles.remove(role, audit).then(() => true).catch(() => false)) removed.push(roleId);
  }
  // Attribue le rôle attendu.
  if (wantedRoleId && !member.roles.cache.has(wantedRoleId)) {
    const role = manageableRole(guild, wantedRoleId);
    if (role && (await member.roles.add(role, audit).then(() => true).catch(() => false))) added.push(wantedRoleId);
  }

  if (!silent && (added.length || removed.length)) {
    const fields = [];
    if (added.length) fields.push({ name: t('warns.logs.roleAdded'), value: added.map((id) => `<@&${id}>`).join(' '), inline: true });
    if (removed.length) fields.push({ name: t('warns.logs.roleRemovedField'), value: removed.map((id) => `<@&${id}>`).join(' '), inline: true });
    await logRoleChange(guild, count > 0 ? 'roleAssigned' : 'roleRemoved', member, fields);
  }
  return { added, removed };
}

/**
 * Tâche de cohérence : réconcilie les rôles de warn de tous les membres
 * concernés d'un serveur (ceux qui ont des warns + ceux qui portent un rôle
 * de warn). Bornée au cache pour rester sûre sur les gros serveurs.
 * @returns {Promise<number>} nombre de membres corrigés
 */
async function syncGuild(guild) {
  const mapping = repository.getMapping(guild.id);
  const roleIds = Object.values(mapping);
  if (roleIds.length === 0) return 0;

  const userIds = new Set();
  // Membres ayant des warns.
  for (const warn of warnRepository.getAllWarns(guild.id)) userIds.add(warn.userId);
  // Membres portant un rôle de warn (cache) — pour retirer les rôles obsolètes.
  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId);
    if (role) for (const memberId of role.members.keys()) userIds.add(memberId);
  }

  let corrected = 0;
  for (const userId of userIds) {
    const count = warnRepository.countWarns(guild.id, userId);
    const result = await syncMember(guild, userId, count, { silent: true }).catch(() => ({ added: [], removed: [] }));
    if (result.added.length || result.removed.length) corrected += 1;
  }
  return corrected;
}

async function syncAllGuilds(client) {
  for (const guild of client.guilds.cache.values()) {
    await syncGuild(guild).catch(() => null);
  }
}

function startScheduler(client) {
  syncAllGuilds(client).catch(() => null);
  const timer = setInterval(() => syncAllGuilds(client).catch(() => null), SYNC_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

module.exports = {
  SYNC_INTERVAL_MS,
  targetLevel,
  targetRoleId,
  syncMember,
  syncGuild,
  syncAllGuilds,
  startScheduler,
  getMapping: repository.getMapping,
  sortedLevels: repository.sortedLevels,
  setRole: repository.setRole,
  removeRole: repository.removeRole,
};
