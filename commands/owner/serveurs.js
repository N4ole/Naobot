/**
 * Commande serveurs : liste paginée (un serveur par page, boutons de
 * navigation) des serveurs où le bot est présent — réservée aux owners.
 *
 * La page courante est portée par le pied de page de l'embed
 * (« Serveur X/Y »), ce qui rend la pagination sans état côté bot et
 * robuste même avec de très nombreux serveurs (une seule page est
 * construite à la fois, à la demande).
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { checkOwner } = require('../../middlewares/permissions/ownerCheck');
const reputationService = require('../../services/reputation/reputationService');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

function sortedGuilds(client) {
  return [...client.guilds.cache.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function buildServerPage(client, targetPage) {
  const guilds = sortedGuilds(client);
  const total = guilds.length;
  const page = Math.min(Math.max(targetPage, 0), total - 1);
  const guild = guilds[page];

  const owner = await guild.fetchOwner().catch(() => null);
  // Le décompte des bots nécessite la liste des membres ; en cas d'échec
  // (très gros serveur, délai), on retombe sur le cache.
  const members = await guild.members.fetch({ time: 10_000 }).catch(() => guild.members.cache);
  const botCount = members.filter((member) => member.user.bot).size;

  const embed = infoEmbed(guild.name, `\`${guild.id}\``)
    .addFields(
      {
        name: t('owners.servers.owner'),
        value: owner ? `${owner.user.tag} (\`${owner.id}\`)` : t('owners.servers.unknown'),
        inline: true,
      },
      { name: t('owners.servers.members'), value: String(guild.memberCount), inline: true },
      { name: t('owners.servers.bots'), value: String(botCount), inline: true },
      {
        name: t('owners.servers.created'),
        value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
        inline: true,
      },
      {
        name: t('owners.servers.joined'),
        value: `<t:${Math.floor(guild.joinedTimestamp / 1000)}:D>`,
        inline: true,
      },
      {
        name: t('owners.servers.verification'),
        value: t(`owners.servers.verificationLevels.${guild.verificationLevel}`),
        inline: true,
      },
      { name: t('owners.servers.channels'), value: String(guild.channels.cache.size), inline: true },
      { name: t('owners.servers.roles'), value: String(guild.roles.cache.size), inline: true },
      {
        name: t('tracking.reputation'),
        value: reputationService.formatReputation(reputationService.getOrCompute(guild)),
        inline: true,
      },
    )
    .setFooter({ text: t('owners.servers.footer', { page: page + 1, total }) });
  const icon = guild.iconURL();
  if (icon) embed.setThumbnail(icon);

  const isFirst = page === 0;
  const isLast = page >= total - 1;
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('serveurs:first').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(isFirst),
    new ButtonBuilder().setCustomId('serveurs:prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(isFirst),
    new ButtonBuilder().setCustomId('serveurs:next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(isLast),
    new ButtonBuilder().setCustomId('serveurs:last').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(isLast),
  );

  return { embeds: [embed], components: [buttons] };
}

/** Retrouve la page courante depuis le pied de page (« Serveur X/Y »). */
function currentPageFromMessage(message) {
  const footer = message.embeds[0]?.footer?.text ?? '';
  const match = footer.match(/(\d+)\s*\/\s*(\d+)/);
  return match ? Number.parseInt(match[1], 10) - 1 : 0;
}

module.exports = {
  name: 'serveurs',
  ownerOnly: true,
  description: 'Liste les serveurs où le bot est présent (réservé aux owners)',
  usage: 'serveurs',
  examples: ['serveurs'],
  // « servers » n'est pas un alias ici : c'est déjà le nom de la commande DM
  // de sélection de serveur (commands/dm/servers.js).
  aliases: ['guilds'],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    // fetchOwner + fetch des membres peuvent dépasser les 3 s des interactions.
    await ctx.defer();
    return ctx.reply(await buildServerPage(ctx.client, 0));
  },

  /** Boutons de pagination (customId "serveurs:*") — owners uniquement. */
  async handleComponent(interaction) {
    const owner = checkOwner(interaction.user.id);
    if (!owner.ok) {
      return interaction.reply({ embeds: [errorEmbed(owner.error)], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferUpdate();
    const page = currentPageFromMessage(interaction.message);
    const target = {
      'serveurs:first': 0,
      'serveurs:prev': page - 1,
      'serveurs:next': page + 1,
      'serveurs:last': Number.MAX_SAFE_INTEGER,
    }[interaction.customId];
    if (target === undefined) return;

    await interaction.editReply(await buildServerPage(interaction.client, target));
  },
};
