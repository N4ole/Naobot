/**
 * Commande ticketpanel : gestion des panneaux de tickets (assistant
 * interactif). Actions : create / edit / delete / list. Réservée aux
 * administrateurs.
 *
 * Ce fichier porte aussi tous les composants de l'assistant de panneaux
 * (customId « ticketpanel:* »). La logique métier vit dans
 * services/ticketPanels ; l'accès dans middlewares/tickets/ticketAccess.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const panelService = require('../../services/ticketPanels/ticketPanelService');
const wizard = require('../../services/ticketPanels/ticketPanelWizard');
const { isAdmin } = require('../../middlewares/tickets/ticketAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const PAGE_SIZE = 6;

function ephemeral(embed) {
  return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

function listPayload(guild, userId, page) {
  const panels = panelService.listPanels(guild.id);
  if (panels.length === 0) {
    return { embeds: [infoEmbed(t('ticketPanels.list.title'), t('ticketPanels.list.empty'))], components: [] };
  }
  const pageCount = Math.ceil(panels.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  const lines = panels.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((panel) =>
    t('ticketPanels.list.entry', {
      title: panel.title,
      id: panel.id,
      channel: panel.channelId ? `<#${panel.channelId}>` : '—',
      categories: panel.categoryIds.length,
    }),
  );
  const embed = infoEmbed(t('ticketPanels.list.title', { count: panels.length }), lines.join('\n\n')).setFooter({ text: `Page ${current + 1}/${pageCount}` });
  const components = pageCount > 1
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticketpanel:list:${userId}:${current}:prev`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
        new ButtonBuilder().setCustomId(`ticketpanel:list:${userId}:${current}:next`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pageCount - 1),
      )]
    : [];
  return { embeds: [embed], components };
}

module.exports = {
  name: 'ticketpanel',
  description: 'Gère les panneaux de tickets (assistant interactif)',
  usage: 'ticketpanel <create|edit|delete|list> [identifiant]',
  examples: ['ticketpanel create', 'ticketpanel list', 'ticketpanel edit a1b2c3d4', 'ticketpanel delete a1b2c3d4'],
  aliases: ['tpanel'],
  cooldown: 3,
  args: [
    { name: 'action', type: 'string', required: false, choices: ['create', 'edit', 'delete', 'list'], description: 'Action à effectuer' },
    { name: 'identifiant', type: 'string', required: false, description: 'Identifiant du panneau (edit / delete)' },
  ],
  async execute(ctx) {
    const action = (ctx.options.action ?? 'list').toLowerCase();
    const id = ctx.options.identifiant?.trim();

    if (action === 'create') {
      wizard.startCreate(ctx.user.id, ctx.guild.id);
      return ctx.reply({ ...wizard.buildMainView(wizard.getDraft(ctx.user.id)), ephemeral: true });
    }
    if (action === 'list') {
      return ctx.reply({ ...listPayload(ctx.guild, ctx.user.id, 0), ephemeral: true });
    }
    if (action === 'edit' || action === 'delete') {
      if (!id) return ctx.reply({ embeds: [errorEmbed(t('ticketPanels.errors.idRequired'))], ephemeral: true });
      const panel = panelService.getPanel(ctx.guild.id, id);
      if (!panel) return ctx.reply({ embeds: [errorEmbed(t('ticketPanels.errors.notFound', { id }))], ephemeral: true });
      if (action === 'edit') {
        wizard.startEdit(ctx.user.id, panel);
        return ctx.reply({ ...wizard.buildMainView(wizard.getDraft(ctx.user.id)), ephemeral: true });
      }
      return ctx.reply({
        embeds: [infoEmbed(t('ticketPanels.delete.title'), t('ticketPanels.delete.confirm', { title: panel.title, id: panel.id }))],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ticketpanel:del:${ctx.user.id}:${panel.id}`).setLabel(t('ticketPanels.delete.confirmButton')).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`ticketpanel:delcancel:${ctx.user.id}:${panel.id}`).setLabel(t('ticketPanels.delete.cancelButton')).setStyle(ButtonStyle.Secondary),
        )],
        ephemeral: true,
      });
    }
    return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `!${this.usage}` }))], ephemeral: true });
  },

  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return undefined;
    if (!isAdmin(interaction.member)) return interaction.reply(ephemeral(errorEmbed(t('ticketPanels.errors.noPermission'))));
    const parts = interaction.customId.split(':');
    const action = parts[1];

    if (action === 'list') {
      const [, , requesterId, rawPage, direction] = parts;
      if (interaction.user.id !== requesterId) return interaction.deferUpdate();
      const current = Number.parseInt(rawPage, 10) || 0;
      return interaction.update(listPayload(interaction.guild, requesterId, direction === 'prev' ? current - 1 : current + 1));
    }
    if (action === 'del' || action === 'delcancel') return this._handleDelete(interaction, action, parts[2], parts[3]);
    if (action.startsWith('w')) return this._handleWizard(interaction, action);
    return undefined;
  },

  async _handleDelete(interaction, action, requesterId, panelId) {
    if (interaction.user.id !== requesterId) return interaction.reply(ephemeral(errorEmbed(t('ticketPanels.errors.notYourSession'))));
    if (action === 'delcancel') {
      return interaction.update({ embeds: [infoEmbed(t('ticketPanels.delete.title'), t('ticketPanels.delete.cancelled'))], components: [] });
    }
    const panel = panelService.getPanel(interaction.guild.id, panelId);
    if (panel) await panelService.deletePanel(interaction.guild, panel);
    return interaction.update({
      embeds: [panel ? successEmbed(t('ticketPanels.delete.done', { id: panelId })) : errorEmbed(t('ticketPanels.errors.notFound', { id: panelId }))],
      components: [],
    });
  },

  async _handleWizard(interaction, action) {
    const draft = wizard.getDraft(interaction.user.id);
    if (!draft) return interaction.reply(ephemeral(errorEmbed(t('ticketPanels.wizard.expired'))));

    switch (action) {
      case 'wchannel':
        draft.channelId = interaction.channels.first()?.id ?? draft.channelId;
        return interaction.update(wizard.buildMainView(draft));
      case 'wcategories':
        draft.categoryIds = [...interaction.values];
        return interaction.update(wizard.buildMainView(draft));
      case 'wmode':
        draft.displayMode = interaction.values[0] === 'select' ? 'select' : 'buttons';
        return interaction.update(wizard.buildMainView(draft));
      case 'wcontent':
        return interaction.showModal(wizard.contentModal(draft));
      case 'wcontentmodal':
        wizard.applyContent(draft, interaction.fields);
        return interaction.update(wizard.buildMainView(draft));
      case 'wcancel':
        wizard.clearDraft(interaction.user.id);
        return interaction.update({ embeds: [infoEmbed(t('ticketPanels.wizard.cancelledTitle'), t('ticketPanels.wizard.cancelled'))], components: [] });
      case 'wsave':
        return this._handleSave(interaction, draft);
      default:
        return undefined;
    }
  },

  async _handleSave(interaction, draft) {
    if (!draft.channelId || draft.categoryIds.length === 0) {
      return interaction.reply(ephemeral(errorEmbed(t('ticketPanels.wizard.incomplete'))));
    }
    await interaction.deferUpdate();
    const { editing, ...data } = draft;
    const result = await panelService.publishPanel(interaction.guild, data);
    if (!result.ok) {
      return interaction.editReply({ embeds: [errorEmbed(t(`ticketPanels.wizard.error.${result.code}`))], components: [] });
    }
    wizard.clearDraft(interaction.user.id);
    return interaction.editReply({
      embeds: [successEmbed(t(editing ? 'ticketPanels.wizard.saved' : 'ticketPanels.wizard.published', { id: result.panel.id, channel: `<#${result.panel.channelId}>` }))],
      components: [],
    });
  },
};
