/**
 * Système de logs — **sept catégories fixes** (utils/constants/logCategories),
 * activables/désactivables indépendamment, persistées par serveur.
 *
 * - `log(guild, clé, embed)` est le point d'entrée unique : il route la clé
 *   (y compris les anciennes clés, via LEGACY_ALIASES) vers l'une des sept
 *   catégories, ou l'ignore si elle est supprimée. Ne fait rien si la catégorie
 *   est désactivée ; jamais bloquant.
 * - `setup`/`enableCategories` créent la catégorie Discord « Logs » et les
 *   salons manquants (réutilisation de l'existant, jamais de doublon).
 * - Chaque changement d'état conserve la date et l'auteur (status).
 *
 * Aucune nouvelle catégorie ne peut être créée sans modifier le code
 * (logCategories + éventuellement LEGACY_ALIASES).
 */
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const logCategories = require('../../utils/constants/logCategories');
const repository = require('../../database/logSettingsRepository');

const LOGS_PARENT_NAME = 'Logs';
const REAL_KEYS = new Set(Object.keys(logCategories));

/**
 * Correspondance des ANCIENNES clés de logs vers les sept catégories (ou
 * `null` = supprimée, l'événement est ignoré). Fusion complète de l'ancien
 * système.
 */
const LEGACY_ALIASES = {
  // Sanctions (warns + réputation + rôles de warn).
  warns: 'sanctions',
  repglobale: 'sanctions',
  // Arrivées / départs (+ bienvenue + captcha).
  'arrivees-departs': 'members',
  bienvenue: 'members',
  captcha: 'members',
  // Rôles.
  'roles-reactions': 'roles',
  // Surveillance.
  surveillance: 'watch',
  // Protections (+ mode urgence).
  urgence: 'protections',
  // Catégories secondaires supprimées.
  'messages-supprimes': null,
  'messages-modifies': null,
  salons: null,
  serveur: null,
  commandes: null,
  erreurs: null,
  bumps: null,
  'gestion-serveurs': null,
  contact: null,
  sauvegardes: null,
  formulaires: null,
  rappels: null,
  sondages: null,
  web: null,
  vocaux: null,
};

/** Résout une clé (réelle ou héritée) vers une catégorie réelle, ou null. */
function resolveKey(key) {
  if (REAL_KEYS.has(key)) return key;
  if (key in LEGACY_ALIASES) return LEGACY_ALIASES[key];
  return null;
}

/** Salons de logs privés : invisibles pour @everyone, accessibles au bot. */
function privateOverwrites(guild) {
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
  ];
}

/** true si la catégorie a déjà été configurée (activée OU désactivée). */
function isControlled(guildId, key) {
  const resolved = resolveKey(key);
  return resolved !== null && resolved in repository.getSettings(guildId).enabled;
}

/** true si la catégorie (résolue) est actuellement activée. */
function isEnabled(guildId, key) {
  const resolved = resolveKey(key);
  return resolved !== null && repository.getSettings(guildId).enabled[resolved] === true;
}

/** État des sept catégories : { [clé]: { enabled, channelId, updatedAt, updatedBy } }. */
function getStatus(guildId) {
  const settings = repository.getSettings(guildId);
  return Object.fromEntries(
    Object.keys(logCategories).map((key) => [
      key,
      {
        enabled: settings.enabled[key] === true,
        channelId: settings.channels[key] ?? null,
        updatedAt: settings.meta[key]?.at ?? null,
        updatedBy: settings.meta[key]?.by ?? null,
      },
    ]),
  );
}

async function ensureParentCategory(guild, settings) {
  let parent = settings.categoryId ? guild.channels.cache.get(settings.categoryId) : null;
  if (!parent || parent.type !== ChannelType.GuildCategory) {
    parent = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === LOGS_PARENT_NAME) ?? null;
  }
  if (!parent) {
    parent = await guild.channels.create({ name: LOGS_PARENT_NAME, type: ChannelType.GuildCategory, permissionOverwrites: privateOverwrites(guild), reason: 'Création de la catégorie des salons de logs' });
  }
  settings.categoryId = parent.id;
  return parent;
}

async function ensureLogChannel(guild, settings, key, parent) {
  const definition = logCategories[key];
  let channel = settings.channels[key] ? guild.channels.cache.get(settings.channels[key]) : null;
  if (!channel || channel.type !== ChannelType.GuildText) {
    channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === definition.channelName) ?? null;
  }
  if (!channel) {
    channel = await guild.channels.create({ name: definition.channelName, type: ChannelType.GuildText, parent: parent.id, permissionOverwrites: privateOverwrites(guild), reason: `Création du salon de logs : ${definition.label}` });
  }
  settings.channels[key] = channel.id;
  return channel;
}

function stampMeta(settings, keys, byUserId) {
  const at = new Date().toISOString();
  for (const key of keys) settings.meta[key] = { at, by: byUserId ?? null };
}

/** Active des catégories : crée la catégorie « Logs » et les salons manquants. */
async function enableCategories(guild, keys, byUserId = null) {
  const valid = keys.filter((key) => key in logCategories);
  const settings = repository.getSettings(guild.id);
  const parent = await ensureParentCategory(guild, settings);
  for (const key of valid) {
    await ensureLogChannel(guild, settings, key, parent);
    settings.enabled[key] = true;
  }
  stampMeta(settings, valid, byUserId);
  repository.saveSettings(guild.id, settings);
}

/** Désactive des catégories (les salons existants sont conservés). */
async function disableCategories(guild, keys, byUserId = null) {
  const valid = keys.filter((key) => key in logCategories);
  const settings = repository.getSettings(guild.id);
  for (const key of valid) settings.enabled[key] = false;
  stampMeta(settings, valid, byUserId);
  repository.saveSettings(guild.id, settings);
}

/** Consigne un embed dans le salon de la catégorie résolue, si elle est activée. */
async function log(guild, key, embed) {
  const resolved = resolveKey(key);
  if (!resolved || !isEnabled(guild.id, resolved)) return;

  const settings = repository.getSettings(guild.id);
  let channel = settings.channels[resolved] ? guild.channels.cache.get(settings.channels[resolved]) : null;
  if (!channel) {
    const definition = logCategories[resolved];
    channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === definition?.channelName) ?? null;
  }
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = {
  isControlled,
  isEnabled,
  getStatus,
  enableCategories,
  disableCategories,
  log,
  resolveKey,
  LEGACY_ALIASES,
  LOGS_PARENT_NAME,
};
