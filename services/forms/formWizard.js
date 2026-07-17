/**
 * Assistant de création/édition d'un formulaire (brouillon en mémoire par
 * administrateur) et magasin des réponses en cours de saisie (pending)
 * pour le flux de remplissage mixte menus + modal.
 *
 * Les formulaires publiés sont persistés (database/formRepository) ; seuls
 * les brouillons d'édition et les réponses en cours vivent en mémoire.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const formQuestionTypes = require('../../utils/constants/formQuestionTypes');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const MAX_QUESTIONS = 5; // limité par les contraintes des modals Discord
const drafts = new Map(); // userId → draft
const pending = new Map(); // `${guildId}:${userId}:${formId}` → { selects: {index: [values]} }

function startCreate(userId, guildId, name) {
  const draft = { id: null, guildId, name: name || 'Formulaire', description: '', channelId: null, allowedRoleIds: [], questions: [], editing: false };
  drafts.set(userId, draft);
  return draft;
}

function startEdit(userId, form) {
  const draft = { ...form, editing: true, questions: form.questions.map((q) => ({ ...q })) };
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
  const embed = infoEmbed(
    draft.editing ? t('forms.wizard.editTitle') : t('forms.wizard.createTitle'),
    `${t('forms.wizard.help')}\n\n**${draft.name}**\n${draft.description || t('forms.wizard.noDescription')}`,
  ).addFields(
    { name: t('common.channel'), value: draft.channelId ? `<#${draft.channelId}>` : t('forms.wizard.notSet'), inline: true },
    { name: t('forms.wizard.allowedRoles'), value: draft.allowedRoleIds.length ? draft.allowedRoleIds.map((id) => `<@&${id}>`).join(' ') : t('forms.wizard.everyone'), inline: true },
    {
      name: t('forms.wizard.questions', { count: draft.questions.length, max: MAX_QUESTIONS }),
      value: draft.questions.length ? draft.questions.map((q, i) => `**${i + 1}.** ${q.label} *(${formQuestionTypes[q.type]?.label})*`).join('\n') : t('forms.wizard.noQuestions'),
    },
  );

  const components = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('form:wchannel').setPlaceholder(t('forms.wizard.pickChannel')).addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('form:wroles').setPlaceholder(t('forms.wizard.pickRoles')).setMinValues(0).setMaxValues(10),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('form:qtype')
        .setPlaceholder(t('forms.wizard.addQuestion'))
        .setDisabled(draft.questions.length >= MAX_QUESTIONS)
        .addOptions(Object.values(formQuestionTypes).map((type) => ({ label: type.label, value: type.key }))),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('form:winfo').setLabel(t('forms.wizard.editInfo')).setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('form:wremove').setLabel(t('forms.wizard.removeLast')).setEmoji('➖').setStyle(ButtonStyle.Secondary).setDisabled(draft.questions.length === 0),
      new ButtonBuilder().setCustomId('form:wpublish').setLabel(draft.editing ? t('forms.wizard.save') : t('forms.wizard.publish')).setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(draft.questions.length === 0 || !draft.channelId),
      new ButtonBuilder().setCustomId('form:wcancel').setLabel(t('forms.wizard.cancel')).setEmoji('✖️').setStyle(ButtonStyle.Danger),
    ),
  ];
  return { embeds: [embed], components };
}

// --- Réponses en cours (flux de remplissage) ---

function pendingKey(guildId, userId, formId) {
  return `${guildId}:${userId}:${formId}`;
}

function startPending(guildId, userId, formId) {
  pending.set(pendingKey(guildId, userId, formId), { selects: {} });
}

function setPendingSelect(guildId, userId, formId, index, values) {
  const key = pendingKey(guildId, userId, formId);
  const entry = pending.get(key) ?? { selects: {} };
  entry.selects[index] = values;
  pending.set(key, entry);
}

function getPending(guildId, userId, formId) {
  return pending.get(pendingKey(guildId, userId, formId)) ?? { selects: {} };
}

function clearPending(guildId, userId, formId) {
  pending.delete(pendingKey(guildId, userId, formId));
}

module.exports = {
  MAX_QUESTIONS,
  startCreate,
  startEdit,
  getDraft,
  clearDraft,
  buildPanel,
  startPending,
  setPendingSelect,
  getPending,
  clearPending,
};
