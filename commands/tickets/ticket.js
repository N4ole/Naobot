/**
 * Commande ticket : affiche les informations du ticket courant.
 *
 * Ce fichier porte TOUS les composants « live » du système (customId
 * « ticket:* ») :
 *  - ouverture depuis un panneau (tout membre) : `open`, `openselect`,
 *    `openform` (formulaire modal si la catégorie l'exige) ;
 *  - gestion (créateur / assigné / équipe) : close, reopen, delete
 *    (confirmation), rename (modal), claim/unclaim, add/remove d'utilisateur.
 *
 * La logique métier vit dans services/tickets ; l'accès dans
 * middlewares/tickets/ticketAccess.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require('discord.js');
const ticketRepository = require('../../database/ticketRepository');
const ticketService = require('../../services/tickets/ticketService');
const categoryService = require('../../services/ticketCategories/ticketCategoryService');
const { checkTicketContext } = require('../../middlewares/tickets/ticketAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

function ephemeral(embed) {
  return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

/** Erreurs { code } du service → message localisé. */
function serviceError(code, vars = {}) {
  const keys = {
    notTicket: 'tickets.errors.notTicketChannel',
    alreadyClosed: 'tickets.errors.alreadyClosed',
    notClosed: 'tickets.errors.notClosed',
    invalidName: 'tickets.errors.invalidName',
    alreadyParticipant: 'tickets.errors.alreadyParticipant',
    notParticipant: 'tickets.errors.notParticipant',
    actionFailed: 'tickets.errors.actionFailed',
    createFailed: 'tickets.errors.createFailed',
    alreadyClaimed: 'tickets.errors.alreadyClaimed',
    alreadyClaimedSelf: 'tickets.errors.alreadyClaimedSelf',
    notClaimed: 'tickets.errors.notClaimed',
    sameCategory: 'tickets.errors.sameCategory',
  };
  return t(keys[code] ?? 'tickets.errors.actionFailed', vars);
}

// ---------------------------------------------------------------------------
// Ouverture d'un ticket depuis un panneau
// ---------------------------------------------------------------------------

function subjectModal(categoryId) {
  return new ModalBuilder()
    .setCustomId(`ticket:openform:${categoryId}`)
    .setTitle(t('tickets.open.formTitle'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('subject').setLabel(t('tickets.open.formLabel')).setStyle(TextInputStyle.Paragraph).setMinLength(1).setMaxLength(1000).setRequired(true),
      ),
    );
}

async function createAndReply(interaction, category, subject) {
  const result = await ticketService.createTicket(interaction.guild, interaction.member, category, { subject });
  if (!result.ok) {
    const vars =
      result.code === 'limitReached'
        ? { max: result.max, channel: `<#${result.channelId}>` }
        : result.code === 'cooldown'
          ? { at: `<t:${Math.floor(result.retryAt / 1000)}:R>` }
          : {};
    const key =
      result.code === 'limitReached'
        ? 'tickets.errors.limitReached'
        : result.code === 'cooldown'
          ? 'tickets.errors.cooldown'
          : null;
    return interaction.editReply({ embeds: [errorEmbed(key ? t(key, vars) : serviceError(result.code))] });
  }
  return interaction.editReply({ embeds: [successEmbed(t('tickets.actions.created', { channel: `${result.channel}` }))] });
}

