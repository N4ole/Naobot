/**
 * Socle partagé des protections automatiques : état par serveur
 * (activation/désactivation), statistiques, et journalisation dans la
 * catégorie de logs « protections ».
 *
 * Les moteurs de détection vivent dans services/antispam, services/antilink
 * et services/antibot ; ils s'appuient sur ce socle pour lire l'état,
 * incrémenter les statistiques et journaliser.
 */
const repository = require('../../database/protectionRepository');
const protectionTypes = require('../../utils/constants/protectionTypes');
const logService = require('../logging/logService');
const { logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

function getConfig(guildId) {
  return repository.getConfig(guildId);
}

function isEnabled(guildId, type) {
  return repository.getConfig(guildId).enabled[type] === true;
}

/**
 * Active ou désactive une protection, en conservant l'auteur et la date.
 * @returns {{ config: object }}
 */
function setEnabled(guildId, type, enabled, byUserId) {
  const config = repository.getConfig(guildId);
  config.enabled[type] = enabled;
  config.lastModifiedAt = new Date().toISOString();
  config.lastModifiedBy = byUserId;
  repository.saveConfig(guildId, config);
  return { config };
}

/** Incrémente une statistique (clé de stats) du serveur. */
function bumpStat(guildId, statKey, amount = 1) {
  if (!statKey) return;
  const config = repository.getConfig(guildId);
  config.stats[statKey] = (config.stats[statKey] ?? 0) + amount;
  repository.saveConfig(guildId, config);
}

/**
 * Journalise un événement de protection (catégorie « protections »).
 * @param {import('discord.js').Guild} guild
 * @param {string} action - Clé de locale protections.logs.<action>
 * @param {object} [options] - { color, user, fields }
 */
function logProtection(guild, action, { color = COLORS.LOG_NEUTRAL, user = null, fields = [] } = {}) {
  return logService.log(
    guild,
    'protections',
    logEventEmbed({ title: `🛡️ ${t(`protections.logs.${action}`)}`, color, user, fields }),
  );
}

/** Libellé « activée / désactivée » d'une protection. */
function stateLabel(enabled) {
  return enabled ? t('protections.command.on') : t('protections.command.off');
}

module.exports = {
  types: protectionTypes,
  getConfig,
  isEnabled,
  setEnabled,
  bumpStat,
  logProtection,
  stateLabel,
  COLORS,
};
