/**
 * Commandes ticketclose / ticketopen / ticketdelete (même famille, même
 * fichier) : gestion d'un ticket depuis le salon courant, même si les
 * boutons du message d'accueil ne sont plus disponibles.
 * La logique métier vit dans services/tickets/ticketService ; les accès
 * sont contrôlés par middlewares/tickets/ticketAccess.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ticketService = require('../../services/tickets/ticketService');
const { checkTicketContext } = require('../../middlewares/tickets/ticketAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const ERROR_KEYS = {
  notTicket: 'tickets.errors.notTicketChannel',
  alreadyClosed: 'tickets.errors.alreadyClosed',
  notClosed: 'tickets.errors.notClosed',
  actionFailed: 'tickets.errors.actionFailed',
};

function guardTicket(ctx) {
  const context = checkTicketContext(ctx.guild.id, ctx.channel.id, ctx.member);
  if (!context.ok) {
    ctx.reply({ embeds: [errorEmbed(context.error)], ephemeral: true });
    return null;
  }
  return context.ticket;
}

const ticketclose = {
  name: 'ticketclose',
  description: 'Ferme le ticket courant',
  usage: 'ticketclose',
  examples: ['ticketclose'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    if (!guardTicket(ctx)) return;
    const result = await ticketService.closeTicket(ctx.guild, ctx.channel, ctx.user);
    if (!result.ok) {
      return ctx.reply({ embeds: [errorEmbed(t(ERROR_KEYS[result.code]))], ephemeral: true });
    }
    return ctx.reply({ embeds: [successEmbed(t('tickets.actions.closed', { user: `${ctx.user}` }))] });
  },
};

const ticketopen = {
  name: 'ticketopen',
  description: 'Réouvre le ticket courant',
  usage: 'ticketopen',
  examples: ['ticketopen'],
  aliases: ['ticketreopen'],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    if (!guardTicket(ctx)) return;
    const result = await ticketService.reopenTicket(ctx.guild, ctx.channel, ctx.user);
    if (!result.ok) {
      return ctx.reply({ embeds: [errorEmbed(t(ERROR_KEYS[result.code]))], ephemeral: true });
    }
    return ctx.reply({ embeds: [successEmbed(t('tickets.actions.reopened', { user: `${ctx.user}` }))] });
  },
};

const ticketdelete = {
  name: 'ticketdelete',
  description: 'Supprime le ticket courant (avec confirmation)',
  usage: 'ticketdelete',
  examples: ['ticketdelete'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    if (!guardTicket(ctx)) return;
    // Les boutons de confirmation sont gérés par la commande ticket
    // (customId "ticket:confirmdelete" / "ticket:canceldelete").
    return ctx.reply({
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
    });
  },
};

module.exports = [ticketclose, ticketopen, ticketdelete];
