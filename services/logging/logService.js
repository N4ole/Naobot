/**
 * Système de logs par catégories.
 *
 * - Chaque catégorie (utils/constants/logCategories) est activable et
 *   désactivable indépendamment, avec persistance par serveur
 *   (database/logSettingsRepository).
 * - À l'activation, la catégorie Discord « Logs » et les salons manquants
 *   sont créés automatiquement ; les salons existants sont réutilisés
 *   (recherche par identifiant enregistré, puis par nom) — jamais de doublon.
 * - `log(guild, clé, embed)` est le point d'entrée unique utilisé par tous
 *   les événements et services : il ne fait rien si la catégorie est
 *   désactivée, et n'est jamais bloquant.
 */
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const logCategories = require('../../utils/constants/logCategories');
const repository = require('../../database/logSettingsRepository');

const LOGS_PARENT_NAME = 'Logs';

/** Salons de logs privés : invisibles pour @everyone, accessibles au bot. */
function privateOverwrites(guild) {
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];
}

/** true si la catégorie a déjà été configurée (activée OU désactivée) sur ce serveur. */
function isControlled(guildId, key) {
  return key in repository.getSettings(guildId).enabled;
}

/** true si la catégorie est actuellement activée sur ce serveur. */
function isEnabled(guildId, key) {
  return repository.getSettings(guildId).enabled[key] === true;
}

/** État de toutes les catégories : { [clé]: { enabled, channelId } }. */
function getStatus(guildId) {
  const settings = repository.getSettings(guildId);
  return Object.fromEntries(
    Object.keys(logCategories).map((key) => [
      key,
      { enabled: settings.enabled[key] === true, channelId: settings.channels[key] ?? null },
    ]),
  );
}

/** Retrouve ou crée la catégorie Discord « Logs » (jamais de doublon). */
async function ensureParentCategory(guild, settings) {
  let parent = settings.categoryId ? guild.channels.cache.get(settings.categoryId) : null;
  if (!parent || parent.type !== ChannelType.GuildCategory) {
    parent =
      guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === LOGS_PARENT_NAME,
      ) ?? null;
  }
  if (!parent) {
    parent = await guild.channels.create({
      name: LOGS_PARENT_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: privateOverwrites(guild),
      reason: 'Création de la catégorie des salons de logs',
    });
  }
  settings.categoryId = parent.id;
  return parent;
}

/** Retrouve ou crée le salon d'une catégorie de logs (jamais de doublon). */
async function ensureLogChannel(guild, settings, key, parent) {
  const definition = logCategories[key];
  let channel = settings.channels[key] ? guild.channels.cache.get(settings.channels[key]) : null;
  if (!channel || channel.type !== ChannelType.GuildText) {
    channel =
      guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && c.name === definition.channelName,
      ) ?? null;
  }
  if (!channel) {
    channel = await guild.channels.create({
      name: definition.channelName,
      type: ChannelType.GuildText,
      parent: parent.id,
      permissionOverwrites: privateOverwrites(guild),
      reason: `Création du salon de logs : ${definition.label}`,
    });
  }
  settings.channels[key] = channel.id;
  return channel;
}

/**
 * Active des catégories : crée la catégorie « Logs » et les salons manquants,
 * réutilise l'existant, puis persiste les paramètres.
 * @param {import('discord.js').Guild} guild
 * @param {string[]} keys - Clés de logCategories
 */
async function enableCategories(guild, keys) {
  const settings = repository.getSettings(guild.id);
  const parent = await ensureParentCategory(guild, settings);
  for (const key of keys) {
    if (!(key in logCategories)) continue;
    await ensureLogChannel(guild, settings, key, parent);
    settings.enabled[key] = true;
  }
  repository.saveSettings(guild.id, settings);
}

/**
 * Désactive des catégories (les salons existants sont conservés).
 * @param {import('discord.js').Guild} guild
 * @param {string[]} keys
 */
async function disableCategories(guild, keys) {
  const settings = repository.getSettings(guild.id);
  for (const key of keys) {
    if (!(key in logCategories)) continue;
    settings.enabled[key] = false;
  }
  repository.saveSettings(guild.id, settings);
}

/**
 * Consigne un embed dans le salon de la catégorie, si elle est activée.
 * Jamais bloquant : toute erreur d'envoi est ignorée silencieusement.
 * @param {import('discord.js').Guild} guild
 * @param {string} key - Clé de logCategories
 * @param {import('discord.js').EmbedBuilder} embed
 */
async function log(guild, key, embed) {
  if (!isEnabled(guild.id, key)) return;

  const settings = repository.getSettings(guild.id);
  let channel = settings.channels[key] ? guild.channels.cache.get(settings.channels[key]) : null;
  if (!channel) {
    const definition = logCategories[key];
    channel =
      guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && c.name === definition?.channelName,
      ) ?? null;
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
  LOGS_PARENT_NAME,
};
