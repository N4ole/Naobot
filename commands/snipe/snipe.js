/**
 * Commandes de snipe (une par catégorie, générées par un factory commun) :
 * snipe, editsnipe, membersnipe, rolesnipe, sanctionsnipe, ticketsnipe,
 * protectionsnipe.
 *
 * Chacune consulte les événements récents de sa catégorie, avec filtres
 * (utilisateur, salon), pagination et navigation par boutons. Chaque résultat
 * est présenté dans un embed (catégorie, date, salon, auteur, contenu). La
 * consultation est journalisée dans la catégorie de logs « watch ».
 *
 * Tous les boutons partagent le préfixe de customId « snipe: » : ils sont donc
 * routés vers le handleComponent de la commande `snipe`, qui lit la catégorie
 * réelle dans le customId. Accès : administrateurs, modérateurs (Modérer les
 * membres) ou owners du bot (middlewares/snipe).
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const snipeService = require('../../services/snipe/snipeService');
const snipeCategories = require('../../utils/constants/snipeCategories');
const { canSnipe } = require('../../middlewares/snipe/snipeAccess');
const { infoEmbed, errorEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

/** Bloc « contenu » d'un événement, selon son type. */
function contentValue(entry) {
  const parts = [];
  if (entry.oldContent) parts.push(`${t('snipe.event.before')} : ${String(entry.oldContent).slice(0, 500)}`);
  if (entry.newContent) parts.push(`${t('snipe.event.after')} : ${String(entry.newContent).slice(0, 500)}`);
  if (entry.extra?.added?.length) parts.push(`${t('snipe.event.rolesAdded')} : ${entry.extra.added.map((id) => `<@&${id}>`).join(' ')}`);
  if (entry.extra?.removed?.length) parts.push(`${t('snipe.event.rolesRemoved')} : ${entry.extra.removed.map((id) => `<@&${id}>`).join(' ')}`);
  if (entry.extra?.count) parts.push(`${t('snipe.event.count')} : ${entry.extra.count}`);
  if (entry.extra?.total) parts.push(`${t('snipe.event.total')} : ${entry.extra.total}`);
  if (entry.attachments?.length) parts.push(`${t('snipe.event.attachments')} : ${entry.attachments.length}`);
  if (entry.images?.length) parts.push(`${t('snipe.event.images')} : ${entry.images.map((url, i) => `[${i + 1}](${url})`).join(' ')}`);
  if (entry.moderatorId) parts.push(`${t('snipe.event.moderator')} : <@${entry.moderatorId}>`);
  return parts.length ? parts.join('\n').slice(0, 1024) : t('snipe.event.noContent');
}

/** Construit l'embed + boutons d'un événement (page donnée). */
function buildPayload(categoryKey, events, page, requesterId, filters) {
  const def = snipeCategories[categoryKey];
  if (events.length === 0) {
    return { embeds: [infoEmbed(`${def.emoji} ${def.label}`, t('snipe.empty'))], components: [] };
  }
  const total = events.length;
  const current = Math.min(Math.max(0, page), total - 1);
  const entry = events[current];

  const embed = infoEmbed(`${def.emoji} ${def.label}`, null)
    .addFields(
      { name: t('snipe.field.type'), value: `\`${entry.type}\``, inline: true },
      { name: t('snipe.field.date'), value: `<t:${Math.floor(Date.parse(entry.createdAt) / 1000)}:f>`, inline: true },
      { name: t('snipe.field.channel'), value: entry.channelId ? `<#${entry.channelId}>` : '—', inline: true },
      { name: t('snipe.field.author'), value: entry.userId ? `<@${entry.userId}>${entry.userTag ? ` (${entry.userTag})` : ''}` : '—', inline: false },
      { name: t('snipe.field.content'), value: contentValue(entry) },
    )
    .setFooter({ text: t('snipe.footer', { page: current + 1, total }) });
  if (entry.images?.length) embed.setImage(entry.images[0]);

  const f = `${filters.userId ?? '0'}:${filters.channelId ?? '0'}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`snipe:nav:${categoryKey}:${current - 1}:${requesterId}:${f}`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
    new ButtonBuilder().setCustomId(`snipe:nav:${categoryKey}:${current + 1}:${requesterId}:${f}`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= total - 1),
  );
  return { embeds: [embed], components: [row] };
}

/** handleComponent partagé (customId « snipe:nav:<cat>:<page>:<uid>:<fUser>:<fChan> »). */
async function handleComponent(interaction) {
  if (!interaction.isButton() || !interaction.inCachedGuild()) return;
  const parts = interaction.customId.split(':');
  const [, kind, categoryKey, rawPage, requesterId, fUser, fChan] = parts;
  if (kind !== 'nav' || !snipeCategories[categoryKey]) return;

  if (!canSnipe(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed(t('snipe.noPermission'))], flags: MessageFlags.Ephemeral });
  }
  if (interaction.user.id !== requesterId) {
    return interaction.reply({ embeds: [errorEmbed(t('snipe.notYourSession'))], flags: MessageFlags.Ephemeral });
  }

  const filters = { userId: fUser !== '0' ? fUser : undefined, channelId: fChan !== '0' ? fChan : undefined };
  const events = snipeService.query(interaction.guild.id, categoryKey, filters);
  return interaction.update(buildPayload(categoryKey, events, Number.parseInt(rawPage, 10) || 0, requesterId, filters));
}

/** Fabrique une commande de snipe pour une catégorie donnée. */
function makeSnipeCommand(categoryKey) {
  const def = snipeCategories[categoryKey];
  return {
    name: def.command,
    description: `Consulte les événements récents : ${def.label.toLowerCase()}`,
    usage: `${def.command} [@utilisateur] [#salon]`,
    examples: [def.command, `${def.command} @Membre`, `${def.command} #salon`],
    aliases: def.aliases ?? [],
    cooldown: 3,
    category: 'snipe',
    args: [
      { name: 'utilisateur', type: 'user', required: false, description: 'Filtrer par utilisateur' },
      { name: 'salon', type: 'channel', required: false, description: 'Filtrer par salon' },
    ],
    async execute(ctx) {
      if (!canSnipe(ctx.member)) {
        return ctx.reply({ embeds: [errorEmbed(t('snipe.noPermission'))], ephemeral: true });
      }
      const filters = {
        userId: ctx.options.utilisateur?.id,
        channelId: ctx.options.salon?.id,
      };
      const events = snipeService.query(ctx.guild.id, categoryKey, filters);
      await snipeService.logConsultation(ctx.guild, categoryKey, ctx.user, filters);
      return ctx.reply(buildPayload(categoryKey, events, 0, ctx.user.id, filters));
    },
    handleComponent,
  };
}

module.exports = Object.keys(snipeCategories).map(makeSnipeCommand);
