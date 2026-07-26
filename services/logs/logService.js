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
const logStore = require('../../database/logStoreRepository');
const logThrottle = require('./logThrottle');
const emojis = require('../../config/emojis');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const webNotifier = require('../web/webNotifier');

const LOGS_PARENT_NAME = 'Logs';
const REAL_KEYS = new Set(Object.keys(logCategories));

/**
 * Catégories de logs dont l'interface web reçoit une notification typée
 * (temps réel). Les autres sont diffusées sous le type générique `log`.
 */
const NOTIFIED_CATEGORIES = { protections: 'protection', tickets: 'ticket' };

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
  // Journalisation serveur détaillée → catégorie « Modération » (catch-all
  // d'administration : salons, serveur, émojis, stickers, invitations, messages).
  'messages-supprimes': 'moderation',
  'messages-modifies': 'moderation',
  salons: 'moderation',
  serveur: 'moderation',
  emojis: 'moderation',
  stickers: 'moderation',
  invitations: 'moderation',
  // Activité vocale (arrivées/départs des salons vocaux) → « Arrivées et départs ».
  vocaux: 'members',
  // Catégories secondaires réellement supprimées (événement ignoré).
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

/** Envoie l'embed dans le salon de la catégorie résolue (déjà vérifiée activée). */
/**
 * Persiste une entrée au journal borné **et** notifie l'interface web.
 * Point de passage unique de `log` et `record` : c'est ici que l'interface web
 * apprend les événements (nouveau ticket, détection de protection…) sans
 * qu'aucun module métier n'ait à la connaître.
 */
function persist(guild, entry) {
  logStore.append(guild.id, entry);
  try {
    webNotifier.publish(NOTIFIED_CATEGORIES[entry.category] ?? 'log', {
      guild: { id: guild.id, name: guild.name },
      category: entry.category,
      title: entry.title,
      summary: entry.summary,
      userTag: entry.userTag ?? null,
    });
  } catch {
    /* la notification web ne doit jamais gêner la journalisation */
  }
}

async function dispatch(guild, resolved, embed) {
  const settings = repository.getSettings(guild.id);
  let channel = settings.channels[resolved] ? guild.channels.cache.get(settings.channels[resolved]) : null;
  if (!channel) {
    const definition = logCategories[resolved];
    channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === definition?.channelName) ?? null;
  }
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => null);
}

/**
 * Consigne un embed pré-construit (compatibilité : point d'entrée historique).
 * Persiste aussi une entrée compacte dans le journal (stats + interface web).
 */
async function log(guild, key, embed) {
  const resolved = resolveKey(key);
  if (!resolved || !guild || !isEnabled(guild.id, resolved)) return;

  persist(guild, {
    category: resolved,
    title: embed?.data?.title ?? '',
    summary: embed?.data?.description ?? '',
    userTag: embed?.data?.author?.name ?? null,
  });
  await dispatch(guild, resolved, embed);
}

/**
 * Point d'entrée **enrichi** des logs d'événements serveur : construit un embed
 * homogène (émoji système + horodatage + membre + modérateur), applique
 * l'anti-doublon, persiste au journal et envoie dans le salon de la catégorie.
 *
 * Aucun module ne doit envoyer d'embed de log directement : tout passe par ici
 * (ou par `log`).
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} key - Clé de catégorie (réelle ou héritée).
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.emoji] - Clé d'émoji système (config/emojis).
 * @param {number} [opts.color]
 * @param {string} [opts.description]
 * @param {{name:string,value:string,inline?:boolean}[]} [opts.fields]
 * @param {import('discord.js').User} [opts.user] - Membre concerné.
 * @param {import('discord.js').User} [opts.moderator] - Modérateur responsable (audit).
 * @param {string} [opts.moderatorReason]
 * @param {string} [opts.signature] - Clé d'anti-doublon (défaut : titre+cible).
 */
async function record(guild, key, opts) {
  const resolved = resolveKey(key);
  if (!resolved || !guild || !isEnabled(guild.id, resolved)) return;

  const target = opts.user ?? null;
  const signature = opts.signature ?? `${guild.id}:${resolved}:${opts.title}:${target?.id ?? ''}`;
  if (!logThrottle.shouldLog(signature)) return;

  const fields = [...(opts.fields ?? [])];
  if (opts.moderator) {
    fields.push({
      name: t('logs.events.moderator'),
      value: `${opts.moderator.tag} (\`${opts.moderator.id}\`)${opts.moderatorReason ? ` — ${opts.moderatorReason}` : ''}`,
      inline: true,
    });
  }

  const title = opts.emoji ? `${emojis.get(opts.emoji)} ${opts.title}` : opts.title;
  const embed = logEventEmbed({
    title,
    color: opts.color ?? COLORS.LOG_NEUTRAL,
    description: opts.description ?? null,
    fields,
    user: target,
  });

  persist(guild, {
    category: resolved,
    title: opts.title,
    summary: opts.description ?? '',
    userId: target?.id ?? null,
    userTag: target?.tag ?? null,
    moderatorId: opts.moderator?.id ?? null,
    moderatorTag: opts.moderator?.tag ?? null,
  });
  await dispatch(guild, resolved, embed);
}

/** Compteurs d'événements par catégorie (journal persistant). */
function stats(guildId) {
  return logStore.statsByCategory(guildId);
}

module.exports = {
  isControlled,
  isEnabled,
  getStatus,
  enableCategories,
  disableCategories,
  log,
  record,
  stats,
  resolveKey,
  LEGACY_ALIASES,
  LOGS_PARENT_NAME,
};
