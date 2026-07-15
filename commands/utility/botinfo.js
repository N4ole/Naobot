/**
 * Commandes botinfo / uptime (même famille, même fichier) :
 * informations générales sur le bot et durée de fonctionnement.
 */
const { version: discordJsVersion } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

const botinfo = {
  name: 'botinfo',
  description: 'Affiche les informations générales du bot',
  usage: 'botinfo',
  examples: ['botinfo'],
  aliases: ['stats'],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    const { client } = ctx;
    const totalUsers = client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount ?? 0), 0);
    const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

    const embed = infoEmbed(t('info.botTitle', { bot: client.user.username }), null)
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: t('info.servers'), value: String(client.guilds.cache.size), inline: true },
        { name: t('info.users'), value: String(totalUsers), inline: true },
        { name: t('info.commands'), value: String(client.commands.size), inline: true },
        { name: t('info.uptime'), value: formatDuration(client.uptime ?? 0), inline: true },
        { name: t('info.ping'), value: `${Math.round(client.ws.ping)} ms`, inline: true },
        { name: t('info.memory'), value: `${memoryMb} Mo`, inline: true },
        { name: t('info.library'), value: `discord.js v${discordJsVersion}`, inline: true },
        { name: t('info.node'), value: process.version, inline: true },
      );
    return ctx.reply({ embeds: [embed] });
  },
};

const uptime = {
  name: 'uptime',
  description: 'Affiche depuis combien de temps le bot est en ligne',
  usage: 'uptime',
  examples: ['uptime'],
  aliases: [],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    return ctx.reply({
      embeds: [
        infoEmbed('⏱️ Uptime', t('info.uptimeSince', { duration: formatDuration(ctx.client.uptime ?? 0) })),
      ],
    });
  },
};

module.exports = [botinfo, uptime];
