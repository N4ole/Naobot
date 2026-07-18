/**
 * Assistant de configuration du captcha (commande `captcha setup`).
 * Un brouillon par administrateur ; l'assistant construit les vues et le
 * modal, la persistance est déléguée au repository (fusion dans la config
 * existante, sans toucher à l'état activé/désactivé ni aux vérifications en
 * cours).
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const captchaTypes = require('../../utils/constants/captchaTypes');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const drafts = new Map();

function startFrom(userId, config) {
  const draft = {
    channelId: config.channelId,
    tempRoleId: config.tempRoleId,
    verifiedRoleId: config.verifiedRoleId,
    timeoutMinutes: config.timeoutMinutes,
    type: config.type,
    message: config.message,
    maxAttempts: config.maxAttempts,
  };
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
  const type = captchaTypes[draft.type] ?? captchaTypes.button;
  return infoEmbed(t('captcha.wizard.title'), t('captcha.wizard.help')).addFields(
    { name: t('captcha.field.channel'), value: draft.channelId ? `<#${draft.channelId}>` : t('captcha.wizard.notSet'), inline: true },
    { name: t('captcha.field.tempRole'), value: draft.tempRoleId ? `<@&${draft.tempRoleId}>` : t('captcha.wizard.none'), inline: true },
    { name: t('captcha.field.verifiedRole'), value: draft.verifiedRoleId ? `<@&${draft.verifiedRoleId}>` : t('captcha.wizard.notSet'), inline: true },
    { name: t('captcha.field.type'), value: `${type.emoji} ${type.label}`, inline: true },
    { name: t('captcha.field.timeout'), value: draft.timeoutMinutes > 0 ? t('captcha.wizard.minutes', { count: draft.timeoutMinutes }) : t('captcha.wizard.noTimeout'), inline: true },
    { name: t('captcha.field.attempts'), value: String(draft.maxAttempts), inline: true },
    { name: t('captcha.field.message'), value: draft.message || '—' },
  );
}

function buildMainView(draft) {
  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('captcha:wchannel').setPlaceholder(t('captcha.wizard.pickChannel')).addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('captcha:wtemprole').setPlaceholder(t('captcha.wizard.pickTempRole')).setMinValues(0).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('captcha:wverifiedrole').setPlaceholder(t('captcha.wizard.pickVerifiedRole')).setMinValues(1).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('captcha:wtype').setPlaceholder(t('captcha.wizard.pickType')).addOptions(
        Object.values(captchaTypes).map((type) => ({ label: type.label, value: type.key, description: type.description, emoji: type.emoji, default: draft.type === type.key })),
      ),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('captcha:woptions').setLabel(t('captcha.wizard.options')).setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('captcha:wsave').setLabel(t('captcha.wizard.save')).setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!draft.channelId || !draft.verifiedRoleId),
      new ButtonBuilder().setCustomId('captcha:wcancel').setLabel(t('captcha.wizard.cancel')).setEmoji('✖️').setStyle(ButtonStyle.Danger),
    ),
  ];
  return { embeds: [statusEmbed(draft)], components: rows };
}

function optionsModal(draft) {
  return new ModalBuilder().setCustomId('captcha:woptionsmodal').setTitle(t('captcha.wizard.optionsTitle')).addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('message').setLabel(t('captcha.field.message')).setStyle(TextInputStyle.Paragraph).setValue(draft.message ?? '').setRequired(true).setMaxLength(1000),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('timeout').setLabel(t('captcha.wizard.timeoutLabel')).setStyle(TextInputStyle.Short).setValue(String(draft.timeoutMinutes ?? 5)).setRequired(false),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('attempts').setLabel(t('captcha.wizard.attemptsLabel')).setStyle(TextInputStyle.Short).setValue(String(draft.maxAttempts ?? 3)).setRequired(false),
    ),
  );
}

function applyOptions(draft, fields) {
  const message = fields.getTextInputValue('message').trim();
  if (message) draft.message = message.slice(0, 1000);
  const timeout = Number.parseInt(fields.getTextInputValue('timeout'), 10);
  draft.timeoutMinutes = Number.isInteger(timeout) && timeout >= 0 ? Math.min(timeout, 1440) : draft.timeoutMinutes;
  const attempts = Number.parseInt(fields.getTextInputValue('attempts'), 10);
  draft.maxAttempts = Number.isInteger(attempts) && attempts >= 1 ? Math.min(attempts, 10) : draft.maxAttempts;
}

module.exports = { startFrom, getDraft, clearDraft, buildMainView, optionsModal, applyOptions };
