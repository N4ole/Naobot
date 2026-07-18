/**
 * Moteur de la protection anti-publicité (invitations Discord).
 *
 * Système **dédié et indépendant** des autres protections : détecte les
 * invitations Discord (discord.gg, discord.com/invite, raccourcisseurs et
 * variantes vanity), y compris lorsqu'elles sont dissimulées dans le texte
 * (espaces, « dot », caractères invisibles) ou présentes dans un embed.
 *
 * Réaction par défaut (protection désactivée par défaut) : suppression du
 * message, notification discrète de l'utilisateur, journalisation dans la
 * catégorie de logs « protections » et incrément des statistiques.
 *
 * L'architecture prévoit les exemptions futures (rôles, utilisateurs,
 * serveurs autorisés) via le repository et le middleware ; seule la liste des
 * salons exemptés est exposée dans cette itération.
 */
const repository = require('../../database/antipubRepository');
const logService = require('../logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { isExemptChannel, isExemptMember, canModerateMessages } = require('../../middlewares/antipub/antipubAccess');
const { t } = require('../../utils/helpers/i18n');

/** Durée d'affichage de la notification discrète (ms) avant auto-suppression. */
const NOTIFY_TTL_MS = 8000;

/**
 * Hôtes d'invitations Discord (hôte/code). Couvre les liens officiels, les
 * sous-domaines (canary/ptb), les raccourcisseurs et les redirecteurs vanity.
 */
const INVITE_REGEX =
  /(?:https?:\/\/)?(?:(?:canary|ptb|www)\.)?(?:discord(?:app)?\.com\/invite|discord\.gg|dsc\.gg|invite\.gg|discord\.me|discord\.io|discord\.li|discord\.st)\/([\w-]+)/i;

/**
 * Normalise un contenu pour révéler les invitations dissimulées :
 * caractères invisibles retirés, « (dot) »/« point » convertis en « . »,
 * « [.] » nettoyé, et espaces autour des « . » et « / » supprimés.
 */
function normalize(content) {
  return content
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\ufeff\u2060]/g, '')
    .replace(/[[({]\s*\.\s*[\])}]/g, '.')
    .replace(/\s*\(?\[?\s*(?:dot|point|d0t)\s*\)?\]?\s*/gi, '.')
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s*\/\s*/g, '/');
}

/**
 * Analyse un contenu textuel et retourne l'invitation détectée, ou null.
 * @returns {{ code: string|null, match: string } | null}
 */
function analyze(content) {
  if (!content || typeof content !== 'string') return null;
  for (const text of [content, normalize(content)]) {
    const match = text.match(INVITE_REGEX);
    if (match) {
      return { code: (match[1] ?? '').slice(0, 64) || null, match: match[0].slice(0, 100) };
    }
  }
  return null;
}

/** Concatène les champs textuels d'un embed (titre, description, url, champs…). */
function embedText(embed) {
  const parts = [embed.title, embed.description, embed.url, embed.author?.name, embed.footer?.text];
  for (const field of embed.fields ?? []) parts.push(field.name, field.value);
  return parts.filter(Boolean).join(' ');
}

/**
 * Analyse un message complet : contenu puis embeds (invitations en preview).
 * @returns {{ code: string|null, match: string } | null}
 */
function analyzeMessage(message) {
  const inContent = analyze(message.content ?? '');
  if (inContent) return inContent;
  for (const embed of message.embeds ?? []) {
    const found = analyze(embedText(embed));
    if (found) return found;
  }
  return null;
}

/** Met à jour la date et l'auteur de la dernière modification. */
function touch(config, byUserId) {
  config.lastModifiedAt = new Date().toISOString();
  config.lastModifiedBy = byUserId ?? null;
}

function getConfig(guildId) {
  return repository.getConfig(guildId);
}

function isEnabled(guildId) {
  return repository.getConfig(guildId).enabled === true;
}

function listExemptChannels(guildId) {
  return repository.getConfig(guildId).exemptChannels;
}

