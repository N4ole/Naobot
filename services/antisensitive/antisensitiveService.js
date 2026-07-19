/**
 * Moteur de la protection anti-contenus sensibles : détecte les liens vers des
 * sites pour adultes, violents, gore ou choquants.
 *
 * Détection (hors ligne, sans requête réseau) : extraction des URLs d'un
 * message (y compris obfusquées : espaces, « (dot) », caractères invisibles),
 * puis comparaison de l'**hôte et de ses sous-domaines** à une liste fermée
 * (utils/constants/sensitiveDomains) complétée par une **liste configurable par
 * serveur** (`blockedDomains`), en respectant les **domaines autorisés**
 * (`allowedDomains`).
 *
 * L'architecture est **extensible** : `analyze` applique une chaîne de matchers
 * ; on peut y brancher plus tard des sources externes (API de réputation,
 * listes noires distantes, modèles d'analyse) et la résolution des liens
 * raccourcis / redirections.
 *
 * Réaction par défaut (protection désactivée par défaut) : suppression du
 * message, notification discrète, journalisation « protections » et
 * statistiques. Sanctions/warns automatiques et notifications de modérateurs
 * prévus (extensions).
 */
const repository = require('../../database/antisensitiveRepository');
const logService = require('../logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { CATEGORIES, domainCategoryMap } = require('../../utils/constants/sensitiveDomains');
const { isExemptChannel, isExemptMember, canModerateMessages } = require('../../middlewares/antisensitive/antisensitiveAccess');
const { t } = require('../../utils/helpers/i18n');

const NOTIFY_TTL_MS = 8000;
const STATIC_DOMAINS = domainCategoryMap();

/** Normalise un contenu pour révéler les URLs dissimulées. */
function normalize(content) {
  return content
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\ufeff\u2060]/g, '')
    .replace(/[[({]\s*\.\s*[\])}]/g, '.')
    .replace(/\s*\(?\[?\s*(?:dot|point|d0t)\s*\)?\]?\s*/gi, '.')
    .replace(/\s*\.\s*/g, '.');
}

/** Extrait les hôtes (domaines) présents dans un texte. */
function extractHosts(text) {
  const hosts = [];
  // URLs avec schéma, ou domaines nus (word.tld[/...]).
  const regex = /(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#]\S*)?/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const host = match[1].toLowerCase().replace(/\.$/, '');
    if (host.includes('.')) hosts.push(host);
  }
  return hosts;
}

/** Un hôte correspond-il au domaine (ou à un sous-domaine) ? */
function hostMatchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Catégorie d'un hôte selon la liste statique + les domaines bloqués du serveur. */
function categoryForHost(host, config) {
  // Domaines explicitement autorisés : jamais signalés.
  if (config.allowedDomains.some((domain) => hostMatchesDomain(host, domain.toLowerCase()))) return null;
  for (const [domain, category] of STATIC_DOMAINS) {
    if (hostMatchesDomain(host, domain)) return category;
  }
  if (config.blockedDomains.some((domain) => hostMatchesDomain(host, domain.toLowerCase()))) return 'shock';
  return null;
}

/**
 * Analyse un contenu et retourne la première correspondance sensible, ou null.
 * @returns {{ host: string, category: string, match: string } | null}
 */
function analyze(content, config) {
  if (!content || typeof content !== 'string') return null;
  for (const text of [content, normalize(content)]) {
    for (const host of extractHosts(text)) {
      const category = categoryForHost(host, config);
      if (category) return { host, category, match: host.slice(0, 100) };
    }
  }
  return null;
}

/** Concatène les champs textuels d'un embed. */
function embedText(embed) {
  const parts = [embed.title, embed.description, embed.url, embed.author?.name, embed.footer?.text];
  for (const field of embed.fields ?? []) parts.push(field.name, field.value);
  return parts.filter(Boolean).join(' ');
}

/** Analyse le contenu puis les embeds d'un message. */
function analyzeMessage(message, config) {
  const inContent = analyze(message.content ?? '', config);
  if (inContent) return inContent;
  for (const embed of message.embeds ?? []) {
    const found = analyze(embedText(embed), config);
    if (found) return found;
  }
  return null;
}

function touch(config, byUserId) {
  config.lastModifiedAt = new Date().toISOString();
  config.lastModifiedBy = byUserId ?? null;
}

const getConfig = (guildId) => repository.getConfig(guildId);
const isEnabled = (guildId) => repository.getConfig(guildId).enabled === true;
const listExemptChannels = (guildId) => repository.getConfig(guildId).exemptChannels;

async function setEnabled(guild, enabled, byUser) {
  const config = repository.getConfig(guild.id);
  const changed = config.enabled !== enabled;
  config.enabled = enabled;
  touch(config, byUser?.id);
  repository.saveConfig(guild.id, config);
  if (changed) await logToggle(guild, enabled, byUser);
  return { config, changed };
}

