/**
 * Commande serverinfo : informations détaillées sur le serveur courant.
 */
const { ChannelType } = require('discord.js');
const reputationService = require('../../services/reputation/reputationService');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

module.exports = {
  name: 'serverinfo',
  description: 'Affiche les informations du serveur',
  usage: 'serverinfo',
  examples: ['serverinfo'],
  aliases: ['si'],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    const { guild } = ctx;
    const owner = await guild.fetchOwner().catch(() => null);
    const cached = guild.members.cache;
    const bots = cached.filter((member) => member.user.bot).size;
    const channels = guild.channels.cache;
    const countType = (type) => channels.filter((channel) => channel.type === type).size;

    const embed = infoEmbed(guild.name, guild.description || null)
      .addFields(
        { name: t('info.id'), value: `\`${guild.id}\``, inline: true },
        {
          name: t('owners.servers.owner'),
          value: owner ? `${owner.user.tag}` : t('owners.servers.unknown'),
          inline: true,
        },
        { name: t('owners.servers.members'), value: String(guild.memberCount), inline: true },
        { name: t('owners.servers.bots'), value: String(bots), inline: true },
        { name: t('tracking.textChannels'), value: String(countType(ChannelType.GuildText)), inline: true },
        { name: t('tracking.voiceChannels'), value: String(countType(ChannelType.GuildVoice)), inline: true },
        { name: t('tracking.categories'), value: String(countType(ChannelType.GuildCategory)), inline: true },
        { name: t('owners.servers.roles'), value: String(guild.roles.cache.size), inline: true },
        { name: t('info.emojis'), value: String(guild.emojis.cache.size), inline: true },
        {
          name: t('owners.servers.verification'),
          value: t(`owners.servers.verificationLevels.${guild.verificationLevel}`),
          inline: true,
        },
        {
          name: t('info.boosts'),
          value: `${guild.premiumSubscriptionCount ?? 0} (${t('info.boostTier')} ${guild.premiumTier})`,
          inline: true,
        },
        {
          name: t('owners.servers.created'),
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
          inline: true,
        },
        {
          name: t('tracking.reputation'),
          value: reputationService.formatReputation(reputationService.getOrCompute(guild)),
          inline: true,
        },
      );
    const icon = guild.iconURL({ size: 256 });
    if (icon) embed.setThumbnail(icon);
    const banner = guild.bannerURL({ size: 1024 });
    if (banner) embed.setImage(banner);
    return ctx.reply({ embeds: [embed] });
  },
};
