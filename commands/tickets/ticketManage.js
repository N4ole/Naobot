/**
 * Commandes de gestion d'un ticket depuis le salon courant (même famille) :
 * ticketclose, ticketopen, ticketrename, ticketdelete, ticketadd,
 * ticketremove, ticketmove, ticketclaim, ticketunclaim, ticketinfo.
 *
 * Les boutons du message d'accueil couvrent les mêmes actions ; ces commandes
 * restent utiles quand les boutons ne sont plus disponibles. La logique métier
 * vit dans services/tickets ; l'accès dans middlewares/tickets/ticketAccess.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ticketRepository = require('../../database/ticketRepository');
const ticketService = require('../../services/tickets/ticketService');
const categoryService = require('../../services/ticketCategories/ticketCategoryService');
const { checkTicketContext } = require('../../middlewares/tickets/ticketAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const ERROR_KEYS = {
  notTicket: 'tickets.errors.notTicketChannel',
  alreadyClosed: 'tickets.errors.alreadyClosed',
  notClosed: 'tickets.errors.notClosed',
  actionFailed: 'tickets.errors.actionFailed',
  invalidName: 'tickets.errors.invalidName',
  alreadyParticipant: 'tickets.errors.alreadyParticipant',
  notParticipant: 'tickets.errors.notParticipant',
  alreadyClaimed: 'tickets.errors.alreadyClaimed',
  alreadyClaimedSelf: 'tickets.errors.alreadyClaimedSelf',
  notClaimed: 'tickets.errors.notClaimed',
  sameCategory: 'tickets.errors.sameCategory',
};

function fail(ctx, code, vars = {}) {
  return ctx.reply({ embeds: [errorEmbed(t(ERROR_KEYS[code] ?? 'tickets.errors.actionFailed', vars))], ephemeral: true });
}

/** Garde commune : le salon doit être un ticket géré par le membre. */
function guard(ctx) {
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
    if (!guard(ctx)) return;
    const result = await ticketService.closeTicket(ctx.guild, ctx.channel, ctx.user);
    if (!result.ok) return fail(ctx, result.code);
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
    if (!guard(ctx)) return;
    const result = await ticketService.reopenTicket(ctx.guild, ctx.channel, ctx.user);
    if (!result.ok) return fail(ctx, result.code);
    return ctx.reply({ embeds: [successEmbed(t('tickets.actions.reopened', { user: `${ctx.user}` }))] });
  },
};

