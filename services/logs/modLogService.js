/**
 * Routage des logs de modération vers le système de logs par catégories.
 *
 * Les services de modération appellent logModAction(guild, embed) : les
 * actions de modération (kick, ban, mute, timeout…) sont journalisées dans la
 * catégorie « moderation ». La purge passe { countsAsSanction: false } pour ne
 * pas fausser les statistiques de sanctions.
 *
 * Rétrocompatibilité : tant que la catégorie n'a jamais été configurée sur le
 * serveur, l'ancien comportement est conservé (envoi vers un salon nommé
 * "mod-logs"). Dès qu'elle est administrée, seul le système de logs fait foi.
 */
const config = require('../../config/config');
const logService = require('./logService');
const statsService = require('../tracking/guildStatsService');
const reputationService = require('../reputation/reputationService');

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {string} [category] - Catégorie de logs (défaut : moderation)
 * @param {{ countsAsSanction?: boolean }} [options]
 */
async function logModAction(guild, embed, category = 'moderation', { countsAsSanction = true } = {}) {
  // Les sanctions alimentent les statistiques et la réputation DU SERVEUR.
  if (countsAsSanction) {
    statsService.recordSanction(guild.id);
    reputationService.recalculate(guild, { reason: 'auto' });
  }

  if (logService.isControlled(guild.id, category)) {
    return logService.log(guild, category, embed);
  }

  // Repli historique par nom de salon uniquement (bot multi-serveurs).
  const channel = guild.channels.cache.find((c) => c.name === config.modLogChannelName && c.isTextBased());
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = { logModAction };
