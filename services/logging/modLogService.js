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

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {string} [category] - Clé de utils/constants/logCategories
 */
async function logModAction(guild, embed, category = 'sanctions') {
  if (logService.isControlled(guild.id, category)) {
    return logService.log(guild, category, embed);
  }

  let channel = null;
  if (config.modLogChannelId) {
    channel = guild.channels.cache.get(config.modLogChannelId) ?? null;
  }
  if (!channel) {
    channel = guild.channels.cache.find(
      (c) => c.name === config.modLogChannelName && c.isTextBased(),
    );
  }
  if (!channel?.isTextBased()) return;

  await channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = { logModAction };
