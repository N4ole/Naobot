/**
 * Commandes owner contactlist / contactinfo (même famille, même fichier) :
 * consultation des conversations de contact, avec pagination (list) et menu
 * de changement de statut (info). Réservées aux owners du bot (ownerOnly).
 * La logique métier vit dans services/contact.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder } = require('discord.js');
const contactService = require('../../services/contact/contactService');
const { checkOwner } = require('../../middlewares/permissions/ownerCheck');
const contactStatuses = require('../../utils/constants/contactStatuses');
const { infoEmbed, errorEmbed, successEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const PAGE_SIZE = 5;

// ---------------------------------------------------------------------------
// contactlist (paginée)
// ---------------------------------------------------------------------------

function buildListPayload(userId, page) {
  const all = contactService.getAllConversations();
  if (all.length === 0) {
    return { embeds: [infoEmbed(t('contact.list.title'), t('contact.list.empty'))], components: [] };
  }
  const pageCount = Math.ceil(all.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  const slice = all.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const lines = slice.map((conversation) => {
    const last = conversation.messages[conversation.messages.length - 1];
    return t('contact.list.entry', {
      id: conversation.id,
      status: contactService.statusLabel(conversation.status),
      server: conversation.guildName,
      last: (last?.content ?? '').slice(0, 80),
      date: Math.floor(Date.parse(conversation.lastActivityAt) / 1000),
    });
  });
  const embed = infoEmbed(t('contact.list.title'), lines.join('\n\n')).setFooter({ text: `Page ${current + 1}/${pageCount}` });
  const components =
    pageCount > 1
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`contactlist:prev:${userId}:${current}`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
            new ButtonBuilder().setCustomId(`contactlist:next:${userId}:${current}`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pageCount - 1),
          ),
        ]
      : [];
  return { embeds: [embed], components };
}

const contactlist = {
  name: 'contactlist',
  ownerOnly: true,
  description: 'Liste les conversations de contact (réservé aux owners du bot)',
  usage: 'contactlist',
  examples: ['contactlist'],
  aliases: [],
  cooldown: 5,
  args: [],
  async execute(ctx) {
    return ctx.reply(buildListPayload(ctx.user.id, 0));
  },
  async handleComponent(interaction) {
    if (!interaction.isButton()) return;
    const [, direction, requesterId, rawPage] = interaction.customId.split(':');
    const owner = checkOwner(interaction.user.id);
    if (!owner.ok || interaction.user.id !== requesterId) {
      return interaction.reply({ embeds: [errorEmbed(owner.error)], flags: MessageFlags.Ephemeral });
    }
    const current = Number.parseInt(rawPage, 10) || 0;
    return interaction.update(buildListPayload(requesterId, direction === 'prev' ? current - 1 : current + 1));
  },
};

// ---------------------------------------------------------------------------
// contactinfo (détail + changement de statut)
// ---------------------------------------------------------------------------

function buildInfoPayload(conversation) {
  const responders = conversation.respondedBy.length
    ? conversation.respondedBy.map((id) => `<@${id}>`).join(', ')
    : t('help.none');
  const embed = infoEmbed(t('contact.info.title', { id: conversation.id }), null).addFields(
    { name: t('contact.field.server'), value: `${conversation.guildName} (\`${conversation.guildId}\`)`, inline: true },
    { name: t('contact.field.owner'), value: `${conversation.ownerName} (\`${conversation.ownerId}\`)`, inline: true },
    { name: t('contact.field.status'), value: contactService.statusLabel(conversation.status), inline: true },
    { name: t('contact.field.messages'), value: String(conversation.messages.length), inline: true },
    { name: t('contact.field.respondedBy'), value: responders, inline: true },
    { name: t('contact.field.created'), value: `<t:${Math.floor(Date.parse(conversation.createdAt) / 1000)}:f>`, inline: true },
    { name: t('contact.field.lastActivity'), value: `<t:${Math.floor(Date.parse(conversation.lastActivityAt) / 1000)}:R>`, inline: true },
  );

  const statusMenu = new StringSelectMenuBuilder()
    .setCustomId(`contactinfo:status:${conversation.id}`)
    .setPlaceholder(t('contact.info.changeStatus'))
    .addOptions(
      Object.values(contactStatuses).map((status) => ({
        label: status.label,
        value: status.key,
        emoji: status.emoji,
        default: conversation.status === status.key,
      })),
    );
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(statusMenu)] };
}

const contactinfo = {
  name: 'contactinfo',
  ownerOnly: true,
  description: "Détaille une conversation de contact et permet d'en changer le statut (owners)",
  usage: 'contactinfo <identifiant>',
  examples: ['contactinfo CONTACT-000001'],
  aliases: [],
  cooldown: 3,
  args: [
    { name: 'identifiant', type: 'string', required: true, description: 'Identifiant de la conversation' },
  ],
  async execute(ctx) {
    const conversation = contactService.getConversation(ctx.options.identifiant.toUpperCase());
    if (!conversation) {
      return ctx.reply({ embeds: [errorEmbed(t('contact.errors.notFound', { id: ctx.options.identifiant }))], ephemeral: true });
    }
    return ctx.reply({ ...buildInfoPayload(conversation), ephemeral: true });
  },

  /** Menu de changement de statut (customId "contactinfo:status:<id>"). */
  async handleComponent(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    const owner = checkOwner(interaction.user.id);
    if (!owner.ok) {
      return interaction.reply({ embeds: [errorEmbed(owner.error)], flags: MessageFlags.Ephemeral });
    }
    const conversationId = interaction.customId.split(':')[2];
    const result = await contactService.setStatus(interaction.client, conversationId, interaction.values[0], interaction.user);
    if (!result.ok) {
      return interaction.reply({ embeds: [errorEmbed(t(`contact.errors.${result.code}`))], flags: MessageFlags.Ephemeral });
    }
    return interaction.update(buildInfoPayload(result.conversation));
  },
};

module.exports = [contactlist, contactinfo];
