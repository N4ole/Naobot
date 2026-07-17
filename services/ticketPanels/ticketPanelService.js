/**
 * Panneaux de tickets : rendu (embed + composants), publication et mise à
 * jour du message. Un panneau présente une ou plusieurs catégories, via des
 * boutons ou un menu déroulant (au choix de l'administrateur).
 *
 * Les composants d'ouverture (`ticket:open:*`, `ticket:openselect:*`) sont
 * routés vers la commande `ticket` par leur préfixe de customId : aucun
 * registre central, tout survit aux redémarrages.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const repository = require('../../database/ticketPanelRepository');
const categoryRepository = require('../../database/ticketCategoryRepository');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const BUTTONS_PER_ROW = 5;
const MAX_BUTTONS = 25;

function getPanel(guildId, panelId) {
  return repository.getPanel(guildId, panelId);
}

function listPanels(guildId) {
  return repository.listPanels(guildId);
}

/** Catégories du panneau encore existantes (les supprimées sont ignorées). */
function resolveCategories(panel) {
  return panel.categoryIds
    .map((categoryId) => categoryRepository.getCategory(panel.guildId, categoryId))
    .filter(Boolean);
}

function buildPanelMessage(panel) {
  const categories = resolveCategories(panel);
  const embed = new EmbedBuilder()
    .setColor(panel.color ?? COLORS.INFO)
    .setTitle(panel.title || t('ticketPanels.defaultTitle'))
    .setDescription(panel.description || null);
  if (categories.length > 0) {
    embed.addFields({
      name: t('ticketPanels.field.categories'),
      value: categories.map((category) => `${category.emoji ?? '🎫'} **${category.name}**${category.description ? ` — ${category.description}` : ''}`).join('\n'),
    });
  }
  if (panel.imageUrl) embed.setImage(panel.imageUrl);
  if (panel.footer) embed.setFooter({ text: panel.footer });

  return { embeds: [embed], components: buildComponents(panel, categories) };
}

function buildComponents(panel, categories = resolveCategories(panel)) {
  if (categories.length === 0) return [];

  // Menu déroulant : choix explicite, ou repli automatique au-delà de 25 boutons.
  if (panel.displayMode === 'select' || categories.length > MAX_BUTTONS) {
    return [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket:openselect:${panel.id}`)
          .setPlaceholder(t('ticketPanels.selectPlaceholder'))
          .addOptions(
            categories.slice(0, 25).map((category) => ({
              label: category.name.slice(0, 100),
              value: category.id,
              description: category.description ? category.description.slice(0, 100) : undefined,
              emoji: category.emoji ?? undefined,
            })),
          ),
      ),
    ];
  }

  const rows = [];
  for (let i = 0; i < categories.length && i < MAX_BUTTONS; i += BUTTONS_PER_ROW) {
    const slice = categories.slice(i, i + BUTTONS_PER_ROW);
    rows.push(
      new ActionRowBuilder().addComponents(
        slice.map((category) =>
          new ButtonBuilder()
            .setCustomId(`ticket:open:${category.id}`)
            .setLabel(category.name.slice(0, 80))
            .setEmoji(category.emoji ?? '🎫')
            .setStyle(ButtonStyle.Primary),
        ),
      ),
    );
  }
  return rows;
}

/** Publie le panneau (ou remplace son message précédent) dans son salon. */
async function publishPanel(guild, panel) {
  const channel = guild.channels.cache.get(panel.channelId);
  if (!channel?.isTextBased()) return { ok: false, code: 'noChannel' };

  // Supprime l'ancien message pour éviter les doublons.
  if (panel.messageId) {
    const previous = await channel.messages.fetch(panel.messageId).catch(() => null);
    await previous?.delete().catch(() => null);
  }
  const message = await channel.send(buildPanelMessage(panel)).catch(() => null);
  if (!message) return { ok: false, code: 'sendFailed' };
  panel.messageId = message.id;
  repository.savePanel(panel);
  return { ok: true, panel, message };
}

/** Réédite le message d'un panneau (best effort, ex. après édition). */
async function refreshPanel(guild, panel) {
  if (!panel.messageId) return;
  const channel = guild.channels.cache.get(panel.channelId);
  const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
  await message?.edit(buildPanelMessage(panel)).catch(() => null);
}

/** Supprime le message d'un panneau puis sa configuration. */
async function deletePanel(guild, panel) {
  if (panel.messageId) {
    const channel = guild.channels.cache.get(panel.channelId);
    const message = await channel?.messages.fetch(panel.messageId).catch(() => null);
    await message?.delete().catch(() => null);
  }
  return repository.deletePanel(panel.guildId, panel.id);
}

module.exports = {
  getPanel,
  listPanels,
  resolveCategories,
  buildPanelMessage,
  buildComponents,
  publishPanel,
  refreshPanel,
  deletePanel,
  defaults: repository.defaults,
  generateId: repository.generateId,
  savePanel: repository.savePanel,
  panelsUsingCategory: repository.panelsUsingCategory,
};
