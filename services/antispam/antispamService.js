/**
 * Moteur de détection anti-spam intelligent.
 *
 * Analyse en mémoire une fenêtre glissante des messages récents par membre
 * (et globalement par serveur pour les raids). Détecte : flood (fréquence),
 * messages répétés, messages identiques multi-salons, mentions abusives,
 * suites de caractères répétitifs, tentatives de contournement (via
 * normalisation), et raids (afflux de comptes récents).
 *
 * Réaction par défaut : suppression du message + notification des
 * modérateurs (logs). L'architecture permet de configurer d'autres
 * sanctions ultérieurement (warn, timeout, mute) : voir REACTIONS et
 * applyReaction — il suffira de rendre le choix persistant par serveur.
 */
const protectionService = require('../protections/protectionService');
const globalReputationService = require('../reputation/globalReputationService');
const { isExempt, canModerateMessages } = require('../../middlewares/protections/protectionAccess');
const { t } = require('../../utils/helpers/i18n');

// --- Seuils (constantes : futures options configurables par serveur) ---
const WINDOW_MS = 8000; // fenêtre d'analyse glissante
const MAX_MESSAGES = 5; // messages max par fenêtre (flood)
const MAX_DUPLICATES = 3; // même contenu répété
const MAX_CHANNELS = 3; // même contenu sur N salons
const MAX_MENTIONS = 5; // mentions (users + rôles) par message
const RAID_WINDOW_MS = 10000; // fenêtre de détection de raid
const RAID_THRESHOLD = 8; // messages de comptes récents avant alerte raid
const YOUNG_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000; // « compte récent »

/** Réactions possibles (extensible : sanctions configurables plus tard). */
const REACTIONS = { DELETE: 'delete', WARN: 'warn', TIMEOUT: 'timeout', MUTE: 'mute', NOTIFY: 'notify' };

/** Historique par membre : Map<`${guildId}:${userId}`, Array<entry>>. */
const history = new Map();
/** Horodatages de messages « à risque » par serveur (détection de raid). */
const raidTracker = new Map();

/**
 * Normalise un contenu pour neutraliser les tentatives de contournement :
 * minuscule, suppression des caractères invisibles, des diacritiques, de la
 * ponctuation et des espaces, et compression des caractères répétés.
 */
function normalizeContent(content) {
  return content
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/[^a-z0-9]/g, '');
}

function pruneWindow(entries, now, windowMs) {
  return entries.filter((entry) => now - entry.at < windowMs);
}

/** true si le message contient une suite de caractères répétitifs anormale. */
function hasRepeatedChars(content) {
  return /(.)\1{9,}/.test(content) || /(\S{1,3})\1{6,}/.test(content);
}

/**
 * Analyse un message et retourne le motif détecté, ou null.
 * @returns {{ reason: string } | null}
 */
function analyze(message) {
  const now = Date.now();
  const key = `${message.guild.id}:${message.author.id}`;
  const entries = pruneWindow(history.get(key) ?? [], now, WINDOW_MS);

  const content = message.content ?? '';
  const normalized = normalizeContent(content);
  const mentionCount = (message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0);
  const everyone = message.mentions?.everyone ?? false;

  entries.push({ at: now, normalized, channelId: message.channel.id });
  history.set(key, entries);

  // Raid : afflux de messages de comptes récents à l'échelle du serveur.
  const accountAge = now - message.author.createdTimestamp;
  if (accountAge < YOUNG_ACCOUNT_MS) {
    const stamps = pruneWindow((raidTracker.get(message.guild.id) ?? []).map((at) => ({ at })), now, RAID_WINDOW_MS).map((e) => e.at);
    stamps.push(now);
    raidTracker.set(message.guild.id, stamps);
    if (stamps.length >= RAID_THRESHOLD) return { reason: 'raid' };
  }

  if (everyone || mentionCount >= MAX_MENTIONS) return { reason: 'mentions' };
  if (hasRepeatedChars(content)) return { reason: 'charspam' };
  if (entries.length >= MAX_MESSAGES) return { reason: 'flood' };

  if (normalized.length > 0) {
    const sameContent = entries.filter((entry) => entry.normalized === normalized);
    if (sameContent.length >= MAX_DUPLICATES) return { reason: 'repeat' };
    const channels = new Set(sameContent.map((entry) => entry.channelId));
    if (channels.size >= MAX_CHANNELS) return { reason: 'crosspost' };
  }
  return null;
}

/**
 * Applique la réaction par défaut (suppression + notification). Point
 * d'extension : brancher ici les sanctions configurables (warn/timeout/mute).
 */
async function applyReaction(message, detection) {
  const guild = message.guild;
  let deleted = false;
  if (canModerateMessages(guild, message.channel)) {
    deleted = await message.delete().then(() => true).catch(() => false);
  }
  protectionService.bumpStat(guild.id, 'spamDetections');
  if (detection.reason === 'raid') protectionService.bumpStat(guild.id, 'raidsBlocked');

  await protectionService.logProtection(guild, detection.reason === 'raid' ? 'raid' : 'spam', {
    color: detection.reason === 'raid' ? protectionService.COLORS.ERROR : protectionService.COLORS.WARNING,
    user: message.author,
    fields: [
      { name: t('protections.field.reason'), value: t(`protections.spam.${detection.reason}`), inline: true },
      { name: t('common.channel'), value: `${message.channel}`, inline: true },
      { name: t('protections.field.action'), value: deleted ? t('protections.field.deleted') : t('protections.field.notDeleted') },
    ],
  });
  // Réputation globale (plafonnée par serveur/jour côté service).
  globalReputationService.record({ guild, user: message.author, action: 'antispam', reason: detection.reason, automatic: true }).catch(() => null);
  return { deleted };
}

/**
 * Point d'entrée appelé par l'écouteur de messages.
 * @returns {Promise<boolean>} true si une action a été prise
 */
async function handleMessage(message) {
  if (!message.guild || message.author?.bot) return false;
  if (!protectionService.isEnabled(message.guild.id, 'antispam')) return false;
  if (isExempt(message.member)) return false;

  const detection = analyze(message);
  if (!detection) return false;
  await applyReaction(message, detection);
  return true;
}

module.exports = { REACTIONS, normalizeContent, analyze, handleMessage };
