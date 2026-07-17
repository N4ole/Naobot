/**
 * Moteur de détection anti-link.
 *
 * Détecte dans les messages : liens externes, invitations Discord,
 * raccourcisseurs d'URL et domaines suspects. Réaction par défaut :
 * suppression du message + notification des modérateurs (logs).
 *
 * Une liste blanche (WHITELIST) est prévue pour de futurs développements
 * (domaines autorisés par serveur) ; l'architecture permet d'ajouter
 * facilement d'autres réactions (avertissement, warn) via applyReaction.
 */
const protectionService = require('../protections/protectionService');
const { isExempt, canModerateMessages } = require('../../middlewares/protections/protectionAccess');
const { t } = require('../../utils/helpers/i18n');

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|\b[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i;
const INVITE_REGEX = /(discord\.(gg|io|me|li)|discord(?:app)?\.com\/invite|discord\.gg)\/\S+/i;
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at'];
const SUSPICIOUS_TLDS = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.click', '.link', '.ru', '.zip', '.mov'];

/** Liste blanche de domaines autorisés (extension future, par serveur). */
const WHITELIST = [];

/** Extrait un nom d'hôte (minuscule) d'un jeton d'URL, ou null. */
function extractHost(token) {
  const match = token.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Analyse un contenu et retourne le motif de lien détecté, ou null.
 * @returns {{ reason: string } | null}
 */
function analyze(content) {
  if (!content) return null;

  if (INVITE_REGEX.test(content)) return { reason: 'invite' };

  const tokens = content.split(/\s+/);
  for (const token of tokens) {
    if (!URL_REGEX.test(token)) continue;
    const host = extractHost(token);
    if (!host) continue;
    if (WHITELIST.includes(host)) continue;
    if (SHORTENERS.includes(host)) return { reason: 'shortener' };
    if (SUSPICIOUS_TLDS.some((tld) => host.endsWith(tld))) return { reason: 'suspicious' };
    return { reason: 'link' };
  }
  return null;
}

async function applyReaction(message, detection) {
  const guild = message.guild;
  let deleted = false;
  if (canModerateMessages(guild, message.channel)) {
    deleted = await message.delete().then(() => true).catch(() => false);
  }
  protectionService.bumpStat(guild.id, 'linksRemoved');

  await protectionService.logProtection(guild, 'link', {
    color: protectionService.COLORS.WARNING,
    user: message.author,
    fields: [
      { name: t('protections.field.reason'), value: t(`protections.link.${detection.reason}`), inline: true },
      { name: t('common.channel'), value: `${message.channel}`, inline: true },
      { name: t('protections.field.action'), value: deleted ? t('protections.field.deleted') : t('protections.field.notDeleted') },
    ],
  });
  return { deleted };
}

/**
 * Point d'entrée appelé par l'écouteur de messages.
 * @returns {Promise<boolean>} true si une action a été prise
 */
async function handleMessage(message) {
  if (!message.guild || message.author?.bot) return false;
  if (!protectionService.isEnabled(message.guild.id, 'antilink')) return false;
  if (isExempt(message.member)) return false;

  const detection = analyze(message.content ?? '');
  if (!detection) return false;
  await applyReaction(message, detection);
  return true;
}

module.exports = { WHITELIST, analyze, handleMessage };
