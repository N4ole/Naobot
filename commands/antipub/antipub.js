/**
 * Commande antipub : configuration de la protection anti-publicité
 * (invitations Discord), indépendante des autres protections.
 *
 * - `antipub on|off` : active / désactive la protection.
 * - `antipub status` : état, salons exemptés (paginés), statistiques et
 *   dernière modification, avec boutons (activer/désactiver, actualiser).
 * - `antipub whitelist add <salon>` : exempte un salon (invitations autorisées).
 * - `antipub whitelist remove <salon>` : retire un salon des exemptions.
 * - `antipub whitelist list` : liste les salons exemptés.
 *
 * La logique métier (détection, persistance, logs) vit dans
 * services/antipub/antipubService. Accès : Administrateur (config/permissions).
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../../config/config');
const antipubService = require('../../services/antipub/antipubService');
const { canConfigure } = require('../../middlewares/antipub/antipubAccess');
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

/** Construit l'affichage d'état (embed + composants) pour une page donnée. */
function buildStatusPayload(guild, page = 0) {
  const conf = antipubService.getConfig(guild.id);
  const channels = conf.exemptChannels;
  const pages = Math.max(1, Math.ceil(channels.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = channels.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const channelList = channels.length
    ? slice.map((id) => `• <#${id}>`).join('\n')
    : t('antipub.status.noChannels');

  const embed = infoEmbed(
    t('antipub.status.title', { guild: guild.name }),
    t('antipub.status.state', { indicator: indicator(conf.enabled), state: antipubService.isEnabled(guild.id) ? t('antipub.on') : t('antipub.off') }),
  ).addFields(
    { name: t('antipub.status.exemptCount'), value: String(channels.length), inline: true },
    { name: t('antipub.status.stats'), value: t('antipub.status.statsValue', { detections: conf.stats.detections, deleted: conf.stats.deleted, errors: conf.stats.errors }), inline: true },
    {
      name: t('antipub.status.lastModified'),
      value: conf.lastModifiedAt
        ? `<t:${Math.floor(Date.parse(conf.lastModifiedAt) / 1000)}:f>${conf.lastModifiedBy ? ` — <@${conf.lastModifiedBy}>` : ''}`
        : t('antipub.status.never'),
      inline: false,
    },
    { name: t('antipub.status.channels', { page: current + 1, pages }), value: channelList, inline: false },
  );

  const toggle = conf.enabled
    ? new ButtonBuilder().setCustomId('antipub:toggle:off').setLabel(t('antipub.button.disable')).setStyle(ButtonStyle.Danger)
    : new ButtonBuilder().setCustomId('antipub:toggle:on').setLabel(t('antipub.button.enable')).setStyle(ButtonStyle.Success);
  const rows = [
    new ActionRowBuilder().addComponents(
      toggle,
      new ButtonBuilder().setCustomId(`antipub:page:${current}`).setLabel(t('antipub.button.refresh')).setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (pages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`antipub:page:${current - 1}`).setLabel(t('antipub.button.prev')).setStyle(ButtonStyle.Primary).setDisabled(current === 0),
        new ButtonBuilder().setCustomId(`antipub:page:${current + 1}`).setLabel(t('antipub.button.next')).setStyle(ButtonStyle.Primary).setDisabled(current >= pages - 1),
      ),
    );
  }
  return { embeds: [embed], components: rows };
}

/** Sous-commande whitelist (add / remove / list). */
async function handleWhitelist(ctx) {
  const sub = normalizeWord(ctx.options.sousaction);
  if (sub === 'list' || sub === 'liste') {
    const channels = antipubService.listExemptChannels(ctx.guild.id);
    const value = channels.length ? channels.map((id) => `• <#${id}>`).join('\n') : t('antipub.status.noChannels');
    return ctx.reply({ embeds: [infoEmbed(t('antipub.whitelist.listTitle'), value)] });
  }

  const channel = ctx.options.salon;
  if (sub === 'add' || sub === 'ajouter') {
    if (!channel) return ctx.reply({ embeds: [errorEmbed(t('antipub.whitelist.needChannel'))], ephemeral: true });
    const { added } = await antipubService.addExemptChannel(ctx.guild, channel, ctx.user);
    return ctx.reply({ embeds: [successEmbed(t(added ? 'antipub.whitelist.added' : 'antipub.whitelist.alreadyAdded', { channel: `<#${channel.id}>` }))] });
  }
  if (sub === 'remove' || sub === 'retirer' || sub === 'delete' || sub === 'supprimer') {
    if (!channel) return ctx.reply({ embeds: [errorEmbed(t('antipub.whitelist.needChannel'))], ephemeral: true });
    const { removed } = await antipubService.removeExemptChannel(ctx.guild, channel.id, ctx.user);
    return ctx.reply({ embeds: [successEmbed(t(removed ? 'antipub.whitelist.removed' : 'antipub.whitelist.notFound', { channel: `<#${channel.id}>` }))] });
  }

  return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}antipub whitelist <add|remove|list> [salon]` }))], ephemeral: true });
}

module.exports = {
  name: 'antipub',
  description: 'Configure la protection anti-publicité (invitations Discord)',
  usage: 'antipub <on|off|status|whitelist> [add|remove|list] [salon]',
  examples: ['antipub on', 'antipub off', 'antipub status', 'antipub whitelist add #partenariats', 'antipub whitelist remove #partenariats', 'antipub whitelist list'],
  aliases: ['antipublicite', 'antiinvite'],
  cooldown: 3,
  args: [
    { name: 'action', type: 'string', required: true, choices: ['on', 'off', 'status', 'whitelist'], description: 'Action : on/off, status, ou whitelist' },
    { name: 'sousaction', type: 'string', required: false, choices: ['add', 'remove', 'list'], description: 'Pour whitelist : add, remove ou list' },
    { name: 'salon', type: 'channel', required: false, description: 'Salon exempté (pour whitelist add/remove)' },
  ],

  async execute(ctx) {
    const action = normalizeWord(ctx.options.action);

    if (action === 'status' || action === 'statut') {
      return ctx.reply(buildStatusPayload(ctx.guild, 0));
    }

    if (action === 'whitelist') {
      return handleWhitelist(ctx);
    }

    let enabled;
    if (ON.has(action)) enabled = true;
    else if (OFF.has(action)) enabled = false;
    else {
      return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}${this.usage}` }))], ephemeral: true });
    }

    await antipubService.setEnabled(ctx.guild, enabled, ctx.user);
    return ctx.reply({ embeds: [successEmbed(t(enabled ? 'antipub.command.enabled' : 'antipub.command.disabled'))] });
  },

  /** Composants du panneau d'état (customId « antipub:* »). */
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    if (!canConfigure(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed(t('antipub.noPermission'))], flags: MessageFlags.Ephemeral });
    }

    const [, kind, arg] = interaction.customId.split(':');
    if (kind === 'toggle') {
      await antipubService.setEnabled(interaction.guild, arg === 'on', interaction.user);
      return interaction.update(buildStatusPayload(interaction.guild, 0));
    }
    if (kind === 'page') {
      return interaction.update(buildStatusPayload(interaction.guild, Number.parseInt(arg, 10) || 0));
    }
    return undefined;
  },
};
