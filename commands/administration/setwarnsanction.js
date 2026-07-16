/**
 * Commande setwarnsanction : configuration interactive de l'échelle des
 * sanctions progressives (par serveur).
 *
 * - Panneau : embed de l'échelle courante + menu de sélection d'un palier.
 * - Édition d'un palier : menu du type de sanction (dont « désactiver »),
 *   avec saisie de durée par modal pour les timeouts.
 * - `setwarnsanction reset` : restaure l'échelle par défaut.
 *
 * Le palier 1 est verrouillé sur « Avertissement » (règle obligatoire).
 * La logique de résolution/application vit dans services/warnings/sanctionService ;
 * les changements sont journalisés via warnService.logRulesChange.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const sanctionService = require('../../services/warnings/sanctionService');
const warnService = require('../../services/warnings/warnService');
const permissionsConfig = require('../../config/permissions');
const { SANCTION_TYPES } = require('../../utils/constants/warnSanctions');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { parseDuration, formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

/** Description lisible d'un palier (« ⏳ Exclusion temporaire (1 h) »). */
function tierLabel(sanction) {
  if (!sanction || sanction.enabled === false) return t('warns.config.disabled');
  return sanctionService.describeSanction(sanction);
}

function ladderLines(guildId) {
  const ladder = sanctionService.getLadder(guildId);
  return sanctionService
    .sortedLevels(ladder)
    .map((level) => t('warns.config.line', { level, sanction: tierLabel(ladder[level]) }))
    .join('\n');
}

/** Panneau principal : échelle + menu de sélection de palier. */
function buildPanel(guildId) {
  const ladder = sanctionService.getLadder(guildId);
  const levels = sanctionService.sortedLevels(ladder);
  const select = new StringSelectMenuBuilder()
    .setCustomId('setwarnsanction:tier')
    .setPlaceholder(t('warns.config.selectTier'))
    .addOptions(
      levels.map((level) => ({
        label: t('warns.config.tierOption', { level }),
        description: tierLabel(ladder[level]).slice(0, 100),
        value: String(level),
      })),
    );
  return {
    embeds: [infoEmbed(t('warns.config.title'), `${t('warns.config.description')}\n\n${ladderLines(guildId)}`)],
    components: [new ActionRowBuilder().addComponents(select)],
  };
}

/** Éditeur d'un palier : menu du type de sanction. */
function buildTierEditor(guildId, level) {
  const isFirst = level === 1;
  const options = Object.values(SANCTION_TYPES).map((type) => ({
    label: type.label,
    emoji: type.emoji,
    value: type.key,
    // Le palier 1 est verrouillé sur « Avertissement ».
    default: isFirst && type.key === 'warn',
  }));
  if (!isFirst) {
    options.push({ label: t('warns.config.disable'), emoji: '🚫', value: 'disabled' });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`setwarnsanction:type:${level}`)
    .setPlaceholder(t('warns.config.selectType'))
    .setDisabled(isFirst)
    .addOptions(options);

  const description = isFirst
    ? t('warns.config.tierLockedDescription', { level })
    : t('warns.config.tierEditDescription', { level });
  return {
    embeds: [infoEmbed(t('warns.config.tierTitle', { level }), description)],
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('setwarnsanction:back')
          .setLabel(t('warns.config.back'))
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function durationModal(level) {
  return new ModalBuilder()
    .setCustomId(`setwarnsanction:duration:${level}`)
    .setTitle(t('warns.config.durationTitle'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('duration')
          .setLabel(t('warns.config.durationLabel'))
          .setPlaceholder('1h, 30m, 1d…')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
}

module.exports = {
  name: 'setwarnsanction',
  description: "Configure l'échelle des sanctions progressives des warns",
  usage: 'setwarnsanction [reset]',
  examples: ['setwarnsanction', 'setwarnsanction reset'],
  aliases: [],
  cooldown: 5,
  args: [
    {
      name: 'action',
      type: 'string',
      required: false,
      choices: ['reset'],
      description: 'reset : restaure l’échelle par défaut',
    },
  ],
  async execute(ctx) {
    if (ctx.options.action?.toLowerCase() === 'reset') {
      sanctionService.resetLadder(ctx.guild.id);
      await warnService.logRulesChange(ctx.guild, ctx.user, t('warns.config.resetDone'));
      return ctx.reply({
        embeds: [successEmbed(t('warns.config.resetDone')), buildPanel(ctx.guild.id).embeds[0]],
      });
    }
    return ctx.reply(buildPanel(ctx.guild.id));
  },

  /** Composants (customId "setwarnsanction:*") — permission Gérer le serveur. */
  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return;

    const requiredPerms = permissionsConfig.setwarnsanction?.user ?? [];
    if (!interaction.member.permissions.has(requiredPerms)) {
      return interaction.reply({ embeds: [errorEmbed(t('warns.config.noPermission'))], flags: MessageFlags.Ephemeral });
    }

    const [, action, rawLevel] = interaction.customId.split(':');
    const level = Number.parseInt(rawLevel, 10);

    // Retour au panneau.
    if (action === 'back' || (action === 'tier' && interaction.isButton())) {
      return interaction.update(buildPanel(interaction.guild.id));
    }

    // Sélection d'un palier à éditer.
    if (action === 'tier') {
      const selected = Number.parseInt(interaction.values[0], 10);
      return interaction.update(buildTierEditor(interaction.guild.id, selected));
    }

    // Choix du type de sanction pour un palier.
    if (action === 'type') {
      if (level === 1) return interaction.deferUpdate(); // verrouillé
      const type = interaction.values[0];

      if (type === 'timeout') {
        // Une durée est requise : on la demande via un modal.
        return interaction.showModal(durationModal(level));
      }

      const sanction = type === 'disabled' ? { type: 'warn', enabled: false } : { type, enabled: true };
      sanctionService.setTier(interaction.guild.id, level, sanction);
      await warnService.logRulesChange(
        interaction.guild,
        interaction.user,
        t('warns.config.changeDetail', { level, sanction: tierLabel(sanction) }),
      );
      await interaction.update(buildPanel(interaction.guild.id));
      return undefined;
    }

    // Saisie de la durée d'un timeout (modal).
    if (action === 'duration') {
      const ms = parseDuration(interaction.fields.getTextInputValue('duration'));
      if (ms === null) {
        return interaction.reply({ embeds: [errorEmbed(t('errors.invalidDuration'))], flags: MessageFlags.Ephemeral });
      }
      const sanction = { type: 'timeout', durationMs: ms, enabled: true };
      sanctionService.setTier(interaction.guild.id, level, sanction);
      await warnService.logRulesChange(
        interaction.guild,
        interaction.user,
        t('warns.config.changeDetail', { level, sanction: `⏳ ${formatDuration(ms)}` }),
      );
      return interaction.update(buildPanel(interaction.guild.id));
    }

    return undefined;
  },
};
