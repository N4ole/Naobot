/**
 * Commande ticketcategory : gestion des catégories de tickets (assistant
 * interactif). Actions : create / edit / delete / list. Réservée aux
 * administrateurs.
 *
 * Ce fichier porte aussi tous les composants de l'assistant de catégories
 * (customId « ticketcategory:* »). La logique métier vit dans
 * services/ticketCategories ; l'accès dans middlewares/tickets/ticketAccess.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const categoryService = require('../../services/ticketCategories/ticketCategoryService');
const wizard = require('../../services/ticketCategories/ticketCategoryWizard');
const panelService = require('../../services/ticketPanels/ticketPanelService');
const { isAdmin } = require('../../middlewares/tickets/ticketAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const PAGE_SIZE = 6;

function ephemeral(embed) {
  return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

async function refreshCategoryPanels(guild, categoryId) {
  for (const panel of panelService.panelsUsingCategory(guild.id, categoryId)) {
    await panelService.refreshPanel(guild, panel);
  }
}

function listPayload(guild, userId, page) {
  const categories = categoryService.listCategories(guild.id);
  if (categories.length === 0) {
    return { embeds: [infoEmbed(t('ticketCategories.list.title'), t('ticketCategories.list.empty'))], components: [] };
  }
  const pageCount = Math.ceil(categories.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  const lines = categories.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((category) =>
    t('ticketCategories.list.entry', {
      emoji: category.emoji ?? '🎫',
      name: category.name,
      id: category.id,
      counter: category.counter,
      channel: category.discordCategoryId ? `<#${category.discordCategoryId}>` : '—',
    }),
  );
  const embed = infoEmbed(t('ticketCategories.list.title', { count: categories.length }), lines.join('\n\n')).setFooter({ text: `Page ${current + 1}/${pageCount}` });
  const components = pageCount > 1
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticketcategory:list:${userId}:${current}:prev`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
        new ButtonBuilder().setCustomId(`ticketcategory:list:${userId}:${current}:next`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pageCount - 1),
      )]
    : [];
  return { embeds: [embed], components };
}

module.exports = {
  name: 'ticketcategory',
  description: 'Gère les catégories de tickets (assistant interactif)',
  usage: 'ticketcategory <create|edit|delete|list> [identifiant]',
  examples: ['ticketcategory create', 'ticketcategory list', 'ticketcategory edit a1b2c3d4', 'ticketcategory delete a1b2c3d4'],
  aliases: ['tcategory', 'ticketcat'],
  cooldown: 3,
  args: [
    { name: 'action', type: 'string', required: false, choices: ['create', 'edit', 'delete', 'list'], description: 'Action à effectuer' },
    { name: 'identifiant', type: 'string', required: false, description: 'Identifiant de la catégorie (edit / delete)' },
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
      if (!id) return ctx.reply({ embeds: [errorEmbed(t('ticketCategories.errors.idRequired'))], ephemeral: true });
      const category = categoryService.getCategory(ctx.guild.id, id);
      if (!category) return ctx.reply({ embeds: [errorEmbed(t('ticketCategories.errors.notFound', { id }))], ephemeral: true });
      if (action === 'edit') {
        wizard.startEdit(ctx.user.id, category);
        return ctx.reply({ ...wizard.buildMainView(wizard.getDraft(ctx.user.id)), ephemeral: true });
      }
      return ctx.reply({
        embeds: [infoEmbed(t('ticketCategories.delete.title'), t('ticketCategories.delete.confirm', { name: category.name, id: category.id }))],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ticketcategory:del:${ctx.user.id}:${category.id}`).setLabel(t('ticketCategories.delete.confirmButton')).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`ticketcategory:delcancel:${ctx.user.id}:${category.id}`).setLabel(t('ticketCategories.delete.cancelButton')).setStyle(ButtonStyle.Secondary),
        )],
        ephemeral: true,
      });
    }
    return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `!${this.usage}` }))], ephemeral: true });
  },

  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return undefined;
    if (!isAdmin(interaction.member)) return interaction.reply(ephemeral(errorEmbed(t('ticketCategories.errors.noPermission'))));
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

  async _handleDelete(interaction, action, requesterId, categoryId) {
    if (interaction.user.id !== requesterId) return interaction.reply(ephemeral(errorEmbed(t('ticketCategories.errors.notYourSession'))));
    if (action === 'delcancel') {
      return interaction.update({ embeds: [infoEmbed(t('ticketCategories.delete.title'), t('ticketCategories.delete.cancelled'))], components: [] });
    }
    const removed = categoryService.deleteCategory(interaction.guild.id, categoryId);
    await refreshCategoryPanels(interaction.guild, categoryId);
    return interaction.update({
      embeds: [removed ? successEmbed(t('ticketCategories.delete.done', { id: categoryId })) : errorEmbed(t('ticketCategories.errors.notFound', { id: categoryId }))],
      components: [],
    });
  },

  async _handleWizard(interaction, action) {
    const draft = wizard.getDraft(interaction.user.id);
    if (!draft) return interaction.reply(ephemeral(errorEmbed(t('ticketCategories.wizard.expired'))));

    switch (action) {
      case 'wcat':
        draft.discordCategoryId = interaction.channels.first()?.id ?? draft.discordCategoryId;
        return interaction.update(wizard.buildMainView(draft));
      case 'wroles':
        draft.accessRoleIds = [...interaction.roles.keys()];
        return interaction.update(wizard.buildMainView(draft));
      case 'wmode':
        draft.openMode = categoryService.OPEN_MODES[interaction.values[0]] ? interaction.values[0] : draft.openMode;
        return interaction.update(wizard.buildMainView(draft));
      case 'widentity':
        return interaction.showModal(wizard.identityModal(draft));
      case 'widentitymodal':
        wizard.applyIdentity(draft, interaction.fields);
        return interaction.update(wizard.buildMainView(draft));
      case 'wchannelmsg':
        return interaction.showModal(wizard.channelMsgModal(draft));
      case 'wchannelmsgmodal':
        wizard.applyChannelMsg(draft, interaction.fields);
        return interaction.update(wizard.buildMainView(draft));
      case 'wbehavior':
        return interaction.showModal(wizard.behaviorModal(draft));
      case 'wbehaviormodal':
        wizard.applyBehavior(draft, interaction.fields);
        return interaction.update(wizard.buildMainView(draft));
      case 'wnotify':
        return interaction.update(wizard.buildNotifyView(draft));
      case 'wpingroles':
        draft.pingRoleIds = [...interaction.roles.keys()];
        return interaction.update(wizard.buildNotifyView(draft));
      case 'wpingusers':
        draft.pingUserIds = [...interaction.users.keys()];
        return interaction.update(wizard.buildNotifyView(draft));
      case 'wlog':
        draft.logChannelId = interaction.channels.first()?.id ?? null;
        return interaction.update(wizard.buildNotifyView(draft));
      case 'wback':
        return interaction.update(wizard.buildMainView(draft));
      case 'wcancel':
        wizard.clearDraft(interaction.user.id);
        return interaction.update({ embeds: [infoEmbed(t('ticketCategories.wizard.cancelledTitle'), t('ticketCategories.wizard.cancelled'))], components: [] });
      case 'wsave':
        return this._handleSave(interaction, draft);
      default:
        return undefined;
    }
  },

  async _handleSave(interaction, draft) {
    if (!draft.name || !draft.discordCategoryId) {
      return interaction.reply(ephemeral(errorEmbed(t('ticketCategories.wizard.incomplete'))));
    }
    const { editing, ...data } = draft;
    const saved = editing ? categoryService.updateCategory(data) : categoryService.createCategory(data);
    wizard.clearDraft(interaction.user.id);
    await refreshCategoryPanels(interaction.guild, saved.id);
    return interaction.update({
      embeds: [successEmbed(t(editing ? 'ticketCategories.wizard.saved' : 'ticketCategories.wizard.created', { name: saved.name, id: saved.id }))],
      components: [],
    });
  },
};
