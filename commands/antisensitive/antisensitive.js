/**
 * Commande antisensitive : configuration de la protection anti-contenus
 * sensibles (sites pour adultes, violents, gore, choquants), indépendante des
 * autres protections.
 *
 * - `antisensitive on|off` : active / désactive la protection.
 * - `antisensitive status` : état, salons exemptés (paginés), statistiques,
 *   dernière modification, avec boutons.
 * - `antisensitive whitelist add|remove|list <salon>` : gestion des salons
 *   exemptés (liens sensibles tolérés).
 *
 * Accès : Administrateur (config/permissions.js). La logique métier vit dans
 * services/antisensitive/antisensitiveService.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../../config/config');
const antisensitiveService = require('../../services/antisensitive/antisensitiveService');
const { canConfigure } = require('../../middlewares/antisensitive/antisensitiveAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const ON = new Set(['on', 'activer', 'enable', 'true', 'oui']);
const OFF = new Set(['off', 'desactiver', 'disable', 'false', 'non']);
const PAGE_SIZE = 10;

function normalizeWord(input) {
  return (input ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function indicator(enabled) {
  return enabled ? '🟢' : '🔴';
}

function buildStatusPayload(guild, page = 0) {
  const conf = antisensitiveService.getConfig(guild.id);
  const channels = conf.exemptChannels;
  const pages = Math.max(1, Math.ceil(channels.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = channels.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const channelList = channels.length ? slice.map((id) => `• <#${id}>`).join('\n') : t('antisensitive.status.noChannels');

  const embed = infoEmbed(
    t('antisensitive.status.title', { guild: guild.name }),
    t('antisensitive.status.state', { indicator: indicator(conf.enabled), state: conf.enabled ? t('antisensitive.on') : t('antisensitive.off') }),
  ).addFields(
    { name: t('antisensitive.status.exemptCount'), value: String(channels.length), inline: true },
    { name: t('antisensitive.status.stats'), value: t('antisensitive.status.statsValue', { detections: conf.stats.detections, deleted: conf.stats.deleted, errors: conf.stats.errors }), inline: true },
    {
      name: t('antisensitive.status.lastModified'),
      value: conf.lastModifiedAt
        ? `<t:${Math.floor(Date.parse(conf.lastModifiedAt) / 1000)}:f>${conf.lastModifiedBy ? ` — <@${conf.lastModifiedBy}>` : ''}`
        : t('antisensitive.status.never'),
      inline: false,
    },
    { name: t('antisensitive.status.channels', { page: current + 1, pages }), value: channelList, inline: false },
  );

  const toggle = conf.enabled
    ? new ButtonBuilder().setCustomId('antisensitive:toggle:off').setLabel(t('antisensitive.button.disable')).setStyle(ButtonStyle.Danger)
    : new ButtonBuilder().setCustomId('antisensitive:toggle:on').setLabel(t('antisensitive.button.enable')).setStyle(ButtonStyle.Success);
  const rows = [
    new ActionRowBuilder().addComponents(
      toggle,
      new ButtonBuilder().setCustomId(`antisensitive:page:${current}`).setLabel(t('antisensitive.button.refresh')).setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (pages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`antisensitive:page:${current - 1}`).setLabel(t('antisensitive.button.prev')).setStyle(ButtonStyle.Primary).setDisabled(current === 0),
        new ButtonBuilder().setCustomId(`antisensitive:page:${current + 1}`).setLabel(t('antisensitive.button.next')).setStyle(ButtonStyle.Primary).setDisabled(current >= pages - 1),
      ),
    );
  }
  return { embeds: [embed], components: rows };
}

async function handleWhitelist(ctx) {
  const sub = normalizeWord(ctx.options.sousaction);
  if (sub === 'list' || sub === 'liste') {
    const channels = antisensitiveService.listExemptChannels(ctx.guild.id);
    const value = channels.length ? channels.map((id) => `• <#${id}>`).join('\n') : t('antisensitive.status.noChannels');
    return ctx.reply({ embeds: [infoEmbed(t('antisensitive.whitelist.listTitle'), value)] });
  }

  const channel = ctx.options.salon;
  if (sub === 'add' || sub === 'ajouter') {
    if (!channel) return ctx.reply({ embeds: [errorEmbed(t('antisensitive.whitelist.needChannel'))], ephemeral: true });
    const { added } = await antisensitiveService.addExemptChannel(ctx.guild, channel, ctx.user);
    return ctx.reply({ embeds: [successEmbed(t(added ? 'antisensitive.whitelist.added' : 'antisensitive.whitelist.alreadyAdded', { channel: `<#${channel.id}>` }))] });
  }
  if (sub === 'remove' || sub === 'retirer' || sub === 'delete' || sub === 'supprimer') {
    if (!channel) return ctx.reply({ embeds: [errorEmbed(t('antisensitive.whitelist.needChannel'))], ephemeral: true });
    const { removed } = await antisensitiveService.removeExemptChannel(ctx.guild, channel.id, ctx.user);
    return ctx.reply({ embeds: [successEmbed(t(removed ? 'antisensitive.whitelist.removed' : 'antisensitive.whitelist.notFound', { channel: `<#${channel.id}>` }))] });
  }

  return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}antisensitive whitelist <add|remove|list> [salon]` }))], ephemeral: true });
}

module.exports = {
  name: 'antisensitive',
  description: 'Configure la protection anti-contenus sensibles (sites adultes/violents)',
  usage: 'antisensitive <on|off|status|whitelist> [add|remove|list] [salon]',
  examples: ['antisensitive on', 'antisensitive off', 'antisensitive status', 'antisensitive whitelist add #nsfw', 'antisensitive whitelist list'],
  aliases: ['antinsfw', 'antichoc'],
  cooldown: 3,
  args: [
    { name: 'action', type: 'string', required: true, choices: ['on', 'off', 'status', 'whitelist'], description: 'Action : on/off, status, ou whitelist' },
    { name: 'sousaction', type: 'string', required: false, choices: ['add', 'remove', 'list'], description: 'Pour whitelist : add, remove ou list' },
    { name: 'salon', type: 'channel', required: false, description: 'Salon exempté (pour whitelist add/remove)' },
  ],

  async execute(ctx) {
    const action = normalizeWord(ctx.options.action);
    if (action === 'status' || action === 'statut') return ctx.reply(buildStatusPayload(ctx.guild, 0));
    if (action === 'whitelist') return handleWhitelist(ctx);

    let enabled;
    if (ON.has(action)) enabled = true;
    else if (OFF.has(action)) enabled = false;
    else return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}${this.usage}` }))], ephemeral: true });

    await antisensitiveService.setEnabled(ctx.guild, enabled, ctx.user);
    return ctx.reply({ embeds: [successEmbed(t(enabled ? 'antisensitive.command.enabled' : 'antisensitive.command.disabled'))] });
  },

  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    if (!canConfigure(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed(t('antisensitive.noPermission'))], flags: MessageFlags.Ephemeral });
    }
    const [, kind, arg] = interaction.customId.split(':');
    if (kind === 'toggle') {
      await antisensitiveService.setEnabled(interaction.guild, arg === 'on', interaction.user);
      return interaction.update(buildStatusPayload(interaction.guild, 0));
    }
    if (kind === 'page') {
      return interaction.update(buildStatusPayload(interaction.guild, Number.parseInt(arg, 10) || 0));
    }
    return undefined;
  },
};
