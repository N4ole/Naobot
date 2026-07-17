/**
 * Assistant de création / édition d'une catégorie de tickets.
 *
 * Un brouillon par administrateur est conservé en mémoire le temps de la
 * configuration (les catégories publiées, elles, sont persistées). L'assistant
 * construit les vues (embeds + composants) et les modals ; la persistance est
 * déléguée à ticketCategoryService.
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
  UserSelectMenuBuilder,
} = require('discord.js');
const service = require('./ticketCategoryService');
const ticketVariables = require('../../utils/constants/ticketVariables');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

/** Map<userId, draft> — un brouillon par administrateur. */
const drafts = new Map();

function startCreate(userId, guildId) {
  const draft = { ...service.defaults(guildId), editing: false };
  drafts.set(userId, draft);
  return draft;
}

function startEdit(userId, category) {
  const draft = { ...category, editing: true };
  drafts.set(userId, draft);
  return draft;
}

function getDraft(userId) {
  return drafts.get(userId) ?? null;
}

function clearDraft(userId) {
  drafts.delete(userId);
}

// ---------------------------------------------------------------------------
// Vues
// ---------------------------------------------------------------------------

function humanHours(hours) {
  return hours > 0 ? t('ticketCategories.wizard.hours', { count: hours }) : t('ticketCategories.wizard.off');
}

function statusEmbed(draft) {
  const embed = infoEmbed(
    `${draft.emoji ?? '🎫'} ${draft.editing ? t('ticketCategories.wizard.editTitle') : t('ticketCategories.wizard.createTitle')}`,
    t('ticketCategories.wizard.help'),
  );
  if (draft.color != null) embed.setColor(draft.color);
  embed.addFields(
    { name: t('ticketCategories.field.name'), value: draft.name || '—', inline: true },
    { name: t('ticketCategories.field.emoji'), value: draft.emoji || '—', inline: true },
    { name: t('ticketCategories.field.openMode'), value: service.OPEN_MODES[draft.openMode]?.label ?? draft.openMode, inline: true },
    { name: t('ticketCategories.field.description'), value: draft.description || '—' },
    { name: t('ticketCategories.field.discordCategory'), value: draft.discordCategoryId ? `<#${draft.discordCategoryId}>` : t('ticketCategories.wizard.notSet'), inline: true },
    { name: t('ticketCategories.field.channelFormat'), value: `\`${draft.channelFormat}\``, inline: true },
    { name: t('ticketCategories.field.accessRoles'), value: draft.accessRoleIds.length ? draft.accessRoleIds.map((id) => `<@&${id}>`).join(' ') : t('ticketCategories.wizard.none'), inline: false },
    { name: t('ticketCategories.field.ping'), value: [...draft.pingRoleIds.map((id) => `<@&${id}>`), ...draft.pingUserIds.map((id) => `<@${id}>`)].join(' ') || t('ticketCategories.wizard.none'), inline: true },
    { name: t('ticketCategories.field.logChannel'), value: draft.logChannelId ? `<#${draft.logChannelId}>` : t('ticketCategories.wizard.globalLog'), inline: true },
    {
      name: t('ticketCategories.field.behavior'),
      value: t('ticketCategories.wizard.behaviorValue', {
        maxOpen: draft.maxOpen,
        cooldown: draft.cooldownMs > 0 ? formatDuration(draft.cooldownMs) : t('ticketCategories.wizard.off'),
        autoClose: humanHours(draft.autoCloseHours),
        autoDelete: humanHours(draft.autoDeleteHours),
        archive: draft.archive ? t('ticketCategories.wizard.yes') : t('ticketCategories.wizard.no'),
      }),
    },
  );
  return embed;
}

function buildMainView(draft) {
  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('ticketcategory:wcat').setPlaceholder(t('ticketCategories.wizard.pickDiscordCategory')).addChannelTypes(ChannelType.GuildCategory).setMinValues(1).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('ticketcategory:wroles').setPlaceholder(t('ticketCategories.wizard.pickAccessRoles')).setMinValues(0).setMaxValues(20),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('ticketcategory:wmode').setPlaceholder(t('ticketCategories.wizard.pickOpenMode')).addOptions(
        Object.values(service.OPEN_MODES).map((mode) => ({ label: mode.label, value: mode.key, default: draft.openMode === mode.key })),
      ),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticketcategory:widentity').setLabel(t('ticketCategories.wizard.identity')).setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticketcategory:wchannelmsg').setLabel(t('ticketCategories.wizard.channelMsg')).setEmoji('📝').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticketcategory:wbehavior').setLabel(t('ticketCategories.wizard.behaviorBtn')).setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticketcategory:wnotify').setLabel(t('ticketCategories.wizard.notify')).setEmoji('🔔').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticketcategory:wsave').setLabel(draft.editing ? t('ticketCategories.wizard.save') : t('ticketCategories.wizard.create')).setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!draft.name || !draft.discordCategoryId),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticketcategory:wcancel').setLabel(t('ticketCategories.wizard.cancel')).setEmoji('✖️').setStyle(ButtonStyle.Danger),
    ),
  ];
  return { embeds: [statusEmbed(draft)], components: rows };
}

