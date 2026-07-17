/**
 * Assistant de création d'un sondage (brouillon en mémoire par utilisateur).
 * Le brouillon (titre, description, choix, durée, salon, mode) se configure
 * via un panneau (menus + modal), puis est publié par pollService.
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
const pollService = require('./pollService');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { parseWhen } = require('../../utils/helpers/whenParser');
const { t } = require('../../utils/helpers/i18n');

const MAX_OPTIONS = 20;
const drafts = new Map();

function startDraft(userId, guildId, title) {
  const draft = { guildId, channelId: null, title: title || 'Sondage', description: '', options: [], mode: 'single', durationMs: null };
  drafts.set(userId, draft);
  return draft;
}

function getDraft(userId) {
  return drafts.get(userId) ?? null;
}

function clearDraft(userId) {
  drafts.delete(userId);
}

function buildPanel(draft) {
  const embed = infoEmbed(t('polls.wizard.title'), t('polls.wizard.help')).addFields(
    { name: t('polls.wizard.pTitle'), value: draft.title || '—' },
    { name: t('polls.field.description'), value: draft.description || t('polls.wizard.noDescription') },
    { name: t('polls.field.options'), value: draft.options.length ? draft.options.map((o, i) => `${i + 1}. ${o}`).join('\n') : t('polls.wizard.noOptions') },
    { name: t('common.channel'), value: draft.channelId ? `<#${draft.channelId}>` : t('polls.wizard.notSet'), inline: true },
    { name: t('polls.field.mode'), value: pollService.MODES[draft.mode].label, inline: true },
    { name: t('polls.wizard.duration'), value: draft.durationMs ? formatDuration(draft.durationMs) : t('polls.wizard.noDuration'), inline: true },
  );
  const components = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('poll:wchannel').setPlaceholder(t('polls.wizard.pickChannel')).addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('poll:wmode').setPlaceholder(t('polls.wizard.pickMode')).addOptions(
        Object.values(pollService.MODES).map((mode) => ({ label: mode.label, value: mode.key, default: draft.mode === mode.key })),
      ),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('poll:wedit').setLabel(t('polls.wizard.edit')).setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('poll:wpublish').setLabel(t('polls.wizard.publish')).setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(draft.options.length < 2 || !draft.channelId),
      new ButtonBuilder().setCustomId('poll:wcancel').setLabel(t('polls.wizard.cancel')).setEmoji('✖️').setStyle(ButtonStyle.Danger),
    ),
  ];
  return { embeds: [embed], components };
}

/** Modal d'édition du contenu du sondage (titre, description, choix, durée). */
function editModal(draft) {
  const field = (id, label, style, value, required, placeholder) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
    if (value) input.setValue(String(value));
    if (placeholder) input.setPlaceholder(placeholder);
    return new ActionRowBuilder().addComponents(input);
  };
  return new ModalBuilder()
    .setCustomId('poll:weditmodal')
    .setTitle(t('polls.wizard.editModalTitle'))
    .addComponents(
      field('title', t('polls.wizard.fieldTitle'), TextInputStyle.Short, draft.title, true),
      field('description', t('polls.wizard.fieldDescription'), TextInputStyle.Paragraph, draft.description, false),
      field('options', t('polls.wizard.fieldOptions'), TextInputStyle.Paragraph, draft.options.join('\n'), true, t('polls.wizard.optionsPlaceholder')),
      field('duration', t('polls.wizard.fieldDuration'), TextInputStyle.Short, draft.durationMs ? formatDuration(draft.durationMs) : '', false, t('polls.wizard.durationPlaceholder')),
    );
}

/** Applique les champs du modal d'édition au brouillon. */
function applyEdit(draft, fields) {
  draft.title = (fields.getTextInputValue('title').trim() || draft.title).slice(0, 120);
  draft.description = fields.getTextInputValue('description').trim().slice(0, 500);
  draft.options = fields
    .getTextInputValue('options')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_OPTIONS)
    .map((line) => line.slice(0, 100));

  const durationInput = fields.getTextInputValue('duration').trim();
  if (!durationInput) {
    draft.durationMs = null;
  } else {
    const parsed = parseWhen(durationInput);
    if (!parsed.error) draft.durationMs = Math.max(0, parsed.at - Date.now());
  }
  return draft;
}

module.exports = { MAX_OPTIONS, startDraft, getDraft, clearDraft, buildPanel, editModal, applyEdit };
