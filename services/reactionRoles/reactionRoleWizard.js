/**
 * Assistant interactif de création / édition d'un panneau de rôles réactions.
 *
 * Un brouillon (« draft ») par administrateur est conservé en mémoire le
 * temps de la configuration (perdu si le bot redémarre en pleine édition —
 * les panneaux publiés, eux, sont persistés). L'assistant construit les
 * vues (embeds + composants) ; la publication/mise à jour est déléguée au
 * reactionRoleService.
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
const reactionRoleService = require('./reactionRoleService');
const reactionRoleModes = require('../../utils/constants/reactionRoleModes');
const { infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const MAX_ROLES = 25;

/** Map<userId, draft> — un brouillon d'édition par administrateur. */
const drafts = new Map();

function newDraft(guildId) {
  return {
    id: null,
    guildId,
    channelId: null,
    title: '',
    description: '',
    color: null,
    imageUrl: null,
    footer: '',
    mode: 'multiple',
    limit: 3,
    roles: [],
    editing: false,
  };
}

function startCreate(userId, guildId) {
  const draft = newDraft(guildId);
  drafts.set(userId, draft);
  return draft;
}

/** Charge un panneau existant dans un brouillon d'édition. */
function startEdit(userId, panel) {
  const draft = { ...newDraft(panel.guildId), ...panel, editing: true };
  draft.roles = panel.roles.map((entry) => ({ ...entry }));
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
// Vue principale du constructeur
// ---------------------------------------------------------------------------

function statusEmbed(draft) {
  const modeLabel =
    draft.mode === 'limited'
      ? t('reactionRoles.panel.modeLimited', { limit: draft.limit })
      : reactionRoleModes[draft.mode]?.label ?? draft.mode;
  const lines = [
    t('reactionRoles.wizard.statusChannel', { channel: draft.channelId ? `<#${draft.channelId}>` : t('reactionRoles.wizard.notSet') }),
    t('reactionRoles.wizard.statusMode', { mode: modeLabel }),
    t('reactionRoles.wizard.statusRoles', { count: draft.roles.length }),
  ];
  return infoEmbed(
    draft.editing ? t('reactionRoles.wizard.editTitle') : t('reactionRoles.wizard.createTitle'),
    `${t('reactionRoles.wizard.help')}\n\n${lines.join('\n')}`,
  );
}

/** Vue complète du constructeur : instructions + aperçu + composants. */
function buildMainView(draft) {
  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('reactionrole:wchannel')
      .setPlaceholder(t('reactionRoles.wizard.pickChannel'))
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );
  const rolesRow = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('reactionrole:wroles')
      .setPlaceholder(t('reactionRoles.wizard.pickRoles'))
      .setMinValues(0)
      .setMaxValues(MAX_ROLES),
  );
  const modeRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('reactionrole:wmode')
      .setPlaceholder(t('reactionRoles.wizard.pickMode'))
      .addOptions(
        Object.values(reactionRoleModes).map((mode) => ({
          label: mode.label,
          value: mode.key,
          description: mode.description,
          emoji: mode.emoji,
          default: draft.mode === mode.key,
        })),
      ),
  );
  const buttonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('reactionrole:wtext').setLabel(t('reactionRoles.wizard.editText')).setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('reactionrole:wroleedit').setLabel(t('reactionRoles.wizard.editRoles')).setEmoji('🎭').setStyle(ButtonStyle.Secondary).setDisabled(draft.roles.length === 0),
    new ButtonBuilder().setCustomId('reactionrole:wpublish').setLabel(draft.editing ? t('reactionRoles.wizard.save') : t('reactionRoles.wizard.publish')).setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('reactionrole:wcancel').setLabel(t('reactionRoles.wizard.cancel')).setEmoji('✖️').setStyle(ButtonStyle.Danger),
  );

  return {
    embeds: [statusEmbed(draft), reactionRoleService.buildEmbed(draft)],
    components: [channelRow, rolesRow, modeRow, buttonsRow],
  };
}

// ---------------------------------------------------------------------------
// Éditeur des rôles (emoji / nom / description)
// ---------------------------------------------------------------------------

