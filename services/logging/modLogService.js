/**
 * Routage des logs de modération vers le système de logs par catégories.
 *
 * Les services de modération appellent logModAction(guild, embed, catégorie)
 * (catégorie « sanctions » par défaut, « moderation » pour la purge…).
 *
 * Rétrocompatibilité : tant que la catégorie n'a jamais été configurée sur
 * le serveur (commande logs jamais utilisée pour elle), l'ancien
 * comportement est conservé — envoi vers MODLOG_CHANNEL_ID ou, à défaut,
 * vers un salon nommé "mod-logs". Dès que la catégorie est administrée,
 * seul le système de logs fait foi (y compris pour la désactiver).
 */
const config = require('../../config/config');
const logService = require('./logService');
const statsService = require('../tracking/guildStatsService');
const reputationService = require('../reputation/reputationService');

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {string} [category] - Clé de utils/constants/logCategories
 */
async function logModAction(guild, embed, category = 'sanctions') {
  // Les sanctions alimentent les statistiques et la réputation du serveur.
  if (category === 'sanctions') {
    statsService.recordSanction(guild.id);
    reputationService.recalculate(guild, { reason: 'auto' });
  }

  if (logService.isControlled(guild.id, category)) {
    return logService.log(guild, category, embed);
  }

  // Repli historique par nom de salon uniquement (aucun identifiant de
  // salon dans le .env : le bot est multi-serveurs).
  const channel = guild.channels.cache.find(
    (c) => c.name === config.modLogChannelName && c.isTextBased(),
  );
  if (!channel?.isTextBased()) return;

  await channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = { logModAction };
