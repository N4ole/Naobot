/**
 * Commande ticket : informations sur le ticket courant.
 * Ce fichier possède aussi tous les composants interactifs du système
 * (customId "ticket:*") : ouverture depuis les panneaux, fermeture,
 * réouverture, suppression (avec confirmation), renommage (modal),
 * ajout/retrait d'utilisateur (sélecteurs natifs).
 * La logique métier vit dans services/tickets/ticketService ; les accès
 * sont contrôlés par middlewares/tickets/ticketAccess.
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
const ticketTypes = require('../../utils/constants/ticketTypes');
const { checkTicketContext } = require('../../middlewares/tickets/ticketAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

function ephemeralError(interaction, message) {
  return interaction.reply({ embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral });
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
    unknownType: 'tickets.errors.unknownType',
  };
  return t(keys[code] ?? 'tickets.errors.actionFailed', vars);
}

/** Ouverture d'un ticket depuis un panneau (bouton public). */
async function handleOpen(interaction, type) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await ticketService.createTicket(interaction.guild, interaction.member, type);
  if (!result.ok) {
    const vars =
      result.code === 'alreadyOpen'
        ? { type: ticketTypes[type]?.label ?? type, channel: `<#${result.channelId}>` }
        : {};
    const message =
      result.code === 'alreadyOpen'
        ? t('tickets.errors.alreadyOpen', vars)
        : serviceError(result.code);
    return interaction.editReply({ embeds: [errorEmbed(message)] });
  }
  return interaction.editReply({
    embeds: [successEmbed(t('tickets.actions.created', { channel: `${result.channel}` }))],
  });
}

/** Confirmation de suppression (boutons partagés avec la commande ticketdelete). */
function deleteConfirmationPayload() {
  return {
    embeds: [infoEmbed(t('tickets.buttons.delete'), t('tickets.actions.deleteConfirm'))],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:confirmdelete')
          .setLabel(t('tickets.actions.deleteConfirmButton'))
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('ticket:canceldelete')
          .setLabel(t('tickets.actions.deleteCancelButton'))
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function renameModal() {
  return new ModalBuilder()
    .setCustomId('ticket:renamemodal')
    .setTitle(t('tickets.actions.renameModalTitle'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel(t('tickets.actions.renameModalLabel'))
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true),
      ),
    );
}

function userSelectPayload(action) {
  return {
    components: [
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`ticket:${action}select`)
          .setPlaceholder(
            t(action === 'adduser' ? 'tickets.actions.selectUserAdd' : 'tickets.actions.selectUserRemove'),
          )
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
      return ctx.reply({
        embeds: [errorEmbed(t('tickets.errors.notTicketChannel'))],
        ephemeral: true,
      });
    }
    const definition = ticketTypes[ticket.type];
    const embed = infoEmbed(
      t('tickets.welcome.title', { number: String(ticket.id).padStart(3, '0') }),
      null,
    ).addFields(
      {
        name: t('tickets.logs.type'),
        value: definition ? `${definition.emoji} ${definition.label}` : ticket.type,
        inline: true,
      },
      { name: t('tickets.welcome.creator'), value: `<@${ticket.userId}>`, inline: true },
      {
        name: t('tickets.welcome.status'),
        value:
          ticket.status === 'closed'
            ? t('tickets.welcome.statusClosed', {
                by: ticket.closedBy,
                at: Math.floor(Date.parse(ticket.closedAt) / 1000),
              })
            : t('tickets.welcome.statusOpen'),
        inline: true,
      },
      {
        name: t('tickets.welcome.openedAt'),
        value: `<t:${Math.floor(Date.parse(ticket.createdAt) / 1000)}:f>`,
        inline: true,
      },
      {
        name: t('tickets.info.participants'),
        value: ticket.participants.length
          ? ticket.participants.map((id) => `<@${id}>`).join(', ')
          : t('help.none'),
        inline: true,
      },
    );
    return ctx.reply({ embeds: [embed] });
  },

  /** Composants du système de tickets (customId "ticket:<action>[:extra]"). */
  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return;
    const [, action, extra] = interaction.customId.split(':');

    // Ouverture depuis un panneau : accessible à tous.
    if (action === 'open') {
      return handleOpen(interaction, extra);
    }

    // Toutes les autres actions : salon = ticket + créateur ou modérateur.
    const context = checkTicketContext(interaction.guild.id, interaction.channel.id, interaction.member);
    if (!context.ok) return ephemeralError(interaction, context.error);

    switch (action) {
      case 'close': {
        const result = await ticketService.closeTicket(interaction.guild, interaction.channel, interaction.user);
        if (!result.ok) return ephemeralError(interaction, serviceError(result.code));
        return interaction.reply({
          embeds: [successEmbed(t('tickets.actions.closed', { user: `${interaction.user}` }))],
        });
      }
      case 'reopen': {
        const result = await ticketService.reopenTicket(interaction.guild, interaction.channel, interaction.user);
        if (!result.ok) return ephemeralError(interaction, serviceError(result.code));
        return interaction.reply({
          embeds: [successEmbed(t('tickets.actions.reopened', { user: `${interaction.user}` }))],
        });
      }
      case 'delete':
        return interaction.reply({ ...deleteConfirmationPayload(), flags: MessageFlags.Ephemeral });
      case 'confirmdelete': {
        await interaction.update({
          embeds: [infoEmbed(t('tickets.buttons.delete'), t('tickets.actions.deleting'))],
          components: [],
        });
        return ticketService.deleteTicket(interaction.guild, interaction.channel, interaction.user);
      }
      case 'canceldelete':
        return interaction.update({
          embeds: [infoEmbed(t('tickets.buttons.delete'), t('tickets.actions.deleteCancelled'))],
          components: [],
        });
      case 'rename':
        return interaction.showModal(renameModal());
      case 'renamemodal': {
        const result = await ticketService.renameTicket(
          interaction.guild,
          interaction.channel,
          interaction.fields.getTextInputValue('name'),
          interaction.user,
        );
        if (!result.ok) return ephemeralError(interaction, serviceError(result.code));
        return interaction.reply({
          embeds: [successEmbed(t('tickets.actions.renamed', { old: result.oldName, new: result.newName }))],
        });
      }
      case 'adduser':
      case 'removeuser':
        return interaction.reply(userSelectPayload(action));
      case 'adduserselect':
      case 'removeuserselect': {
        const user = interaction.users.first();
        if (!user) return interaction.deferUpdate();
        const service =
          action === 'adduserselect' ? ticketService.addUserToTicket : ticketService.removeUserFromTicket;
        const result = await service(interaction.guild, interaction.channel, user, interaction.user);
        if (!result.ok) {
          return interaction.update({
            embeds: [errorEmbed(serviceError(result.code, { user: user.tag }))],
            components: [],
          });
        }
        const key = action === 'adduserselect' ? 'tickets.actions.userAdded' : 'tickets.actions.userRemoved';
        await interaction.update({
          embeds: [successEmbed(t(key, { user: user.tag }))],
          components: [],
        });
        // Confirmation visible dans le ticket (l'update est éphémère).
        return interaction.channel.send({ embeds: [successEmbed(t(key, { user: `${user}` }))] }).catch(() => null);
      }
      default:
        return undefined;
    }
  },
};
