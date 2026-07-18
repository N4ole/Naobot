/**
 * Système de rôles réactions.
 *
 * Construit le message d'un panneau (embed + composants) en choisissant
 * automatiquement le composant le plus adapté (boutons si ≤ 5 rôles, sinon
 * menu déroulant), applique/retire les rôles selon le mode (multiple,
 * unique, limité) en respectant la hiérarchie Discord et les permissions du
 * bot, et journalise dans la catégorie de logs « roles-reactions ».
 *
 * Toute la logique vit ici ; l'assistant de création/édition
 * (reactionRoleWizard) et la commande ne font que composer ces briques.
 * Extensible (rôles temporaires, conditionnels, statistiques…) : le schéma
 * d'un panneau accepte de nouveaux champs, la persistance est isolée.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const repository = require('../../database/reactionRoleRepository');
const { roleAssignable } = require('../../middlewares/reactionRoles/reactionRoleAccess');
const reactionRoleModes = require('../../utils/constants/reactionRoleModes');
const logService = require('../logs/logService');
const { infoEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

/** Au-delà de ce nombre de rôles, un menu déroulant remplace les boutons. */
const BUTTON_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Construction du message
// ---------------------------------------------------------------------------

function buildEmbed(panel) {
  const embed = infoEmbed(panel.title || t('reactionRoles.panel.defaultTitle'), panel.description || null);
  embed.setColor(typeof panel.color === 'number' ? panel.color : COLORS.INFO);
  if (panel.imageUrl) embed.setImage(panel.imageUrl);
  if (panel.footer) embed.setFooter({ text: panel.footer });

  const mode = reactionRoleModes[panel.mode];
  const modeLabel =
    panel.mode === 'limited'
      ? t('reactionRoles.panel.modeLimited', { limit: panel.limit ?? 1 })
      : `${mode?.emoji ?? ''} ${mode?.label ?? panel.mode}`;
  if (panel.roles.length > 0) {
    embed.addFields({
      name: t('reactionRoles.panel.rolesField'),
      value: panel.roles
        .map((entry) => `${entry.emoji ? `${entry.emoji} ` : ''}<@&${entry.roleId}>${entry.description ? ` — ${entry.description}` : ''}`)
        .join('\n')
        .slice(0, 1024),
    });
  }
  embed.addFields({ name: t('reactionRoles.panel.modeField'), value: modeLabel, inline: true });
  return embed;
}

/** Composants live : boutons (≤ 5 rôles) ou menu déroulant (sinon). */
function buildComponents(panel) {
  if (panel.roles.length === 0) return [];

  if (panel.roles.length <= BUTTON_THRESHOLD) {
    const row = new ActionRowBuilder().addComponents(
      panel.roles.map((entry) => {
        const button = new ButtonBuilder()
          .setCustomId(`reactionrole:toggle:${panel.id}:${entry.roleId}`)
          .setLabel(entry.label || 'Rôle')
          .setStyle(ButtonStyle.Secondary);
        // Un emoji invalide ne doit jamais empêcher le rendu du panneau.
        if (entry.emoji) {
          try {
            button.setEmoji(entry.emoji);
          } catch {
            /* emoji ignoré */
          }
        }
        return button;
      }),
    );
    return [row];
  }

  const maxValues =
    panel.mode === 'unique'
      ? 1
      : panel.mode === 'limited'
        ? Math.min(panel.limit ?? 1, panel.roles.length)
        : panel.roles.length;
  const select = new StringSelectMenuBuilder()
    .setCustomId(`reactionrole:select:${panel.id}`)
    .setPlaceholder(t('reactionRoles.panel.selectPlaceholder'))
    .setMinValues(0)
    .setMaxValues(Math.max(1, maxValues))
    .addOptions(
      panel.roles.map((entry) => {
        const option = { label: entry.label || 'Rôle', value: entry.roleId };
        if (entry.description) option.description = entry.description.slice(0, 100);
        if (entry.emoji) option.emoji = entry.emoji;
        return option;
      }),
    );
  return [new ActionRowBuilder().addComponents(select)];
}

