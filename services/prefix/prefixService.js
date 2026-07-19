/**
 * Gestion du préfixe des commandes textuelles, personnalisable par serveur.
 *
 * - Le préfixe **par défaut** est défini dans le code (config, alimenté par
 *   `PREFIX` du .env) et n'est jamais stocké en base.
 * - Chaque serveur peut le remplacer via la commande `setprefix` ; le nouveau
 *   préfixe est persistant et pris en compte **immédiatement** (le point
 *   d'entrée des messages lit `getPrefix(guildId)` à chaque message).
 * - Validation : préfixe non vide, borné en longueur, sans espace ni caractère
 *   interdit (évite les conflits avec les mentions, les liens et les commandes
 *   slash).
 *
 * Extensible : la persistance et ce service peuvent accueillir plusieurs
 * préfixes par serveur dans une future mise à jour sans refonte.
 */
const config = require('../../config/config');
const repository = require('../../database/prefixRepository');
const logService = require('../logs/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Préfixe par défaut (code / .env), jamais persisté. */
const DEFAULT_PREFIX = config.prefix;
/** Longueur maximale d'un préfixe. */
const MAX_LENGTH = 5;
/**
 * Caractères interdits : espaces (ambiguïté de découpage), `@`/`#` (mentions,
 * salons), `/` (commandes slash), backtick (markdown), `<`/`>` (mentions et
 * émojis). Évite les conflits de parsing.
 */
const FORBIDDEN = /[\s@#/\\`<>]/;

/** Préfixe effectif d'un serveur (personnalisé ou défaut). */
function getPrefix(guildId) {
  return repository.getConfig(guildId).prefix ?? DEFAULT_PREFIX;
}

/** État complet du préfixe d'un serveur (affichage + web). */
function getConfig(guildId) {
  const stored = repository.getConfig(guildId);
  return {
    prefix: stored.prefix ?? DEFAULT_PREFIX,
    default: DEFAULT_PREFIX,
    isCustom: Boolean(stored.prefix),
    updatedBy: stored.updatedBy,
    updatedAt: stored.updatedAt,
  };
}

/**
 * Valide un préfixe candidat.
 * @returns {{ ok: true, value: string } | { ok: false, code: string }}
 */
function validate(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, code: 'empty' };
  if (value.length > MAX_LENGTH) return { ok: false, code: 'tooLong' };
  if (FORBIDDEN.test(value)) return { ok: false, code: 'forbidden' };
  return { ok: true, value };
}

/** Journalise un changement de préfixe dans la catégorie de logs « moderation ». */
function logChange(guild, before, after, byUser) {
  return logService
    .log(
      guild,
      'moderation',
      logEventEmbed({
        title: `🔧 ${t('prefix.logs.changed')}`,
        color: COLORS.LOG_UPDATE,
        user: byUser,
        fields: [
          { name: t('prefix.field.old'), value: `\`${before}\``, inline: true },
          { name: t('prefix.field.new'), value: `\`${after}\``, inline: true },
        ],
      }),
    )
    .catch(() => null);
}

/**
 * Définit le préfixe d'un serveur (validé, persistant, journalisé).
 * @returns {Promise<{ ok: true, prefix, before } | { ok: false, code }>}
 */
async function setPrefix(guild, raw, byUser) {
  const validated = validate(raw);
  if (!validated.ok) return validated;

  const before = getPrefix(guild.id);
  repository.setPrefix(guild.id, validated.value, byUser?.id);
  if (before !== validated.value) await logChange(guild, before, validated.value, byUser);
  return { ok: true, prefix: validated.value, before };
}

/**
 * Réinitialise le préfixe d'un serveur au préfixe par défaut.
 * @returns {Promise<{ ok: true, prefix, before }>}
 */
async function resetPrefix(guild, byUser) {
  const before = getPrefix(guild.id);
  repository.clearPrefix(guild.id, byUser?.id);
  if (before !== DEFAULT_PREFIX) await logChange(guild, before, DEFAULT_PREFIX, byUser);
  return { ok: true, prefix: DEFAULT_PREFIX, before };
}

module.exports = { DEFAULT_PREFIX, MAX_LENGTH, getPrefix, getConfig, validate, setPrefix, resetPrefix };
