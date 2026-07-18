/**
 * Assistant de création / édition d'un générateur de salons vocaux
 * temporaires. Un brouillon par administrateur ; l'assistant construit les
 * vues (embed + composants) et le modal, la persistance est déléguée au
 * repository.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const drafts = new Map();

function newDraft(guildId) {
  return { guildId, channelId: null, categoryId: null, nameFormat: 'Salon de {user}', userLimit: 0, extraRoleIds: [], counter: 0, editing: false };
}

function startCreate(userId, guildId) {
  const draft = newDraft(guildId);
  drafts.set(userId, draft);
  return draft;
}

function startEdit(userId, generator) {
  const draft = { ...newDraft(generator.guildId), ...generator, editing: true };
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
  return infoEmbed(
    draft.editing ? t('tempVoice.wizard.editTitle') : t('tempVoice.wizard.createTitle'),
    t('tempVoice.wizard.help'),
  ).addFields(
    { name: t('tempVoice.field.generator'), value: draft.channelId ? `<#${draft.channelId}>` : t('tempVoice.wizard.notSet'), inline: true },
    { name: t('tempVoice.field.category'), value: draft.categoryId ? `<#${draft.categoryId}>` : t('tempVoice.wizard.sameAsGenerator'), inline: true },
    { name: t('tempVoice.field.limit'), value: draft.userLimit > 0 ? String(draft.userLimit) : t('tempVoice.wizard.unlimited'), inline: true },
    { name: t('tempVoice.field.format'), value: `\`${draft.nameFormat}\`` },
    { name: t('tempVoice.field.extraRoles'), value: draft.extraRoleIds.length ? draft.extraRoleIds.map((id) => `<@&${id}>`).join(' ') : t('tempVoice.wizard.none') },
  );
}

function buildMainView(draft) {
  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('voicecreate:wchannel').setPlaceholder(t('tempVoice.wizard.pickGenerator')).addChannelTypes(ChannelType.GuildVoice).setMinValues(1).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('voicecreate:wcategory').setPlaceholder(t('tempVoice.wizard.pickCategory')).addChannelTypes(ChannelType.GuildCategory).setMinValues(0).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('voicecreate:wroles').setPlaceholder(t('tempVoice.wizard.pickRoles')).setMinValues(0).setMaxValues(20),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('voicecreate:wformat').setLabel(t('tempVoice.wizard.format')).setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voicecreate:wsave').setLabel(draft.editing ? t('tempVoice.wizard.save') : t('tempVoice.wizard.create')).setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!draft.channelId),
      new ButtonBuilder().setCustomId('voicecreate:wcancel').setLabel(t('tempVoice.wizard.cancel')).setEmoji('✖️').setStyle(ButtonStyle.Danger),
    ),
  ];
  return { embeds: [statusEmbed(draft)], components: rows };
}

function formatModal(draft) {
  return new ModalBuilder().setCustomId('voicecreate:wformatmodal').setTitle(t('tempVoice.wizard.formatTitle')).addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('format').setLabel(t('tempVoice.wizard.formatLabel')).setStyle(TextInputStyle.Short).setValue(draft.nameFormat).setPlaceholder('Salon de {user}').setRequired(true).setMaxLength(100),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('limit').setLabel(t('tempVoice.wizard.limitLabel')).setStyle(TextInputStyle.Short).setValue(String(draft.userLimit || 0)).setPlaceholder('0 = illimité').setRequired(false),
    ),
  );
}

function applyFormat(draft, fields) {
  const format = fields.getTextInputValue('format').trim();
  if (format) draft.nameFormat = format.slice(0, 100);
  const limit = Number.parseInt(fields.getTextInputValue('limit'), 10);
  draft.userLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 99) : 0;
}

module.exports = { startCreate, startEdit, getDraft, clearDraft, buildMainView, formatModal, applyFormat };