function buildMessagePayload(panel) {
  return { embeds: [buildEmbed(panel)], components: buildComponents(panel) };
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

function logPanelEvent(guild, action, panel, byUser, extraFields = []) {
  return logService.log(
    guild,
    'roles-reactions',
    logEventEmbed({
      title: `📌 ${t(`reactionRoles.logs.${action}`)}`,
      color: {
        created: COLORS.LOG_CREATE,
        updated: COLORS.LOG_UPDATE,
        deleted: COLORS.LOG_DELETE,
        error: COLORS.ERROR,
      }[action] ?? COLORS.LOG_NEUTRAL,
      user: byUser ?? null,
      fields: [
        { name: t('reactionRoles.logs.panel'), value: `\`${panel.id}\``, inline: true },
        panel.channelId ? { name: t('common.channel'), value: `<#${panel.channelId}>`, inline: true } : null,
        ...extraFields,
      ].filter(Boolean),
    }),
  );
}

// ---------------------------------------------------------------------------
// Publication / mise à jour / suppression
// ---------------------------------------------------------------------------

/**
 * Publie un nouveau panneau dans son salon et persiste le tout.
 * @returns {Promise<{ ok: true, panel } | { ok: false, code: string }>}
 */
async function publishPanel(guild, draft, byUser) {
  const channel = guild.channels.cache.get(draft.channelId);
  if (!channel?.isTextBased()) return { ok: false, code: 'noChannel' };

  const panel = {
    ...draft,
    id: draft.id ?? repository.generateId(),
    guildId: guild.id,
    createdAt: draft.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: draft.history ?? [],
    stats: draft.stats ?? { assigns: 0, removes: 0 },
  };

  const message = await channel.send(buildMessagePayload(panel)).catch(() => null);
  if (!message) return { ok: false, code: 'sendFailed' };
  panel.messageId = message.id;
  panel.history.push({ at: new Date().toISOString(), action: 'created', by: byUser.id });
  repository.savePanel(guild.id, panel);

  await logPanelEvent(guild, 'created', panel, byUser, [
    { name: t('reactionRoles.logs.roles'), value: String(panel.roles.length), inline: true },
    { name: t('reactionRoles.logs.mode'), value: panel.mode, inline: true },
  ]);
  return { ok: true, panel };
}

/**
 * Met à jour un panneau existant et son message Discord.
 * @returns {Promise<{ ok: true, panel } | { ok: false, code: string }>}
 */
async function updatePanel(guild, draft, byUser) {
  const existing = repository.getPanel(guild.id, draft.id);
  if (!existing) return { ok: false, code: 'notFound' };

  const panel = { ...existing, ...draft, guildId: guild.id, updatedAt: new Date().toISOString() };
  panel.history = existing.history ?? [];
  panel.stats = existing.stats ?? { assigns: 0, removes: 0 };

  // Si le salon a changé, on republie ; sinon on édite le message existant.
  const channel = guild.channels.cache.get(panel.channelId);
  if (!channel?.isTextBased()) return { ok: false, code: 'noChannel' };

  if (panel.channelId !== existing.channelId || !existing.messageId) {
    const oldChannel = guild.channels.cache.get(existing.channelId);
    const oldMessage = existing.messageId ? await oldChannel?.messages.fetch(existing.messageId).catch(() => null) : null;
    await oldMessage?.delete().catch(() => null);
    const message = await channel.send(buildMessagePayload(panel)).catch(() => null);
    if (!message) return { ok: false, code: 'sendFailed' };
    panel.messageId = message.id;
  } else {
    const message = await channel.messages.fetch(existing.messageId).catch(() => null);
    if (message) await message.edit(buildMessagePayload(panel)).catch(() => null);
  }

  panel.history.push({ at: new Date().toISOString(), action: 'updated', by: byUser.id });
  repository.savePanel(guild.id, panel);
  await logPanelEvent(guild, 'updated', panel, byUser);
  return { ok: true, panel };
}

/**
 * Supprime un panneau (config, et optionnellement le message Discord).
 * @returns {Promise<{ ok: boolean }>}
 */
async function deletePanel(guild, panelId, byUser, deleteMessage) {
  const panel = repository.getPanel(guild.id, panelId);
  if (!panel) return { ok: false };

  if (deleteMessage && panel.messageId) {
    const channel = guild.channels.cache.get(panel.channelId);
    const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
    await message?.delete().catch(() => null);
  }
  repository.deletePanel(guild.id, panelId);
  await logPanelEvent(guild, 'deleted', panel, byUser);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Application des rôles (interactions live)
// ---------------------------------------------------------------------------

/** Rôles du panneau que le membre possède actuellement. */
function memberPanelRoles(member, panel) {
  return panel.roles.map((entry) => entry.roleId).filter((roleId) => member.roles.cache.has(roleId));
}

function bumpStats(guild, panel, { assigns = 0, removes = 0 }) {
  panel.stats = panel.stats ?? { assigns: 0, removes: 0 };
  panel.stats.assigns += assigns;
  panel.stats.removes += removes;
  repository.savePanel(guild.id, panel);
}

/**
 * Clic sur un bouton de rôle : ajoute ou retire le rôle selon le mode.
 * @returns {Promise<{ code: string, role?: import('discord.js').Role }>}
 */
async function handleToggle(guild, member, panel, roleId) {
  if (!panel.roles.some((entry) => entry.roleId === roleId)) return { code: 'unknownRole' };
  const role = guild.roles.cache.get(roleId);
  const assignable = roleAssignable(guild, role);

  if (member.roles.cache.has(roleId)) {
    if (!assignable.ok) return { code: 'notAssignable', detail: assignable.code };
    await member.roles.remove(role, 'Rôle réaction').catch(() => null);
    bumpStats(guild, panel, { removes: 1 });
    return { code: 'removed', role };
  }

  if (!assignable.ok) {
    await logPanelEvent(guild, 'error', panel, null, [
      { name: t('reactionRoles.logs.detail'), value: t(`reactionRoles.assign.${assignable.code}`, { role: role?.name ?? roleId }) },
    ]);
    return { code: 'notAssignable', detail: assignable.code };
  }

  if (panel.mode === 'unique') {
    const toRemove = memberPanelRoles(member, panel).filter((id) => id !== roleId);
    for (const id of toRemove) await member.roles.remove(id, 'Rôle réaction (mode unique)').catch(() => null);
    await member.roles.add(role, 'Rôle réaction').catch(() => null);
    bumpStats(guild, panel, { assigns: 1, removes: toRemove.length });
    return { code: 'added', role };
  }

  if (panel.mode === 'limited') {
    const current = memberPanelRoles(member, panel).length;
    if (current >= (panel.limit ?? 1)) return { code: 'limitReached', limit: panel.limit ?? 1 };
  }

  await member.roles.add(role, 'Rôle réaction').catch(() => null);
  bumpStats(guild, panel, { assigns: 1 });
  return { code: 'added', role };
}

/**
 * Sélection dans un menu déroulant : aligne les rôles du membre sur la
 * sélection (ajoute les choisis assignables, retire les autres du panneau).
 * @returns {Promise<{ added: string[], removed: string[], skipped: string[] }>}
 */
async function handleSelect(guild, member, panel, selectedRoleIds) {
  const panelRoleIds = panel.roles.map((entry) => entry.roleId);
  const selected = selectedRoleIds.filter((id) => panelRoleIds.includes(id));
  const added = [];
  const removed = [];
  const skipped = [];

  for (const roleId of panelRoleIds) {
    const role = guild.roles.cache.get(roleId);
    const wants = selected.includes(roleId);
    const has = member.roles.cache.has(roleId);
    if (wants === has) continue;

    const assignable = roleAssignable(guild, role);
    if (!assignable.ok) {
      skipped.push(roleId);
      continue;
    }
    if (wants) {
      await member.roles.add(role, 'Rôle réaction (menu)').catch(() => null);
      added.push(roleId);
    } else {
      await member.roles.remove(role, 'Rôle réaction (menu)').catch(() => null);
      removed.push(roleId);
    }
  }
  bumpStats(guild, panel, { assigns: added.length, removes: removed.length });
  return { added, removed, skipped };
}

module.exports = {
  BUTTON_THRESHOLD,
  buildEmbed,
  buildComponents,
  buildMessagePayload,
  publishPanel,
  updatePanel,
  deletePanel,
  handleToggle,
  handleSelect,
  logPanelEvent,
  getPanel: repository.getPanel,
  getGuildPanels: repository.getGuildPanels,
  getPanelByMessage: repository.getPanelByMessage,
  getAllPanels: repository.getAllPanels,
};