function buildRoleEditorView(draft) {
  const embed = infoEmbed(
    t('reactionRoles.wizard.roleEditorTitle'),
    draft.roles.length
      ? draft.roles
          .map((entry) => `${entry.emoji ? `${entry.emoji} ` : ''}**${entry.label}** — <@&${entry.roleId}>${entry.description ? `\n${entry.description}` : ''}`)
          .join('\n')
      : t('reactionRoles.wizard.noRoles'),
  );
  const rows = [];
  if (draft.roles.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('reactionrole:wroleselect')
          .setPlaceholder(t('reactionRoles.wizard.pickRoleToEdit'))
          .addOptions(draft.roles.slice(0, MAX_ROLES).map((entry) => ({ label: entry.label, value: entry.roleId, emoji: entry.emoji ?? undefined }))),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reactionrole:wback').setLabel(t('reactionRoles.wizard.back')).setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    ),
  );
  return { embeds: [embed], components: rows };
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function textModal(draft) {
  const field = (id, label, style, value, required) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
    if (value) input.setValue(String(value));
    return new ActionRowBuilder().addComponents(input);
  };
  return new ModalBuilder()
    .setCustomId('reactionrole:wtextmodal')
    .setTitle(t('reactionRoles.wizard.textModalTitle'))
    .addComponents(
      field('title', t('reactionRoles.wizard.fieldTitle'), TextInputStyle.Short, draft.title, false),
      field('description', t('reactionRoles.wizard.fieldDescription'), TextInputStyle.Paragraph, draft.description, false),
      field('footer', t('reactionRoles.wizard.fieldFooter'), TextInputStyle.Short, draft.footer, false),
      field('color', t('reactionRoles.wizard.fieldColor'), TextInputStyle.Short, draft.color != null ? `#${draft.color.toString(16).padStart(6, '0')}` : '', false),
      field('image', t('reactionRoles.wizard.fieldImage'), TextInputStyle.Short, draft.imageUrl, false),
    );
}

function limitModal(draft) {
  return new ModalBuilder()
    .setCustomId('reactionrole:wlimitmodal')
    .setTitle(t('reactionRoles.wizard.limitModalTitle'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('limit')
          .setLabel(t('reactionRoles.wizard.limitLabel'))
          .setStyle(TextInputStyle.Short)
          .setValue(String(draft.limit ?? 3))
          .setRequired(true),
      ),
    );
}

function roleModal(entry) {
  const field = (id, label, value) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(id === 'label');
    if (value) input.setValue(String(value));
    if (id === 'description') input.setMaxLength(100);
    return new ActionRowBuilder().addComponents(input);
  };
  return new ModalBuilder()
    .setCustomId(`reactionrole:wrolemodal:${entry.roleId}`)
    .setTitle(t('reactionRoles.wizard.roleModalTitle'))
    .addComponents(
      field('label', t('reactionRoles.wizard.roleLabel'), entry.label),
      field('emoji', t('reactionRoles.wizard.roleEmoji'), entry.emoji),
      field('description', t('reactionRoles.wizard.roleDescription'), entry.description),
    );
}

// ---------------------------------------------------------------------------
// Mutations du brouillon
// ---------------------------------------------------------------------------

/** Synchronise la liste des rôles choisis (conserve les métadonnées existantes). */
function setRoles(draft, guild, roleIds) {
  const existing = new Map(draft.roles.map((entry) => [entry.roleId, entry]));
  draft.roles = roleIds.slice(0, MAX_ROLES).map((roleId) => {
    if (existing.has(roleId)) return existing.get(roleId);
    const role = guild.roles.cache.get(roleId);
    return { roleId, emoji: null, label: (role?.name ?? 'Rôle').slice(0, 80), description: null };
  });
}

/** Parse une couleur hexadécimale (#rrggbb) en entier, ou null. */
function parseColor(input) {
  if (!input) return null;
  const match = input.trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? Number.parseInt(match[1], 16) : null;
}

/**
 * Valide un emoji : emoji personnalisé (`<:nom:id>` / `<a:nom:id>`) ou emoji
 * Unicode. Retourne la chaîne validée, ou null (le texte brut est ignoré
 * pour ne jamais casser le rendu des composants).
 */
function parseEmoji(input) {
  if (!input) return null;
  const s = input.trim();
  if (/^<a?:\w{2,}:\d{17,20}>$/.test(s)) return s;
  if (/\p{Extended_Pictographic}/u.test(s)) return s;
  return null;
}

module.exports = {
  MAX_ROLES,
  startCreate,
  startEdit,
  getDraft,
  clearDraft,
  buildMainView,
  buildRoleEditorView,
  textModal,
  limitModal,
  roleModal,
  setRoles,
  parseColor,
  parseEmoji,
};