async function addExemptChannel(guild, channel, byUser) {
  const config = repository.getConfig(guild.id);
  if (config.exemptChannels.includes(channel.id)) return { config, added: false };
  config.exemptChannels.push(channel.id);
  touch(config, byUser?.id);
  repository.saveConfig(guild.id, config);
  await logWhitelist(guild, 'whitelistAdd', channel, byUser);
  return { config, added: true };
}

async function removeExemptChannel(guild, channelId, byUser) {
  const config = repository.getConfig(guild.id);
  if (!config.exemptChannels.includes(channelId)) return { config, removed: false };
  config.exemptChannels = config.exemptChannels.filter((id) => id !== channelId);
  touch(config, byUser?.id);
  repository.saveConfig(guild.id, config);
  await logWhitelist(guild, 'whitelistRemove', { id: channelId }, byUser);
  return { config, removed: true };
}

/** Vérifie un contenu **sortant** (commandes de type say) avant publication. */
function checkOutgoing(guild, channel, content) {
  const config = repository.getConfig(guild.id);
  if (!config.enabled) return null;
  if (isExemptChannel(config, channel?.id)) return null;
  return analyze(content ?? '', config);
}

async function notifyUser(message) {
  const sent = await message.channel
    .send({ content: t('antisensitive.notify', { user: `<@${message.author.id}>` }), allowedMentions: { users: [message.author.id] } })
    .catch(() => null);
  if (sent) setTimeout(() => sent.delete().catch(() => null), NOTIFY_TTL_MS);
}

/** Suppression + notification + logs + statistiques. */
async function applyReaction(message, detection) {
  const guild = message.guild;
  const config = repository.getConfig(guild.id);
  let deleted = false;
  let errored = false;
  if (canModerateMessages(guild, message.channel)) {
    deleted = await message
      .delete()
      .then(() => true)
      .catch(() => {
        errored = true;
        return false;
      });
  }

  config.stats.detections += 1;
  if (deleted) config.stats.deleted += 1;
  if (errored) config.stats.errors += 1;
  repository.pushDetection(config, {
    userId: message.author.id,
    channelId: message.channel.id,
    host: detection.host,
    category: detection.category,
    deleted,
    at: new Date().toISOString(),
  });
  repository.saveConfig(guild.id, config);

  await notifyUser(message).catch(() => null);
  await logDetection(guild, message, detection, deleted, errored).catch(() => null);
  return { deleted };
}

/** Point d'entrée des écouteurs (création + modification). */
async function handleMessage(message) {
  if (!message.guild || message.author?.bot) return false;
  const config = repository.getConfig(message.guild.id);
  if (!config.enabled) return false;
  if (isExemptChannel(config, message.channel?.id)) return false;
  if (isExemptMember(config, message.member)) return false;

  const detection = analyzeMessage(message, config);
  if (!detection) return false;
  await applyReaction(message, detection);
  return true;
}

// --- Journalisation (catégorie de logs « protections ») ---

function logProtection(guild, action, { color, user, fields }) {
  return logService.log(
    guild,
    'protections',
    logEventEmbed({ title: `🔞 ${t(`antisensitive.logs.${action}`)}`, color, user, fields }),
  );
}

function logToggle(guild, enabled, user) {
  return logProtection(guild, enabled ? 'enabled' : 'disabled', {
    color: enabled ? COLORS.LOG_CREATE : COLORS.LOG_DELETE,
    user,
    fields: [],
  });
}

function logWhitelist(guild, action, channel, user) {
  return logProtection(guild, action, {
    color: action === 'whitelistAdd' ? COLORS.LOG_CREATE : COLORS.LOG_DELETE,
    user,
    fields: [{ name: t('common.channel'), value: `<#${channel.id}>`, inline: true }],
  });
}

function logDetection(guild, message, detection, deleted, errored) {
  const action = deleted ? t('antisensitive.field.deleted') : errored ? t('antisensitive.field.error') : t('protections.field.notDeleted');
  const cat = CATEGORIES[detection.category];
  return logProtection(guild, 'detection', {
    color: COLORS.WARNING,
    user: message.author,
    fields: [
      { name: t('common.channel'), value: `${message.channel}`, inline: true },
      { name: t('antisensitive.field.category'), value: cat ? `${cat.emoji} ${cat.label}` : detection.category, inline: true },
      { name: t('antisensitive.field.domain'), value: `\`${detection.host}\``, inline: true },
      { name: t('protections.field.action'), value: action },
    ],
  });
}

module.exports = {
  NOTIFY_TTL_MS,
  normalize,
  analyze,
  analyzeMessage,
  extractHosts,
  getConfig,
  isEnabled,
  listExemptChannels,
  setEnabled,
  addExemptChannel,
  removeExemptChannel,
  checkOutgoing,
  handleMessage,
};
