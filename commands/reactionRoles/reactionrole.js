/**
 * Commande reactionrole : gestion des panneaux de rôles réactions.
 *
 * Actions (slash choices / arguments préfixés) :
 *   reactionrole create        → assistant de création interactif
 *   reactionrole edit <id>     → assistant d'édition d'un panneau
 *   reactionrole delete <id>   → suppression (confirmation par boutons)
 *   reactionrole list          → liste paginée des panneaux
 *
 * Ce fichier porte aussi TOUS les composants du système (customId
 * `reactionrole:*`) :
 *  - live (tout membre) : `toggle` (bouton) et `select` (menu) ;
 *  - gestion (Gérer les rôles) : assistant `w*`, `list`, `del*`.
 *
 * La logique métier vit dans services/reactionRoles ; la sécurité
 * d'attribution dans middlewares/reactionRoles.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const reactionRoleService = require('../../services/reactionRoles/reactionRoleService');
const wizard = require('../../services/reactionRoles/reactionRoleWizard');
const reactionRoleModes = require('../../utils/constants/reactionRoleModes');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const PAGE_SIZE = 5;

function canManage(member) {
  return member.permissions.has(PermissionFlagsBits.ManageRoles);
}

function ephemeral(embed) {
  return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

// ---------------------------------------------------------------------------
// Liste paginée
// ---------------------------------------------------------------------------

function buildListPayload(guild, userId, page) {
  const panels = Object.values(reactionRoleService.getGuildPanels(guild.id));
  if (panels.length === 0) {
    return { embeds: [infoEmbed(t('reactionRoles.list.title'), t('reactionRoles.list.empty'))], components: [] };
  }
  const pageCount = Math.ceil(panels.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  const slice = panels.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const lines = slice.map((panel) =>
    t('reactionRoles.list.entry', {
      id: panel.id,
      channel: panel.channelId,
      roles: panel.roles.length,
      mode: reactionRoleModes[panel.mode]?.label ?? panel.mode,
      date: Math.floor(Date.parse(panel.createdAt) / 1000),
    }),
  );
  const embed = infoEmbed(t('reactionRoles.list.title'), lines.join('\n\n')).setFooter({
    text: `Page ${current + 1}/${pageCount}`,
  });
  const components =
    pageCount > 1
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`reactionrole:list:${userId}:${current}:prev`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
            new ButtonBuilder().setCustomId(`reactionrole:list:${userId}:${current}:next`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pageCount - 1),
          ),
        ]
      : [];
  return { embeds: [embed], components };
}

// ---------------------------------------------------------------------------
// Suppression : confirmation
// ---------------------------------------------------------------------------

function deleteConfirmPayload(userId, panel) {
  return {
    embeds: [infoEmbed(t('reactionRoles.delete.title'), t('reactionRoles.delete.confirm', { id: panel.id, channel: panel.channelId, roles: panel.roles.length }))],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`reactionrole:delmsg:${userId}:${panel.id}`).setLabel(t('reactionRoles.delete.withMessage')).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`reactionrole:delcfg:${userId}:${panel.id}`).setLabel(t('reactionRoles.delete.configOnly')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`reactionrole:delcancel:${userId}:${panel.id}`).setLabel(t('reactionRoles.delete.cancel')).setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

// ---------------------------------------------------------------------------
// Commande
// ---------------------------------------------------------------------------

module.exports = {
  name: 'reactionrole',
  description: 'Gère les panneaux de rôles réactions (assistant interactif)',
  usage: 'reactionrole <create|edit|delete|list> [identifiant]',
  examples: ['reactionrole create', 'reactionrole list', 'reactionrole edit a1b2c3d4', 'reactionrole delete a1b2c3d4'],
  aliases: ['rr', 'reactionroles'],
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
      return ctx.reply(buildListPayload(ctx.guild, ctx.user.id, 0));
    }

    if (action === 'edit' || action === 'delete') {
      if (!id) {
        return ctx.reply({ embeds: [errorEmbed(t('reactionRoles.errors.idRequired'))], ephemeral: true });
      }
      const panel = reactionRoleService.getPanel(ctx.guild.id, id);
      if (!panel) {
        return ctx.reply({ embeds: [errorEmbed(t('reactionRoles.errors.notFound', { id }))], ephemeral: true });
      }
      if (action === 'edit') {
        wizard.startEdit(ctx.user.id, panel);
        return ctx.reply({ ...wizard.buildMainView(wizard.getDraft(ctx.user.id)), ephemeral: true });
      }
      return ctx.reply(deleteConfirmPayload(ctx.user.id, panel));
    }

    return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `!${this.usage}` }))], ephemeral: true });
  },

  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return;
    const parts = interaction.customId.split(':');
    const action = parts[1];

    // --- Interactions live : accessibles à tout membre ---
    if (action === 'toggle') {
      return this._handleToggle(interaction, parts[2], parts[3]);
    }
    if (action === 'select') {
      return this._handleSelect(interaction, parts[2]);
    }

    // --- Gestion : réservée à « Gérer les rôles » ---
    if (!canManage(interaction.member)) {
      return interaction.reply(ephemeral(errorEmbed(t('reactionRoles.errors.noPermission'))));
    }

    if (action === 'list') return this._handleListNav(interaction, parts);
    if (['delmsg', 'delcfg', 'delcancel'].includes(action)) return this._handleDelete(interaction, action, parts[2], parts[3]);
    if (action.startsWith('w')) return this._handleWizard(interaction, action, parts);
    return undefined;
  },

  // --- Live ---
  async _handleToggle(interaction, panelId, roleId) {
    const panel = reactionRoleService.getPanel(interaction.guild.id, panelId);
    if (!panel) return interaction.reply(ephemeral(errorEmbed(t('reactionRoles.errors.panelGone'))));
    const result = await reactionRoleService.handleToggle(interaction.guild, interaction.member, panel, roleId);
    const messages = {
      added: () => t('reactionRoles.assign.added', { role: `<@&${roleId}>` }),
      removed: () => t('reactionRoles.assign.removed', { role: `<@&${roleId}>` }),
      limitReached: () => t('reactionRoles.assign.limitReached', { limit: result.limit }),
      notAssignable: () => t(`reactionRoles.assign.${result.detail}`, { role: `<@&${roleId}>` }),
      unknownRole: () => t('reactionRoles.errors.panelGone'),
    };
    const isSuccess = result.code === 'added' || result.code === 'removed';
    const embed = isSuccess ? successEmbed(messages[result.code]()) : errorEmbed((messages[result.code] ?? messages.unknownRole)());
    return interaction.reply(ephemeral(embed));
  },

  async _handleSelect(interaction, panelId) {
    const panel = reactionRoleService.getPanel(interaction.guild.id, panelId);
    if (!panel) return interaction.reply(ephemeral(errorEmbed(t('reactionRoles.errors.panelGone'))));
    const result = await reactionRoleService.handleSelect(interaction.guild, interaction.member, panel, interaction.values);
    const parts = [];
    if (result.added.length) parts.push(t('reactionRoles.assign.addedList', { roles: result.added.map((id) => `<@&${id}>`).join(', ') }));
    if (result.removed.length) parts.push(t('reactionRoles.assign.removedList', { roles: result.removed.map((id) => `<@&${id}>`).join(', ') }));
    if (result.skipped.length) parts.push(t('reactionRoles.assign.skippedList', { roles: result.skipped.map((id) => `<@&${id}>`).join(', ') }));
    const text = parts.join('\n') || t('reactionRoles.assign.noChange');
    return interaction.reply(ephemeral(result.skipped.length && !result.added.length && !result.removed.length ? errorEmbed(text) : successEmbed(text)));
  },

  // --- Liste (pagination) ---
  async _handleListNav(interaction, parts) {
    const [, , requesterId, rawPage, direction] = parts;
    if (interaction.user.id !== requesterId) return interaction.deferUpdate();
    const current = Number.parseInt(rawPage, 10) || 0;
    return interaction.update(buildListPayload(interaction.guild, requesterId, direction === 'prev' ? current - 1 : current + 1));
  },

  // --- Suppression ---
  async _handleDelete(interaction, action, requesterId, panelId) {
    if (interaction.user.id !== requesterId) {
      return interaction.reply(ephemeral(errorEmbed(t('reactionRoles.errors.notYourSession'))));
    }
    if (action === 'delcancel') {
      return interaction.update({ embeds: [infoEmbed(t('reactionRoles.delete.title'), t('reactionRoles.delete.cancelled'))], components: [] });
    }
    const result = await reactionRoleService.deletePanel(interaction.guild, panelId, interaction.user, action === 'delmsg');
    return interaction.update({
      embeds: [result.ok ? successEmbed(t('reactionRoles.delete.done', { id: panelId })) : errorEmbed(t('reactionRoles.errors.notFound', { id: panelId }))],
      components: [],
    });
  },

  // --- Assistant de création / édition ---
  async _handleWizard(interaction, action, parts) {
    const draft = wizard.getDraft(interaction.user.id);
    if (!draft) return interaction.reply(ephemeral(errorEmbed(t('reactionRoles.wizard.expired'))));

    switch (action) {
      case 'wchannel':
        draft.channelId = interaction.channels.first()?.id ?? draft.channelId;
        return interaction.update(wizard.buildMainView(draft));
      case 'wroles':
        wizard.setRoles(draft, interaction.guild, interaction.values);
        return interaction.update(wizard.buildMainView(draft));
      case 'wmode': {
        draft.mode = interaction.values[0];
        if (draft.mode === 'limited') return interaction.showModal(wizard.limitModal(draft));
        return interaction.update(wizard.buildMainView(draft));
      }
      case 'wtext':
        return interaction.showModal(wizard.textModal(draft));
      case 'wtextmodal': {
        draft.title = interaction.fields.getTextInputValue('title').trim();
        draft.description = interaction.fields.getTextInputValue('description').trim();
        draft.footer = interaction.fields.getTextInputValue('footer').trim();
        draft.color = wizard.parseColor(interaction.fields.getTextInputValue('color'));
        draft.imageUrl = interaction.fields.getTextInputValue('image').trim() || null;
        return interaction.update(wizard.buildMainView(draft));
      }
      case 'wlimitmodal': {
        const value = Number.parseInt(interaction.fields.getTextInputValue('limit'), 10);
        draft.limit = Number.isInteger(value) && value > 0 ? value : draft.limit;
        return interaction.update(wizard.buildMainView(draft));
      }
      case 'wroleedit':
        return interaction.update(wizard.buildRoleEditorView(draft));
      case 'wroleselect': {
        const entry = draft.roles.find((role) => role.roleId === interaction.values[0]);
        if (!entry) return interaction.deferUpdate();
        return interaction.showModal(wizard.roleModal(entry));
      }
      case 'wrolemodal': {
        const entry = draft.roles.find((role) => role.roleId === parts[2]);
        if (entry) {
          entry.label = (interaction.fields.getTextInputValue('label').trim() || entry.label).slice(0, 80);
          entry.emoji = wizard.parseEmoji(interaction.fields.getTextInputValue('emoji'));
          entry.description = interaction.fields.getTextInputValue('description').trim() || null;
        }
        return interaction.update(wizard.buildRoleEditorView(draft));
      }
      case 'wback':
        return interaction.update(wizard.buildMainView(draft));
      case 'wcancel':
        wizard.clearDraft(interaction.user.id);
        return interaction.update({ embeds: [infoEmbed(t('reactionRoles.wizard.cancelledTitle'), t('reactionRoles.wizard.cancelled'))], components: [] });
      case 'wpublish':
        return this._handlePublish(interaction, draft);
      default:
        return undefined;
    }
  },

  async _handlePublish(interaction, draft) {
    if (!draft.channelId) return interaction.reply(ephemeral(errorEmbed(t('reactionRoles.wizard.needChannel'))));
    if (draft.roles.length === 0) return interaction.reply(ephemeral(errorEmbed(t('reactionRoles.wizard.needRoles'))));

    await interaction.deferUpdate();
    const result = draft.editing
      ? await reactionRoleService.updatePanel(interaction.guild, draft, interaction.user)
      : await reactionRoleService.publishPanel(interaction.guild, draft, interaction.user);

    if (!result.ok) {
      return interaction.editReply({ embeds: [errorEmbed(t(`reactionRoles.wizard.error.${result.code}`))], components: [] });
    }
    wizard.clearDraft(interaction.user.id);
    return interaction.editReply({
      embeds: [
        successEmbed(
          t(draft.editing ? 'reactionRoles.wizard.saved' : 'reactionRoles.wizard.published', {
            id: result.panel.id,
            channel: `<#${result.panel.channelId}>`,
          }),
        ),
      ],
      components: [],
    });
  },
};