const ticketrename = {
  name: 'ticketrename',
  description: 'Renomme le ticket courant',
  usage: 'ticketrename <nom>',
  examples: ['ticketrename urgent-paiement'],
  aliases: [],
  cooldown: 3,
  args: [{ name: 'nom', type: 'string', required: true, rest: true, description: 'Nouveau nom du salon' }],
  async execute(ctx) {
    if (!guard(ctx)) return;
    const result = await ticketService.renameTicket(ctx.guild, ctx.channel, ctx.options.nom, ctx.user);
    if (!result.ok) return fail(ctx, result.code);
    return ctx.reply({ embeds: [successEmbed(t('tickets.actions.renamed', { old: result.oldName, new: result.newName }))] });
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
    if (!guard(ctx)) return;
    return ctx.reply({
      embeds: [infoEmbed(t('tickets.buttons.delete'), t('tickets.actions.deleteConfirm'))],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket:confirmdelete').setLabel(t('tickets.actions.deleteConfirmButton')).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ticket:canceldelete').setLabel(t('tickets.actions.deleteCancelButton')).setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  },
};

const ticketadd = {
  name: 'ticketadd',
  description: 'Ajoute un membre au ticket courant',
  usage: 'ticketadd <membre>',
  examples: ['ticketadd @Membre'],
  aliases: [],
  cooldown: 3,
  args: [{ name: 'membre', type: 'user', required: true, description: 'Le membre à ajouter' }],
  async execute(ctx) {
    if (!guard(ctx)) return;
    const result = await ticketService.addUserToTicket(ctx.guild, ctx.channel, ctx.options.membre, ctx.user);
    if (!result.ok) return fail(ctx, result.code, { user: ctx.options.membre.tag });
    return ctx.reply({ embeds: [successEmbed(t('tickets.actions.userAdded', { user: `${ctx.options.membre}` }))] });
  },
};

const ticketremove = {
  name: 'ticketremove',
  description: 'Retire un membre du ticket courant',
  usage: 'ticketremove <membre>',
  examples: ['ticketremove @Membre'],
  aliases: [],
  cooldown: 3,
  args: [{ name: 'membre', type: 'user', required: true, description: 'Le membre à retirer' }],
  async execute(ctx) {
    if (!guard(ctx)) return;
    const result = await ticketService.removeUserFromTicket(ctx.guild, ctx.channel, ctx.options.membre, ctx.user);
    if (!result.ok) return fail(ctx, result.code, { user: ctx.options.membre.tag });
    return ctx.reply({ embeds: [successEmbed(t('tickets.actions.userRemoved', { user: `${ctx.options.membre}` }))] });
  },
};

const ticketmove = {
  name: 'ticketmove',
  description: 'Transfère le ticket courant vers une autre catégorie',
  usage: 'ticketmove <identifiant_catégorie>',
  examples: ['ticketmove a1b2c3d4'],
  aliases: ['tickettransfer'],
  cooldown: 3,
  args: [{ name: 'categorie', type: 'string', required: true, description: 'Identifiant de la catégorie cible' }],
  async execute(ctx) {
    if (!guard(ctx)) return;
    const target = categoryService.getCategory(ctx.guild.id, ctx.options.categorie.trim());
    if (!target) return ctx.reply({ embeds: [errorEmbed(t('ticketCategories.errors.notFound', { id: ctx.options.categorie }))], ephemeral: true });
    const result = await ticketService.moveTicket(ctx.guild, ctx.channel, target, ctx.user);
    if (!result.ok) return fail(ctx, result.code);
    return ctx.reply({ embeds: [successEmbed(t('tickets.actions.moved', { category: target.name }))] });
  },
};

const ticketclaim = {
  name: 'ticketclaim',
  description: 'S’assigne le ticket courant',
  usage: 'ticketclaim',
  examples: ['ticketclaim'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    if (!guard(ctx)) return;
    const result = await ticketService.claimTicket(ctx.guild, ctx.channel, ctx.user);
    if (!result.ok) return fail(ctx, result.code, { by: result.by ? `<@${result.by}>` : '' });
    return ctx.reply({ embeds: [successEmbed(t('tickets.actions.claimed', { user: `${ctx.user}` }))] });
  },
};

const ticketunclaim = {
  name: 'ticketunclaim',
  description: 'Retire l’assignation du ticket courant',
  usage: 'ticketunclaim',
  examples: ['ticketunclaim'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    if (!guard(ctx)) return;
    const result = await ticketService.unclaimTicket(ctx.guild, ctx.channel, ctx.user);
    if (!result.ok) return fail(ctx, result.code);
    return ctx.reply({ embeds: [successEmbed(t('tickets.actions.unclaimed', { user: `${ctx.user}` }))] });
  },
};

const ticketinfo = {
  name: 'ticketinfo',
  description: 'Affiche les informations du ticket courant',
  usage: 'ticketinfo',
  examples: ['ticketinfo'],
  aliases: [],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    const ticket = ticketRepository.getTicket(ctx.guild.id, ctx.channel.id);
    if (!ticket) return ctx.reply({ embeds: [errorEmbed(t('tickets.errors.notTicketChannel'))], ephemeral: true });
    const category = categoryService.getCategory(ctx.guild.id, ticket.categoryId);
    return ctx.reply({ embeds: [ticketService.buildInfoEmbed(ticket, category)] });
  },
};

module.exports = [
  ticketclose,
  ticketopen,
  ticketrename,
  ticketdelete,
  ticketadd,
  ticketremove,
  ticketmove,
  ticketclaim,
  ticketunclaim,
  ticketinfo,
];
