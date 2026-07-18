/**
 * Commande logs : administration du système de logs (SEPT catégories fixes).
 *
 * - `logs` (sans argument) : panneau interactif (menu de catégories + boutons
 *   « Tout activer » / « Tout désactiver »).
 * - `logs status` : état détaillé (catégorie, état, salon, date et auteur de
 *   la dernière modification), avec boutons.
 * - `logs setup` : crée la catégorie « Logs » et les salons des sept
 *   catégories (réutilise l'existant), et active tout.
 * - `logs enable <catégories|tout>` / `logs disable <catégories|tout>`.
 *
 * La logique métier (persistance, création/réutilisation des salons, migration)
 * vit dans services/logs. Accès : Gérer le serveur.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder } = require('discord.js');
const config = require('../../config/config');
const logService = require('../../services/logs/logService');
const logCategories = require('../../utils/constants/logCategories');
const { canManageLogs } = require('../../middlewares/logs/logAccess');
const { parseCategoryInput } = require('../../utils/helpers/logCategoryParser');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const ACTIONS = {
  enable: 'enable', activer: 'enable', on: 'enable',
  disable: 'disable', desactiver: 'disable', off: 'disable',
  status: 'status', statut: 'status', liste: 'status', list: 'status',
  setup: 'setup', config: 'setup', configurer: 'setup',
};

function normalizeAction(input) {
  return ACTIONS[input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] ?? null;
}

function validCategoryList() {
  return Object.keys(logCategories).map((key) => `\`${key}\``).join(', ');
}

/** Lignes d'état détaillées : état, salon, dernière modification (date + auteur). */
function statusLines(guild) {
  const status = logService.getStatus(guild.id);
  return Object.entries(logCategories)
    .map(([key, def]) => {
      const s = status[key];
      const state = s.enabled ? `✅ ${s.channelId ? `<#${s.channelId}>` : t('logs.command.enabled')}` : `❌ ${t('logs.command.disabled')}`;
      const modified = s.updatedAt
        ? t('logs.command.modified', { date: Math.floor(Date.parse(s.updatedAt) / 1000), user: s.updatedBy ? `<@${s.updatedBy}>` : '—' })
        : t('logs.command.never');
      return `${def.emoji} **${def.label}** (\`${key}\`) — ${state}\n> ${modified}`;
    })
    .join('\n');
}

function buildStatusEmbed(guild) {
  return infoEmbed(t('logs.command.statusTitle'), statusLines(guild));
}

/** Panneau interactif : menu de sélection + boutons tout activer/désactiver. */
function buildPanel(guild) {
  const status = logService.getStatus(guild.id);
  const select = new StringSelectMenuBuilder()
    .setCustomId('logs:set')
    .setPlaceholder(t('logs.command.selectPlaceholder'))
    .setMinValues(0)
    .setMaxValues(Object.keys(logCategories).length)
    .addOptions(Object.entries(logCategories).map(([key, def]) => ({ label: def.label, value: key, description: def.description.slice(0, 100), emoji: def.emoji, default: status[key].enabled })));
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('logs:enable-all').setLabel(t('logs.command.enableAll')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('logs:disable-all').setLabel(t('logs.command.disableAll')).setStyle(ButtonStyle.Danger),
  );
  return {
    embeds: [infoEmbed(t('logs.command.panelTitle'), `${t('logs.command.panelDescription')}\n\n${statusLines(guild)}`)],
    components: [new ActionRowBuilder().addComponents(select), buttons],
  };
}

const logs = {
  name: 'logs',
  description: 'Configure le système de logs (7 catégories) : panneau, setup, status, enable, disable',
  usage: 'logs [enable|disable|setup|status] [catégories…|tout]',
  examples: ['logs', 'logs setup', 'logs status', 'logs enable tout', 'logs enable sanctions moderation', 'logs disable protections'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'action', type: 'string', required: false, choices: ['enable', 'disable', 'setup', 'status'], description: 'Action (sans action : panneau interactif)' },
    { name: 'categories', type: 'string', required: false, rest: true, description: 'Catégories visées (séparées par des espaces), ou « tout »' },
  ],

  async execute(ctx) {
    const rawAction = ctx.options.action;
    if (!rawAction) return ctx.reply(buildPanel(ctx.guild));

    const action = normalizeAction(rawAction);
    if (!action) {
      return ctx.reply({ embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}${logs.usage}` }))], ephemeral: true });
    }

    if (action === 'status') return ctx.reply({ embeds: [buildStatusEmbed(ctx.guild)] });

    if (action === 'setup') {
      await ctx.defer();
      await logService.enableCategories(ctx.guild, Object.keys(logCategories), ctx.user.id);
      return ctx.reply({ embeds: [successEmbed(t('logs.command.setupSuccess')), buildStatusEmbed(ctx.guild)] });
    }

    const parsed = parseCategoryInput(ctx.options.categories ?? '');
    if (parsed.error === 'missing') {
      return ctx.reply({ embeds: [errorEmbed(t('logs.command.missingCategories', { categories: validCategoryList() }))], ephemeral: true });
    }
    if (parsed.error) {
      return ctx.reply({ embeds: [errorEmbed(t('logs.command.unknownCategory', { category: parsed.token, categories: validCategoryList() }))], ephemeral: true });
    }

    await ctx.defer();
    const labels = parsed.keys.map((key) => logCategories[key].label).join(', ');
    if (action === 'enable') {
      await logService.enableCategories(ctx.guild, parsed.keys, ctx.user.id);
      return ctx.reply({ embeds: [successEmbed(t('logs.command.enableSuccess', { categories: labels })), buildStatusEmbed(ctx.guild)] });
    }
    await logService.disableCategories(ctx.guild, parsed.keys, ctx.user.id);
    return ctx.reply({ embeds: [successEmbed(t('logs.command.disableSuccess', { categories: labels })), buildStatusEmbed(ctx.guild)] });
  },

  /** Composants du panneau (customId « logs:* »). */
  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return;
    if (!canManageLogs(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed(t('logs.command.noPermission'))], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferUpdate();
    const allKeys = Object.keys(logCategories);
    const by = interaction.user.id;

    if (interaction.customId === 'logs:set') {
      const selected = interaction.values;
      if (selected.length > 0) await logService.enableCategories(interaction.guild, selected, by);
      await logService.disableCategories(interaction.guild, allKeys.filter((key) => !selected.includes(key)), by);
    } else if (interaction.customId === 'logs:enable-all') {
      await logService.enableCategories(interaction.guild, allKeys, by);
    } else if (interaction.customId === 'logs:disable-all') {
      await logService.disableCategories(interaction.guild, allKeys, by);
    }

    await interaction.editReply(buildPanel(interaction.guild));
  },
};

module.exports = logs;
