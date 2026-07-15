/**
 * Commande logs : administration du système de logs par catégories.
 *
 * - `logs` sans argument : panneau interactif (menu multi-sélection de
 *   catégories + boutons « Tout activer » / « Tout désactiver »).
 * - `logs statut` : état des catégories.
 * - `logs activer <catégories…|tout>` / `logs desactiver <catégories…|tout>` :
 *   administration textuelle (une, plusieurs, ou toutes les catégories).
 *
 * La logique métier (persistance, création/réutilisation des salons) vit
 * dans services/logging/logService.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
} = require('discord.js');
const config = require('../../config/config');
const permissionsConfig = require('../../config/permissions');
const logService = require('../../services/logging/logService');
const logCategories = require('../../utils/constants/logCategories');
const { parseCategoryInput } = require('../../utils/helpers/logCategoryParser');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const ACTIONS = {
  activer: 'enable',
  enable: 'enable',
  on: 'enable',
  desactiver: 'disable',
  disable: 'disable',
  off: 'disable',
  statut: 'status',
  status: 'status',
  liste: 'status',
  list: 'status',
};

function normalizeAction(input) {
  const normalized = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ACTIONS[normalized] ?? null;
}

function validCategoryList() {
  return Object.keys(logCategories).map((key) => `\`${key}\``).join(', ');
}

function statusLines(guild) {
  const status = logService.getStatus(guild.id);
  return Object.entries(logCategories)
    .map(([key, def]) => {
      const state = status[key].enabled
        ? `✅ ${status[key].channelId ? `<#${status[key].channelId}>` : t('logs.command.enabled')}`
        : `❌ ${t('logs.command.disabled')}`;
      return `${def.emoji} **${def.label}** (\`${key}\`) — ${state}`;
    })
    .join('\n');
}

function buildStatusEmbed(guild) {
  return infoEmbed(t('logs.command.statusTitle'), statusLines(guild));
}

/** Panneau interactif complet : embed d'état + menu + boutons. */
function buildPanel(guild) {
  const status = logService.getStatus(guild.id);
  const select = new StringSelectMenuBuilder()
    .setCustomId('logs:set')
    .setPlaceholder(t('logs.command.selectPlaceholder'))
    .setMinValues(0)
    .setMaxValues(Object.keys(logCategories).length)
    .addOptions(
      Object.entries(logCategories).map(([key, def]) => ({
        label: def.label,
        value: key,
        description: def.description.slice(0, 100),
        emoji: def.emoji,
        default: status[key].enabled,
      })),
    );
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('logs:enable-all')
      .setLabel(t('logs.command.enableAll'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('logs:disable-all')
      .setLabel(t('logs.command.disableAll'))
      .setStyle(ButtonStyle.Danger),
  );

  return {
    embeds: [
      infoEmbed(
        t('logs.command.panelTitle'),
        `${t('logs.command.panelDescription')}\n\n${statusLines(guild)}`,
      ),
    ],
    components: [new ActionRowBuilder().addComponents(select), buttons],
  };
}

const logs = {
  name: 'logs',
  description: 'Configure le système de logs (panneau interactif ou actions directes)',
  usage: 'logs [activer|desactiver|statut] [catégories…|tout]',
  examples: [
    'logs',
    'logs statut',
    'logs activer tout',
    'logs activer sanctions moderation',
    'logs desactiver messages-supprimes',
  ],
  aliases: [],
  cooldown: 3,
  args: [
    {
      name: 'action',
      type: 'string',
      required: false,
      choices: ['activer', 'desactiver', 'statut'],
      description: 'Action à effectuer (sans action : panneau interactif)',
    },
    {
      name: 'categories',
      type: 'string',
      required: false,
      rest: true,
      description: "Catégories visées (séparées par des espaces), ou « tout »",
    },
  ],

  async execute(ctx) {
    const rawAction = ctx.options.action;
    if (!rawAction) {
      return ctx.reply(buildPanel(ctx.guild));
    }

    const action = normalizeAction(rawAction);
    if (!action) {
      return ctx.reply({
        embeds: [errorEmbed(t('errors.invalidArgs', { usage: `${config.prefix}${logs.usage}` }))],
        ephemeral: true,
      });
    }

    if (action === 'status') {
      return ctx.reply({ embeds: [buildStatusEmbed(ctx.guild)] });
    }

    const parsed = parseCategoryInput(ctx.options.categories ?? '');
    if (parsed.error === 'missing') {
      return ctx.reply({
        embeds: [errorEmbed(t('logs.command.missingCategories', { categories: validCategoryList() }))],
        ephemeral: true,
      });
    }
    if (parsed.error) {
      return ctx.reply({
        embeds: [
          errorEmbed(
            t('logs.command.unknownCategory', { category: parsed.token, categories: validCategoryList() }),
          ),
        ],
        ephemeral: true,
      });
    }

    // La création des salons peut dépasser les 3 s accordées aux interactions.
    await ctx.defer();
    const labels = parsed.keys.map((key) => logCategories[key].label).join(', ');
    if (action === 'enable') {
      await logService.enableCategories(ctx.guild, parsed.keys);
      return ctx.reply({
        embeds: [successEmbed(t('logs.command.enableSuccess', { categories: labels })), buildStatusEmbed(ctx.guild)],
      });
    }
    await logService.disableCategories(ctx.guild, parsed.keys);
    return ctx.reply({
      embeds: [successEmbed(t('logs.command.disableSuccess', { categories: labels })), buildStatusEmbed(ctx.guild)],
    });
  },

  /**
   * Interactions du panneau (customId "logs:*"), routées par
   * events/interaction/interactionCreate. Le menu définit l'ensemble exact
   * des catégories activées ; les boutons activent / désactivent tout.
   */
  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return;

    const requiredPerms = permissionsConfig[logs.name]?.user ?? [];
    if (!interaction.member.permissions.has(requiredPerms)) {
      return interaction.reply({
        embeds: [errorEmbed(t('logs.command.noPermission'))],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();
    const allKeys = Object.keys(logCategories);

    if (interaction.customId === 'logs:set') {
      const selected = interaction.values;
      if (selected.length > 0) await logService.enableCategories(interaction.guild, selected);
      await logService.disableCategories(
        interaction.guild,
        allKeys.filter((key) => !selected.includes(key)),
      );
    } else if (interaction.customId === 'logs:enable-all') {
      await logService.enableCategories(interaction.guild, allKeys);
    } else if (interaction.customId === 'logs:disable-all') {
      await logService.disableCategories(interaction.guild, allKeys);
    }

    await interaction.editReply(buildPanel(interaction.guild));
  },
};

module.exports = logs;
