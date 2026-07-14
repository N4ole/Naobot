/**
 * Commande channelinfo : informations détaillées sur un salon.
 */
const { ChannelType } = require('discord.js');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

/** Libellés français des types de salons (données, comme logCategories). */
const TYPE_LABELS = {
  [ChannelType.GuildText]: 'Textuel',
  [ChannelType.GuildVoice]: 'Vocal',
  [ChannelType.GuildCategory]: 'Catégorie',
  [ChannelType.GuildAnnouncement]: 'Annonces',
  [ChannelType.GuildStageVoice]: 'Conférence',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.PublicThread]: 'Fil public',
  [ChannelType.PrivateThread]: 'Fil privé',
  [ChannelType.AnnouncementThread]: "Fil d'annonces",
};

module.exports = {
  name: 'channelinfo',
  description: "Affiche les informations d'un salon",
  usage: 'channelinfo [salon]',
  examples: ['channelinfo', 'channelinfo #général'],
  aliases: ['ci'],
  cooldown: 5,
  args: [
    { name: 'salon', type: 'channel', required: false, description: 'Le salon à consulter (salon courant par défaut)' },
  ],
  async execute(ctx) {
    const channel = ctx.options.salon ?? ctx.channel;

    const embed = infoEmbed(`#${channel.name}`, `${channel}`).addFields(
      { name: t('info.id'), value: `\`${channel.id}\``, inline: true },
      { name: t('info.type'), value: TYPE_LABELS[channel.type] ?? String(channel.type), inline: true },
      {
        name: t('info.created'),
        value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:D>`,
        inline: true,
      },
    );

    if (channel.parent) {
      embed.addFields({ name: t('info.category'), value: channel.parent.name, inline: true });
    }
    if ('topic' in channel && channel.topic) {
      embed.addFields({ name: t('info.topic'), value: channel.topic.slice(0, 1024) });
    }
    if ('rateLimitPerUser' in channel && channel.rateLimitPerUser) {
      embed.addFields({ name: t('info.slowmode'), value: `${channel.rateLimitPerUser} s`, inline: true });
    }
    if ('nsfw' in channel) {
      embed.addFields({ name: t('info.nsfw'), value: channel.nsfw ? t('info.yes') : t('info.no'), inline: true });
    }
    if ('bitrate' in channel && channel.bitrate) {
      embed.addFields(
        { name: t('info.bitrate'), value: `${Math.round(channel.bitrate / 1000)} kbps`, inline: true },
        { name: t('info.userLimit'), value: channel.userLimit ? String(channel.userLimit) : '∞', inline: true },
      );
    }
    return ctx.reply({ embeds: [embed] });
  },
};