/** Active ou désactive la protection (persistant + journalisé). */
async function setEnabled(guild, enabled, byUser) {
  const config = repository.getConfig(guild.id);
  const changed = config.enabled !== enabled;
  config.enabled = enabled;
  touch(config, byUser?.id);
  repository.saveConfig(guild.id, config);
  if (changed) await logToggle(guild, enabled, byUser);
  return { config, changed };
}

/** Ajoute un salon à la liste des salons exemptés. */
async function addExemptChannel(guild, channel, byUser) {
  const config = repository.getConfig(guild.id);
  if (config.exemptChannels.includes(channel.id)) return { config, added: false };
  config.exemptChannels.push(channel.id);
  touch(config, byUser?.id);
  repository.saveConfig(guild.id, config);
  await logWhitelist(guild, 'whitelistAdd', channel, byUser);
  return { config, added: true };
}

/** Retire un salon de la liste des salons exemptés. */
async function removeExemptChannel(guild, channelId, byUser) {
  const config = repository.getConfig(guild.id);
  if (!config.exemptChannels.includes(channelId)) return { config, removed: false };
  config.exemptChannels = config.exemptChannels.filter((id) => id !== channelId);
  touch(config, byUser?.id);
  repository.saveConfig(guild.id, config);
  await logWhitelist(guild, 'whitelistRemove', { id: channelId }, byUser);
  return { config, removed: true };
}

/**
 * Vérifie un contenu **sortant** (commandes de type say) avant publication.
 * @returns {{ code: string|null, match: string } | null} détection si la
 *   publication doit être bloquée (protection active, salon non exempté).
 */
function checkOutgoing(guild, channel, content) {
  const config = repository.getConfig(guild.id);
  if (!config.enabled) return null;
  if (isExemptChannel(config, channel?.id)) return null;
  return analyze(content ?? '');
}

/** Notification discrète et éphémère de l'utilisateur (auto-supprimée). */
async function notifyUser(message) {
  const sent = await message.channel
    .send({ content: t('antipub.notify', { user: `<@${message.author.id}>` }), allowedMentions: { users: [message.author.id] } })
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
    match: detection.match,
    deleted,
    at: new Date().toISOString(),
  });
  repository.saveConfig(guild.id, config);

  await notifyUser(message).catch(() => null);
  await logDetection(guild, message, detection, deleted, errored).catch(() => null);
  return { deleted };
}

/**
 * Point d'entrée appelé par les écouteurs (création + modification).
 * @returns {Promise<boolean>} true si une action a été prise.
 */
async function handleMessage(message) {
  if (!message.guild || message.author?.bot) return false;
  const config = repository.getConfig(message.guild.id);
  if (!config.enabled) return false;
  if (isExemptChannel(config, message.channel?.id)) return false;
  if (isExemptMember(config, message.member)) return false;

  const detection = analyzeMessage(message);
  if (!detection) return false;
  await applyReaction(message, detection);
  return true;
}

// --- Journalisation (catégorie de logs « protections ») ---

function logProtection(guild, action, { color, user, fields }) {
  return logService.log(
    guild,
    'protections',
    logEventEmbed({ title: `📢 ${t(`antipub.logs.${action}`)}`, color, user, fields }),
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
  const action = deleted ? t('antipub.field.deleted') : errored ? t('antipub.field.error') : t('protections.field.notDeleted');
  return logProtection(guild, 'detection', {
    color: COLORS.WARNING,
    user: message.author,
    fields: [
      { name: t('common.channel'), value: `${message.channel}`, inline: true },
      { name: t('antipub.field.invite'), value: `\`${detection.match}\``, inline: true },
      { name: t('protections.field.action'), value: action },
    ],
  });
}

module.exports = {
  NOTIFY_TTL_MS,
  INVITE_REGEX,
  normalize,
  analyze,
  analyzeMessage,
  getConfig,
  isEnabled,
  listExemptChannels,
  setEnabled,
  addExemptChannel,
  removeExemptChannel,
  checkOutgoing,
  handleMessage,
};
