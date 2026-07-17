/**
 * Assistant de création / édition d'un panneau de tickets.
 * Un brouillon par administrateur ; l'assistant construit les vues et le
 * modal de contenu, la persistance/publication est déléguée au
 * ticketPanelService.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const service = require('./ticketPanelService');
const categoryService = require('../ticketCategories/ticketCategoryService');
const { parseColor } = require('../ticketCategories/ticketCategoryService');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const DISPLAY_MODES = [
  { key: 'buttons', label: 'Boutons' },
  { key: 'select', label: 'Menu déroulant' },
];

const drafts = new Map();

function startCreate(userId, guildId) {
  const draft = { ...service.defaults(guildId), editing: false };
  drafts.set(userId, draft);
  return draft;
}

function startEdit(userId, panel) {
  const draft = { ...panel, editing: true };
  drafts.set(userId, draft);
  return draft;
}

function getDraft(userId) {
  return drafts.get(userId) ?? null;
}

function clearDraft(userId) {
  drafts.delete(userId);
}

function statusEmbed(draft) {
  const categories = categoryService.listCategories(draft.guildId);
  const selected = draft.categoryIds
    .map((id) => categories.find((category) => category.id === id))
    .filter(Boolean)
    .map((category) => `${category.emoji ?? '🎫'} ${category.name}`);
  const embed = infoEmbed(
    draft.editing ? t('ticketPanels.wizard.editTitle') : t('ticketPanels.wizard.createTitle'),
    t('ticketPanels.wizard.help'),
  );
  if (draft.color != null) embed.setColor(draft.color);
  embed.addFields(
    { name: t('ticketPanels.field.title'), value: draft.title || '—', inline: true },
    { name: t('ticketPanels.field.channel'), value: draft.channelId ? `<#${draft.channelId}>` : t('ticketPanels.wizard.notSet'), inline: true },
    { name: t('ticketPanels.field.display'), value: DISPLAY_MODES.find((mode) => mode.key === draft.displayMode)?.label ?? draft.displayMode, inline: true },
    { name: t('ticketPanels.field.description'), value: draft.description || '—' },
    { name: t('ticketPanels.field.categories'), value: selected.length ? selected.join('\n') : t('ticketPanels.wizard.noCategories') },
  );
  return embed;
}

function buildMainView(draft) {
  const categories = categoryService.listCategories(draft.guildId);
  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('ticketpanel:wchannel').setPlaceholder(t('ticketPanels.wizard.pickChannel')).addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1),
    ),
  ];
  if (categories.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketpanel:wcategories')
          .setPlaceholder(t('ticketPanels.wizard.pickCategories'))
          .setMinValues(0)
          .setMaxValues(Math.min(categories.length, 25))
          .addOptions(
            categories.slice(0, 25).map((category) => ({
              label: category.name.slice(0, 100),
              value: category.id,
              emoji: category.emoji ?? undefined,
              default: draft.categoryIds.includes(category.id),
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('ticketpanel:wmode').setPlaceholder(t('ticketPanels.wizard.pickDisplay')).addOptions(
        DISPLAY_MODES.map((mode) => ({ label: mode.label, value: mode.key, default: draft.displayMode === mode.key })),
      ),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticketpanel:wcontent').setLabel(t('ticketPanels.wizard.content')).setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticketpanel:wsave').setLabel(draft.editing ? t('ticketPanels.wizard.save') : t('ticketPanels.wizard.publish')).setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!draft.channelId || draft.categoryIds.length === 0),
      new ButtonBuilder().setCustomId('ticketpanel:wcancel').setLabel(t('ticketPanels.wizard.cancel')).setEmoji('✖️').setStyle(ButtonStyle.Danger),
    ),
  );
  return { embeds: [statusEmbed(draft)], components: rows };
}

function contentModal(draft) {
  const field = (id, label, style, value, placeholder) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(false);
    if (value != null && value !== '') input.setValue(String(value));
    if (placeholder) input.setPlaceholder(placeholder);
    return new ActionRowBuilder().addComponents(input);
  };
  return new ModalBuilder().setCustomId('ticketpanel:wcontentmodal').setTitle(t('ticketPanels.wizard.contentTitle')).addComponents(
    field('title', t('ticketPanels.field.title'), TextInputStyle.Short, draft.title),
    field('description', t('ticketPanels.field.description'), TextInputStyle.Paragraph, draft.description),
    field('color', t('ticketPanels.field.color'), TextInputStyle.Short, draft.color != null ? `#${draft.color.toString(16).padStart(6, '0')}` : '', '#5865f2'),
    field('image', t('ticketPanels.field.image'), TextInputStyle.Short, draft.imageUrl, 'https://…'),
    field('footer', t('ticketPanels.field.footer'), TextInputStyle.Short, draft.footer),
  );
}

function applyContent(draft, fields) {
  draft.title = fields.getTextInputValue('title').trim().slice(0, 240) || draft.title;
  draft.description = fields.getTextInputValue('description').trim().slice(0, 2000);
  draft.color = parseColor(fields.getTextInputValue('color'));
  const image = fields.getTextInputValue('image').trim();
  draft.imageUrl = /^https?:\/\/\S+$/i.test(image) ? image : null;
  draft.footer = fields.getTextInputValue('footer').trim().slice(0, 200);
}

module.exports = {
  DISPLAY_MODES,
  startCreate,
  startEdit,
  getDraft,
  clearDraft,
  buildMainView,
  contentModal,
  applyContent,
};