function buildNotifyView(draft) {
  const rows = [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('ticketcategory:wpingroles').setPlaceholder(t('ticketCategories.wizard.pickPingRoles')).setMinValues(0).setMaxValues(20),
    ),
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId('ticketcategory:wpingusers').setPlaceholder(t('ticketCategories.wizard.pickPingUsers')).setMinValues(0).setMaxValues(20),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('ticketcategory:wlog').setPlaceholder(t('ticketCategories.wizard.pickLogChannel')).addChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticketcategory:wback').setLabel(t('ticketCategories.wizard.back')).setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    ),
  ];
  const embed = infoEmbed(t('ticketCategories.wizard.notifyTitle'), t('ticketCategories.wizard.notifyHelp'));
  return { embeds: [embed], components: rows };
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function field(id, label, style, value, required, placeholder) {
  const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
  if (value != null && value !== '') input.setValue(String(value));
  if (placeholder) input.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(input);
}

function identityModal(draft) {
  return new ModalBuilder().setCustomId('ticketcategory:widentitymodal').setTitle(t('ticketCategories.wizard.identityTitle')).addComponents(
    field('name', t('ticketCategories.field.name'), TextInputStyle.Short, draft.name, true),
    field('emoji', t('ticketCategories.field.emoji'), TextInputStyle.Short, draft.emoji, false, '🎫'),
    field('color', t('ticketCategories.field.color'), TextInputStyle.Short, draft.color != null ? `#${draft.color.toString(16).padStart(6, '0')}` : '', false, '#5865f2'),
    field('description', t('ticketCategories.field.description'), TextInputStyle.Paragraph, draft.description, false),
  );
}

function channelMsgModal(draft) {
  return new ModalBuilder().setCustomId('ticketcategory:wchannelmsgmodal').setTitle(t('ticketCategories.wizard.channelMsgTitle')).addComponents(
    field('channelFormat', t('ticketCategories.field.channelFormat'), TextInputStyle.Short, draft.channelFormat, true, 'support-{counter}'),
    field('welcomeMessage', t('ticketCategories.field.welcomeMessage'), TextInputStyle.Paragraph, draft.welcomeMessage, false, t('ticketCategories.wizard.welcomePlaceholder')),
  );
}

function behaviorModal(draft) {
  return new ModalBuilder().setCustomId('ticketcategory:wbehaviormodal').setTitle(t('ticketCategories.wizard.behaviorTitle')).addComponents(
    field('maxOpen', t('ticketCategories.wizard.maxOpenLabel'), TextInputStyle.Short, draft.maxOpen, false, '1'),
    field('cooldown', t('ticketCategories.wizard.cooldownLabel'), TextInputStyle.Short, draft.cooldownMs > 0 ? Math.round(draft.cooldownMs / 60000) : '', false, '0'),
    field('autoClose', t('ticketCategories.wizard.autoCloseLabel'), TextInputStyle.Short, draft.autoCloseHours || '', false, '0'),
    field('autoDelete', t('ticketCategories.wizard.autoDeleteLabel'), TextInputStyle.Short, draft.autoDeleteHours || '', false, '0'),
    field('archive', t('ticketCategories.wizard.archiveLabel'), TextInputStyle.Short, draft.archive ? 'oui' : 'non', false, 'oui / non'),
  );
}

// ---------------------------------------------------------------------------
// Application des modals
// ---------------------------------------------------------------------------

function applyIdentity(draft, fields) {
  draft.name = fields.getTextInputValue('name').trim().slice(0, 90) || draft.name;
  draft.emoji = service.parseEmoji(fields.getTextInputValue('emoji')) ?? draft.emoji;
  draft.color = service.parseColor(fields.getTextInputValue('color'));
  draft.description = fields.getTextInputValue('description').trim().slice(0, 500);
}

function applyChannelMsg(draft, fields) {
  const format = fields.getTextInputValue('channelFormat').trim();
  draft.channelFormat = format || draft.channelFormat;
  draft.welcomeMessage = fields.getTextInputValue('welcomeMessage').trim().slice(0, 1500);
}

function applyBehavior(draft, fields) {
  draft.maxOpen = service.parseBoundedInt(fields.getTextInputValue('maxOpen'), { min: 0, max: 50, fallback: draft.maxOpen });
  draft.cooldownMs = service.parseBoundedInt(fields.getTextInputValue('cooldown'), { min: 0, max: 100000, fallback: 0 }) * 60000;
  draft.autoCloseHours = service.parseBoundedInt(fields.getTextInputValue('autoClose'), { min: 0, max: 8760, fallback: 0 });
  draft.autoDeleteHours = service.parseBoundedInt(fields.getTextInputValue('autoDelete'), { min: 0, max: 8760, fallback: 0 });
  draft.archive = /^(o|oui|y|yes|1|true)$/i.test(fields.getTextInputValue('archive').trim());
}

module.exports = {
  startCreate,
  startEdit,
  getDraft,
  clearDraft,
  buildMainView,
  buildNotifyView,
  identityModal,
  channelMsgModal,
  behaviorModal,
  applyIdentity,
  applyChannelMsg,
  applyBehavior,
  ticketVariables,
};
