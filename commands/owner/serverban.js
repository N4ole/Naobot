/**
 * Commandes serverban / serverunban / serverbanlist (même famille, même
 * fichier) : liste noire globale des serveurs — réservées aux owners.
 * La logique métier vit dans services/serverManagement.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { checkOwner } = require('../../middlewares/permissions/ownerCheck');
const serverManagementService = require('../../services/serverManagement/serverManagementService');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const GUILD_ID_PATTERN = /^\d{17,20}$/;
const PAGE_SIZE = 5;

const serverban = {
  name: 'serverban',
  ownerOnly: true,
  description: 'Ajoute un serveur à la liste noire globale du bot (réservé aux owners)',
  usage: 'serverban <id_serveur> [raison]',
  examples: ['serverban 123456789012345678 Violation des règles'],
  aliases: [],
  cooldown: 5,
  args: [
    { name: 'serveur', type: 'string', required: true, description: 'Identifiant du serveur à bannir' },
    { name: 'raison', type: 'string', required: false, rest: true, description: 'Raison du bannissement' },
  ],
  async execute(ctx) {
    const guildId = ctx.options.serveur.trim();
    if (!GUILD_ID_PATTERN.test(guildId)) {
      return ctx.reply({
        embeds: [errorEmbed(t('serverManagement.ban.invalidId', { id: guildId }))],
        ephemeral: true,
      });
    }

    await ctx.defer();
    const reason = ctx.options.raison ?? t('common.noReason');
    const result = await serverManagementService.banServer(ctx.client, guildId, reason, ctx.user);
    if (!result.ok) {
      return ctx.reply({
        embeds: [errorEmbed(t('serverManagement.ban.alreadyBanned', { id: guildId }))],
        ephemeral: true,
      });
    }
    return ctx.reply({
      embeds: [successEmbed(t('serverManagement.ban.banned', { name: result.name ?? guildId, id: guildId }))],
    });
  },
};

const serverunban = {
  name: 'serverunban',
  ownerOnly: true,
  description: 'Retire un serveur de la liste noire globale (réservé aux owners)',
  usage: 'serverunban <id_serveur>',
  examples: ['serverunban 123456789012345678'],
  aliases: [],
  cooldown: 5,
  args: [
    { name: 'serveur', type: 'string', required: true, description: 'Identifiant du serveur à débannir' },
  ],
  async execute(ctx) {
    const guildId = ctx.options.serveur.trim();
    await ctx.defer();
    const result = await serverManagementService.unbanServer(ctx.client, guildId, ctx.user);
    if (!result.ok) {
      return ctx.reply({
        embeds: [errorEmbed(t('serverManagement.ban.notBanned', { id: guildId }))],
        ephemeral: true,
      });
    }
    return ctx.reply({ embeds: [successEmbed(t('serverManagement.ban.unbanned', { id: guildId }))] });
  },
};

/** Page paginée de la liste noire (page portée par le customId). */
function buildBanListPayload(userId, pageIndex) {
  const bans = serverManagementService.getBans();
  if (bans.length === 0) {
    return {
      embeds: [infoEmbed(t('serverManagement.ban.listTitle', { count: 0 }), t('serverManagement.ban.listEmpty'))],
      components: [],
    };
  }

  const pageCount = Math.ceil(bans.length / PAGE_SIZE);
  const page = Math.min(Math.max(pageIndex, 0), pageCount - 1);
  const entries = bans.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const lines = entries.map((entry) =>
    t('serverManagement.ban.listEntry', {
      name: entry.name ?? entry.id,
      id: entry.id,
      reason: entry.reason ?? t('common.noReason'),
      date: Math.floor(Date.parse(entry.date) / 1000),
      by: entry.bannedBy,
    }),
  );
  const embed = infoEmbed(
    t('serverManagement.ban.listTitle', { count: bans.length }),
    lines.join('\n\n'),
  ).setFooter({ text: `Page ${page + 1}/${pageCount}` });

  const components =
    pageCount > 1
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`serverbanlist:prev:${userId}:${page}`)
              .setEmoji('◀️')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page === 0),
            new ButtonBuilder()
              .setCustomId(`serverbanlist:next:${userId}:${page}`)
              .setEmoji('▶️')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page >= pageCount - 1),
          ),
        ]
      : [];
  return { embeds: [embed], components };
}

const serverbanlist = {
  name: 'serverbanlist',
  ownerOnly: true,
  description: 'Affiche la liste noire globale des serveurs (réservé aux owners)',
  usage: 'serverbanlist',
  examples: ['serverbanlist'],
  aliases: ['sbl'],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    return ctx.reply(buildBanListPayload(ctx.user.id, 0));
  },

  /** Pagination (customId "serverbanlist:<action>:<userId>:<page>") — owners uniquement. */
  async handleComponent(interaction) {
    if (!interaction.isButton()) return;
    const [, action, requesterId, rawPage] = interaction.customId.split(':');
    if (!['prev', 'next'].includes(action)) return;

    const owner = checkOwner(interaction.user.id);
    if (!owner.ok || interaction.user.id !== requesterId) {
      return interaction.reply({
        embeds: [errorEmbed(t('serverManagement.leave.notYourSession'))],
        flags: MessageFlags.Ephemeral,
      });
    }

    const current = Number.parseInt(rawPage, 10) || 0;
    const target = action === 'prev' ? current - 1 : current + 1;
    return interaction.update(buildBanListPayload(requesterId, target));
  },
};

module.exports = [serverban, serverunban, serverbanlist];
