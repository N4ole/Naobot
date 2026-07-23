/**
 * Système d'owners global du bot — totalement indépendant des permissions
 * Discord natives.
 *
 * - Owner principal : OWNER_ID dans le .env (tous les privilèges,
 *   non supprimable par commande).
 * - Owners secondaires : persistés dans database/data/owners.json,
 *   gérés via addowner / rmowner (sauvegarde immédiate).
 * - Rôle décoratif « Owner NaoBot » (config OWNER_ROLE_NAME) : créé sans
 *   aucune permission et attribué automatiquement aux owners présents sur
 *   les serveurs (au démarrage, à l'arrivée d'un owner, à l'ajout du bot
 *   sur un serveur, et à l'ajout d'un owner).
 *
 * Toute la logique owner est isolée ici : les futures commandes réservées
 * aux owners n'ont qu'à déclarer `ownerOnly: true` (voir le middleware
 * middlewares/permissions/ownerCheck).
 */
const config = require('../../config/config');
const repository = require('../../database/ownerRepository');

function getPrimaryOwnerId() {
  return config.ownerId;
}

function getSecondaryOwnerIds() {
  return repository.getOwners();
}

/** Tous les owners (principal + secondaires), sans doublon. */
function getAllOwnerIds() {
  const ids = new Set(repository.getOwners());
  if (config.ownerId) ids.add(config.ownerId);
  return [...ids];
}

function isOwner(userId) {
  return getAllOwnerIds().includes(userId);
}

/** true si l'utilisateur est l'owner **principal** (OWNER_ID du .env). */
function isPrimaryOwner(userId) {
  return Boolean(config.ownerId) && userId === config.ownerId;
}

/**
 * Ajoute un owner secondaire.
 * @returns {{ ok: true } | { ok: false, code: 'primary'|'duplicate' }}
 */
function addOwner(userId) {
  if (userId === config.ownerId) return { ok: false, code: 'primary' };
  if (repository.getOwners().includes(userId)) return { ok: false, code: 'duplicate' };
  repository.addOwner(userId);
  return { ok: true };
}

/**
 * Retire un owner secondaire.
 * L'owner principal est intouchable, et le dernier owner du bot ne peut pas
 * être supprimé (cas d'un bot sans OWNER_ID configuré).
 * @returns {{ ok: true } | { ok: false, code: 'primary'|'notOwner'|'last' }}
 */
function removeOwner(userId) {
  if (config.ownerId && userId === config.ownerId) return { ok: false, code: 'primary' };
  const owners = repository.getOwners();
  if (!owners.includes(userId)) return { ok: false, code: 'notOwner' };
  if (!config.ownerId && owners.length === 1) return { ok: false, code: 'last' };
  repository.removeOwner(userId);
  return { ok: true };
}

/**
 * Retrouve ou crée le rôle décoratif des owners (aucune permission).
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').Role|null>}
 */
async function ensureOwnerRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === config.ownerRoleName);
  if (!role) {
    role = await guild.roles
      .create({
        name: config.ownerRoleName,
        permissions: [],
        reason: 'Rôle décoratif des owners du bot',
      })
      .catch(() => null);
  }
  return role;
}

/**
 * Attribue le rôle décoratif à un membre (sans doublon).
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 */
async function assignOwnerRole(guild, member) {
  const role = await ensureOwnerRole(guild);
  if (!role || member.roles.cache.has(role.id)) return;
  await member.roles.add(role, 'Owner du bot').catch(() => null);
}

/** Retire le rôle décoratif d'un utilisateur sur un serveur, s'il l'a. */
async function removeOwnerRole(guild, userId) {
  const role = guild.roles.cache.find((r) => r.name === config.ownerRoleName);
  if (!role) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member?.roles.cache.has(role.id)) {
    await member.roles.remove(role, "N'est plus owner du bot").catch(() => null);
  }
}

/** Attribue le rôle décoratif à tous les owners présents sur un serveur. */
async function syncOwnerRoles(guild) {
  for (const ownerId of getAllOwnerIds()) {
    const member = await guild.members.fetch(ownerId).catch(() => null);
    if (member) await assignOwnerRole(guild, member);
  }
}

/** Synchronise le rôle décoratif sur tous les serveurs du bot. */
async function syncAllGuilds(client) {
  for (const guild of client.guilds.cache.values()) {
    await syncOwnerRoles(guild).catch(() => null);
  }
}

/** Attribue le rôle décoratif à un utilisateur sur tous les serveurs où il est présent. */
async function assignRoleEverywhere(client, userId) {
  for (const guild of client.guilds.cache.values()) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) await assignOwnerRole(guild, member).catch(() => null);
  }
}

/** Retire le rôle décoratif d'un utilisateur sur tous les serveurs. */
async function removeRoleEverywhere(client, userId) {
  for (const guild of client.guilds.cache.values()) {
    await removeOwnerRole(guild, userId).catch(() => null);
  }
}

module.exports = {
  getPrimaryOwnerId,
  getSecondaryOwnerIds,
  getAllOwnerIds,
  isOwner,
  isPrimaryOwner,
  addOwner,
  removeOwner,
  ensureOwnerRole,
  assignOwnerRole,
  syncOwnerRoles,
  syncAllGuilds,
  assignRoleEverywhere,
  removeRoleEverywhere,
};
