/**
 * Commande protections : tableau de bord de l'état des protections du
 * serveur (anti-spam, anti-link, anti-bot), avec indicateurs visuels,
 * dernière modification et bouton d'actualisation. La logique vit dans
 * services/protections/protectionService.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const protectionService = require('../../services/protections/protectionService');
const protectionTypes = require('../../utils/constants/protectionTypes');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

function indicator(enabled) {
  return enabled ? '🟢' : '🔴';
}

function buildPayload(guild) {
  const config = protectionService.getConfig(guild.id);
  const lines = Object.values(protectionTypes).map((def) => {
    const enabled = config.enabled[def.key] === true;
    const stat = config.stats[def.statKey] ?? 0;
    return t('protections.command.line', {
      indicator: indicator(enabled),
      emoji: def.emoji,
      label: def.label,
      state: protectionService.stateLabel(enabled),
      stat,
    });
  });

  const embed = infoEmbed(t('protections.command.title', { guild: guild.name }), lines.join('\n')).addFields(
    {
      name: t('protections.command.lastModified'),
      value: config.lastModifiedAt ? `<t:${Math.floor(Date.parse(config.lastModifiedAt) / 1000)}:f>` : t('protections.command.never'),
      inline: true,
    },
    {
      name: t('protections.command.lastModifiedBy'),
      value: config.lastModifiedBy ? `<@${config.lastModifiedBy}>` : t('help.none'),
      inline: true,
    },
    { name: t('protections.command.raidsBlocked'), value: String(config.stats.raidsBlocked ?? 0), inline: true },
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('protections:refresh').setLabel(t('protections.command.refresh')).setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

module.exports = {
  name: 'protections',
  description: "Affiche l'état des protections automatiques du serveur",
  usage: 'protections',
  examples: ['protections'],
  aliases: ['protection'],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    return ctx.reply(buildPayload(ctx.guild));
  },

  /** Bouton d'actualisation (customId "protections:refresh"). */
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [errorEmbed(t('protections.command.noPermission'))], flags: MessageFlags.Ephemeral });
    }
    return interaction.update(buildPayload(interaction.guild));
  },
};
