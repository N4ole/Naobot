/**
 * Service de logs de modération : envoie un embed dans le salon configuré
 * (MODLOG_CHANNEL_ID) ou, à défaut, dans un salon nommé "mod-logs".
 * L'absence de salon de logs n'est jamais bloquante.
 */
const config = require('../../config/config');

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').EmbedBuilder} embed
 */
async function logModAction(guild, embed) {
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