async function handleOpen(interaction, categoryId) {
  const category = categoryService.getCategory(interaction.guild.id, categoryId);
  if (!category) return interaction.reply(ephemeral(errorEmbed(t('tickets.errors.categoryGone'))));
  if (category.openMode === 'form') {
    return interaction.showModal(subjectModal(category.id));
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return createAndReply(interaction, category, null);
}

// ---------------------------------------------------------------------------
// Composants de gestion
// ---------------------------------------------------------------------------

function deleteConfirmationPayload() {
  return {
    embeds: [infoEmbed(t('tickets.buttons.delete'), t('tickets.actions.deleteConfirm'))],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:confirmdelete').setLabel(t('tickets.actions.deleteConfirmButton')).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket:canceldelete').setLabel(t('tickets.actions.deleteCancelButton')).setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

function renameModal() {
  return new ModalBuilder()
    .setCustomId('ticket:renamemodal')
    .setTitle(t('tickets.actions.renameModalTitle'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel(t('tickets.actions.renameModalLabel')).setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(100).setRequired(true),
      ),
    );
}

function userSelectPayload(action) {
  return {
    components: [
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`ticket:${action}select`)
          .setPlaceholder(t(action === 'adduser' ? 'tickets.actions.selectUserAdd' : 'tickets.actions.selectUserRemove'))
          .setMinValues(1)
          .setMaxValues(1),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

module.exports = {
  name: 'ticket',
  description: 'Affiche les informations du ticket courant',
  usage: 'ticket',
  examples: ['ticket'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    const ticket = ticketRepository.getTicket(ctx.guild.id, ctx.channel.id);
    if (!ticket) {
      return ctx.reply({ embeds: [errorEmbed(t('tickets.errors.notTicketChannel'))], ephemeral: true });
    }
    const category = categoryService.getCategory(ctx.guild.id, ticket.categoryId);
    return ctx.reply({ embeds: [ticketService.buildInfoEmbed(ticket, category)] });
  },

  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return undefined;
    const [, action, extra] = interaction.customId.split(':');

    // Ouverture : accessible à tous les membres.
    if (action === 'open') return handleOpen(interaction, extra);
    if (action === 'openselect') {
      const categoryId = interaction.values[0];
      return handleOpen(interaction, categoryId);
    }
    if (action === 'openform') {
      const category = categoryService.getCategory(interaction.guild.id, extra);
      if (!category) return interaction.reply(ephemeral(errorEmbed(t('tickets.errors.categoryGone'))));
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return createAndReply(interaction, category, interaction.fields.getTextInputValue('subject').trim());
    }

    // Gestion : salon = ticket + créateur / assigné / équipe.
    const context = checkTicketContext(interaction.guild.id, interaction.channel.id, interaction.member);
    if (!context.ok) return interaction.reply(ephemeral(errorEmbed(context.error)));

    switch (action) {
      case 'close': {
        const result = await ticketService.closeTicket(interaction.guild, interaction.channel, interaction.user);
        if (!result.ok) return interaction.reply(ephemeral(errorEmbed(serviceError(result.code))));
        return interaction.reply({ embeds: [successEmbed(t('tickets.actions.closed', { user: `${interaction.user}` }))] });
      }
      case 'reopen': {
        const result = await ticketService.reopenTicket(interaction.guild, interaction.channel, interaction.user);
        if (!result.ok) return interaction.reply(ephemeral(errorEmbed(serviceError(result.code))));
        return interaction.reply({ embeds: [successEmbed(t('tickets.actions.reopened', { user: `${interaction.user}` }))] });
      }
      case 'claim': {
        const result = await ticketService.claimTicket(interaction.guild, interaction.channel, interaction.user);
        if (!result.ok) return interaction.reply(ephemeral(errorEmbed(serviceError(result.code, { by: result.by ? `<@${result.by}>` : '' }))));
        return interaction.reply({ embeds: [successEmbed(t('tickets.actions.claimed', { user: `${interaction.user}` }))] });
      }
      case 'unclaim': {
        const result = await ticketService.unclaimTicket(interaction.guild, interaction.channel, interaction.user);
        if (!result.ok) return interaction.reply(ephemeral(errorEmbed(serviceError(result.code))));
        return interaction.reply({ embeds: [successEmbed(t('tickets.actions.unclaimed', { user: `${interaction.user}` }))] });
      }
      case 'delete':
        return interaction.reply(deleteConfirmationPayload());
      case 'confirmdelete': {
        await interaction.update({ embeds: [infoEmbed(t('tickets.buttons.delete'), t('tickets.actions.deleting'))], components: [] });
        return ticketService.deleteTicket(interaction.guild, interaction.channel, interaction.user);
      }
      case 'canceldelete':
        return interaction.update({ embeds: [infoEmbed(t('tickets.buttons.delete'), t('tickets.actions.deleteCancelled'))], components: [] });
      case 'rename':
        return interaction.showModal(renameModal());
      case 'renamemodal': {
        const result = await ticketService.renameTicket(interaction.guild, interaction.channel, interaction.fields.getTextInputValue('name'), interaction.user);
        if (!result.ok) return interaction.reply(ephemeral(errorEmbed(serviceError(result.code))));
        return interaction.reply({ embeds: [successEmbed(t('tickets.actions.renamed', { old: result.oldName, new: result.newName }))] });
      }
      case 'adduser':
      case 'removeuser':
        return interaction.reply(userSelectPayload(action));
      case 'adduserselect':
      case 'removeuserselect': {
        const user = interaction.users.first();
        if (!user) return interaction.deferUpdate();
        const service = action === 'adduserselect' ? ticketService.addUserToTicket : ticketService.removeUserFromTicket;
        const result = await service(interaction.guild, interaction.channel, user, interaction.user);
        if (!result.ok) {
          return interaction.update({ embeds: [errorEmbed(serviceError(result.code, { user: user.tag }))], components: [] });
        }
        const key = action === 'adduserselect' ? 'tickets.actions.userAdded' : 'tickets.actions.userRemoved';
        await interaction.update({ embeds: [successEmbed(t(key, { user: user.tag }))], components: [] });
        return interaction.channel.send({ embeds: [successEmbed(t(key, { user: `${user}` }))] }).catch(() => null);
      }
      default:
        return undefined;
    }
  },
};
