/**
 * Protection anti-contenus sensibles — **service central** : orchestration de
 * la configuration, de la réaction, des logs et des statistiques. La logique de
 * **détection** vit dans `sensitiveMatcher` (fonctions pures) ; aucun écouteur
 * ne contient de logique de détection.
 *
 * Sûreté (bot public, multi-serveurs) :
 *   - jamais bloquant : tout est enveloppé dans des try/catch ; une erreur est
 *     journalisée (logs internes du bot) et n'interrompt ni le message ni le bot ;
 *   - jamais de double action : un garde en mémoire (`acted`) empêche de traiter
 *     deux fois le même message (création + modification, courses) ;
 *   - lectures sans accès disque par message (config en cache mémoire) ;
 *   - désactivé par défaut, indépendant des autres protections.
 */
const repository = require('../../database/antisensitiveRepository');
const matcher = require('./sensitiveMatcher');
const logService = require('../logs/logService');
const errorLogService = require('../errors/errorLogService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const emojis = require('../../config/emojis');
const COLORS = require('../../utils/constants/colors');
const { CATEGORIES } = require('../../utils/constants/sensitiveContent');
const { isExemptChannel, isExemptCategory, isExemptMember, canModerateMessages } = require('../../middlewares/antisensitive/antisensitiveAccess');
const { t } = require('../../utils/helpers/i18n');

const NOTIFY_TTL_MS = 8000;
/** Anti-double-action : ids de messages déjà traités (TTL court). */
const acted = new Set();
const ACTED_TTL_MS = 15000;

function markActed(messageId) {
  acted.add(messageId);
  setTimeout(() => acted.delete(messageId), ACTED_TTL_MS).unref?.();
}

/** Concatène les champs textuels d'un embed (analyse des embeds/webhooks). */
function embedText(embed) {
  const parts = [embed.title, embed.description, embed.url, embed.author?.name, embed.footer?.text];
  for (const field of embed.fields ?? []) parts.push(field.name, field.value);
  return parts.filter(Boolean).join(' ');
}

/** Analyse le contenu puis les embeds d'un message. */
function analyzeMessage(message, config) {
  const found = matcher.analyze(message.content ?? '', config);
  if (found) return found;
  for (const embed of message.embeds ?? []) {
    const inEmbed = matcher.analyze(embedText(embed), config);
    if (inEmbed) return inEmbed;
  }
  return null;
}

function touch(config, byUserId) {
  config.lastModifiedAt = new Date().toISOString();
  config.lastModifiedBy = byUserId ?? null;
}

const getConfig = (guildId) => repository.getConfig(guildId);
const isEnabled = (guildId) => repository.isEnabled(guildId);
const listExemptChannels = (guildId) => repository.getConfig(guildId).exemptChannels;

/** Sauvegarde une modification de config (avec horodatage/auteur). */
function persist(guild, config, byUser) {
  touch(config, byUser?.id);
  repository.saveConfig(guild.id, config);
}

async function setEnabled(guild, enabled, byUser) {
  const config = repository.getConfig(guild.id);
  const changed = config.enabled !== enabled;
  config.enabled = enabled;
  persist(guild, config, byUser);
  if (changed) await logToggle(guild, enabled, byUser).catch(() => null);
  return { config, changed };
}

/** Active/désactive une catégorie de contenu (porn/gore/violence/danger). */
async function setCategory(guild, category, enabled, byUser) {
  const config = repository.getConfig(guild.id);
  if (!(category in config.categories)) return { config, changed: false, unknown: true };
  const changed = config.categories[category] !== enabled;
  config.categories[category] = enabled;
  persist(guild, config, byUser);
  return { config, changed };
}

/** Définit la réaction (delete | notify | log). */
async function setAction(guild, action, byUser) {
  const config = repository.getConfig(guild.id);
  if (!repository.ACTIONS.includes(action)) return { config, changed: false, unknown: true };
  const changed = config.action !== action;
  config.action = action;
  persist(guild, config, byUser);
  return { config, changed };
}

/** Personnalise (ou réinitialise) le message d'avertissement. */
async function setWarnMessage(guild, message, byUser) {
  const config = repository.getConfig(guild.id);
  config.warnMessage = message && message.trim() ? message.trim().slice(0, 500) : null;
  config.warnUser = true;
  persist(guild, config, byUser);
  return { config };
}

/** Fabrique des mutateurs add/remove pour une liste d'exemption/blocage. */
function makeListMutators(field, logAction) {
  return {
    async add(guild, value, byUser) {
      const config = repository.getConfig(guild.id);
      const normalized = field.endsWith('Domains') || field.endsWith('Keywords') ? String(value).toLowerCase() : String(value);
      if (config[field].some((e) => String(e).toLowerCase() === normalized.toLowerCase())) return { config, added: false };
      config[field].push(normalized);
      persist(guild, config, byUser);
      if (logAction) await logList(guild, logAction.add, normalized, byUser).catch(() => null);
      return { config, added: true };
    },
    async remove(guild, value, byUser) {
      const config = repository.getConfig(guild.id);
      const v = String(value).toLowerCase();
      const before = config[field].length;
      config[field] = config[field].filter((e) => String(e).toLowerCase() !== v);
      if (config[field].length === before) return { config, removed: false };
      persist(guild, config, byUser);
      if (logAction) await logList(guild, logAction.remove, String(value), byUser).catch(() => null);
      return { config, removed: true };
    },
  };
}

const exemptChannels = makeListMutators('exemptChannels', { add: 'whitelistAdd', remove: 'whitelistRemove' });
const exemptCategories = makeListMutators('exemptCategories');
const exemptRoles = makeListMutators('exemptRoles');
const exemptUsers = makeListMutators('exemptUsers');
const blockedDomains = makeListMutators('blockedDomains', { add: 'blacklistAdd', remove: 'blacklistRemove' });
const allowedDomains = makeListMutators('allowedDomains');
const blockedKeywords = makeListMutators('blockedKeywords');

// Compat : anciens noms (commande / tests existants).
const addExemptChannel = (guild, channel, byUser) => exemptChannels.add(guild, channel.id, byUser);
const removeExemptChannel = (guild, channelId, byUser) => exemptChannels.remove(guild, channelId, byUser);

/** Vérifie un contenu **sortant** (commandes de type say) avant publication. */
function checkOutgoing(guild, channel, content) {
  try {
    const config = repository.getConfig(guild.id);
    if (!config.enabled) return null;
    if (isExemptChannel(config, channel?.id) || isExemptCategory(config, channel?.parentId)) return null;
    return matcher.analyze(content ?? '', config);
  } catch {
    return null;
  }
}

async function notifyUser(message, config) {
  if (!config.warnUser) return;
  const content = (config.warnMessage ?? t('antisensitive.notify', { user: '{user}' })).replace('{user}', `<@${message.author.id}>`);
  const sent = await message.channel.send({ content, allowedMentions: { users: [message.author.id] } }).catch(() => null);
  if (sent) setTimeout(() => sent.delete().catch(() => null), NOTIFY_TTL_MS).unref?.();
}

/** Applique la réaction configurée (delete | notify | log) + logs + stats. */
async function applyReaction(message, detection, config) {
  const guild = message.guild;
  let deleted = false;
  let errored = false;

  if (config.action === 'delete' && canModerateMessages(guild, message.channel)) {
    deleted = await message.delete().then(() => true).catch(() => { errored = true; return false; });
  }

  config.stats.detections += 1;
  if (deleted) config.stats.deleted += 1;
  if (errored) config.stats.errors += 1;
  repository.pushDetection(config, {
    userId: message.author.id,
    userTag: message.author.tag,
    channelId: message.channel.id,
    category: detection.category,
    method: detection.method,
    match: detection.match,
    action: config.action,
    deleted,
    at: new Date().toISOString(),
  });
  repository.saveConfig(guild.id, config);

  if (config.action !== 'log') await notifyUser(message, config).catch(() => null);
  await logDetection(guild, message, detection, config, deleted, errored).catch(() => null);
  return { deleted };
}

/** Point d'entrée des écouteurs (création + modification + embeds/webhooks). */
async function handleMessage(message) {
  try {
    if (!message?.guild) return false;
    // Ignore le bot lui-même ; traite les humains et les webhooks (mais pas les
    // autres bots applicatifs, pour éviter le bruit).
    const selfId = message.client?.user?.id;
    if (message.author?.id && message.author.id === selfId) return false;
    if (message.author?.bot && !message.webhookId) return false;

    if (acted.has(message.id)) return false; // anti-double-action
    if (!repository.isEnabled(message.guild.id)) return false; // voie rapide

    const config = repository.getConfig(message.guild.id);
    if (isExemptChannel(config, message.channel?.id)) return false;
    if (isExemptCategory(config, message.channel?.parentId)) return false;
    // Messages de webhook : pas de membre à exempter, mais leur contenu est
    // bien analysé (l'exemption membre ne s'applique qu'aux vrais membres).
    if (message.member && isExemptMember(config, message.member)) return false;

    const detection = analyzeMessage(message, config);
    if (!detection) return false;

    markActed(message.id);
    await applyReaction(message, detection, config);
    return true;
  } catch (error) {
    // Ne jamais planter : journaliser dans les logs internes du bot et continuer.
    errorLogService.report({ type: 'antisensitive', error, guild: message?.guild, channel: message?.channel, user: message?.author, module: 'antisensitiveService' });
    return false;
  }
}

// --- Journalisation (catégorie de logs « protections ») ---

function logProtection(guild, action, { color, user, fields }) {
  return logService.log(
    guild,
    'protections',
    logEventEmbed({ title: `${emojis.get('sleepy')} ${t(`antisensitive.logs.${action}`)}`, color, user, fields }),
  );
}

function logToggle(guild, enabled, user) {
  return logProtection(guild, enabled ? 'enabled' : 'disabled', { color: enabled ? COLORS.LOG_CREATE : COLORS.LOG_DELETE, user, fields: [] });
}

function logList(guild, action, value, user) {
  const isChannel = action.startsWith('whitelist');
  return logProtection(guild, action, {
    color: action.endsWith('Add') ? COLORS.LOG_CREATE : COLORS.LOG_DELETE,
    user,
    fields: [{ name: isChannel ? t('common.channel') : t('antisensitive.field.domain'), value: isChannel ? `<#${value}>` : `\`${value}\``, inline: true }],
  });
}

function logDetection(guild, message, detection, config, deleted, errored) {
  const action = deleted
    ? t('antisensitive.field.deleted')
    : errored
      ? t('antisensitive.field.error')
      : config.action === 'log'
        ? t('antisensitive.field.logged')
        : t('protections.field.notDeleted');
  const cat = CATEGORIES[detection.category];
  return logProtection(guild, 'detection', {
    color: COLORS.WARNING,
    user: message.author,
    fields: [
      { name: t('common.channel'), value: `${message.channel}`, inline: true },
      { name: t('antisensitive.field.category'), value: cat ? `${cat.emoji} ${cat.label}` : detection.category, inline: true },
      { name: t('antisensitive.field.method'), value: t(`antisensitive.method.${detection.method}`), inline: true },
      { name: t('antisensitive.field.detected'), value: `\`${detection.match}\``, inline: true },
      { name: t('protections.field.action'), value: action, inline: true },
    ],
  });
}

module.exports = {
  NOTIFY_TTL_MS,
  analyze: matcher.analyze,
  analyzeMessage,
  getConfig,
  isEnabled,
  listExemptChannels,
  setEnabled,
  setCategory,
  setAction,
  setWarnMessage,
  exemptChannels,
  exemptCategories,
  exemptRoles,
  exemptUsers,
  blockedDomains,
  allowedDomains,
  blockedKeywords,
  addExemptChannel,
  removeExemptChannel,
  checkOutgoing,
  handleMessage,
};
