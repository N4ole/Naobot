/**
 * Commandes pollclose / pollresults / polllist (même famille, même fichier).
 *
 *  - pollclose  : fermeture anticipée (confirmation par boutons) + affichage
 *                 immédiat des résultats. Réservée au créateur ou à un
 *                 gestionnaire (middlewares/polls/pollAccess).
 *  - pollresults: résultats détaillés (totaux, pourcentages, gagnants,
 *                 égalités) ; pour les sondages non anonymes, liste paginée
 *                 des participants et de leurs votes.
 *  - polllist   : sondages actifs et terminés (créateurs, dates), paginés.
 *
 * La logique métier vit dans services/polls.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const pollService = require('../../services/polls/pollService');
const { canManagePoll } = require('../../middlewares/polls/pollAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

const PAGE_SIZE = 5;
const VOTERS_PAGE_SIZE = 10;

function ephemeral(embed) {
  return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

// ---------------------------------------------------------------------------
// Rendu des résultats
// ---------------------------------------------------------------------------

/** Ligne « gagnant(s) » / « égalité » à partir des résultats calculés. */
function winnersLine(computed) {
  if (computed.winners.length === 0 || computed.total === 0) return t('polls.results.noVotes');
  const labels = computed.winners.map((winner) => `**${winner.label}**`).join(', ');
  return computed.tie ? t('polls.results.tie', { choices: labels }) : t('polls.results.winner', { choice: labels });
}

/**
 * Vue des résultats d'un sondage (embed + pagination des votants).
 * `page` ne pagine que la liste des participants (sondages non anonymes).
 */
function resultsView(poll, page) {
  const computed = pollService.computeResults(poll);
  const mode = pollService.modeOf(poll);
  const closed = poll.status === 'closed';

  const lines = computed.results.map((result, index) => `**${index + 1}.** ${result.label}\n${pollService.bar(computed.total > 0 ? result.count / computed.total : 0)} **${result.count}** (${result.percent} %)`);

  const embed = infoEmbed(t('polls.results.title', { title: poll.title }), lines.join('\n'))
    .addFields(
      { name: t('polls.field.votes'), value: `${computed.total} (${computed.uniqueVoters} ${t('polls.field.voters')})`, inline: true },
      { name: t('polls.field.mode'), value: mode.label, inline: true },
      { name: t('polls.field.status'), value: closed ? t('polls.status.closed') : t('polls.status.open'), inline: true },
      { name: t('polls.results.outcome'), value: winnersLine(computed) },
    )
    .setFooter({ text: t('polls.field.by', { user: poll.creatorTag ?? poll.creatorId }) });

  // Participants (sondages non anonymes uniquement).
  let components = [];
  if (!mode.anonymous) {
    const voters = [];
    for (const userId of new Set(poll.options.flatMap((option) => option.votes))) {
      voters.push({ userId, choices: pollService.votesOf(poll, userId) });
    }
    if (voters.length === 0) {
      embed.addFields({ name: t('polls.results.participants'), value: t('polls.results.noParticipants') });
    } else {
      const pageCount = Math.ceil(voters.length / VOTERS_PAGE_SIZE);
      const current = Math.min(Math.max(page, 0), pageCount - 1);
      const slice = voters.slice(current * VOTERS_PAGE_SIZE, (current + 1) * VOTERS_PAGE_SIZE);
      const value = slice.map((voter) => t('polls.results.participantEntry', { user: `<@${voter.userId}>`, choices: voter.choices.join(', ') || '—' })).join('\n');
      embed.addFields({ name: t('polls.results.participants', { count: voters.length }), value });
      if (pageCount > 1) {
        embed.setFooter({ text: `${t('polls.field.by', { user: poll.creatorTag ?? poll.creatorId })} • Page ${current + 1}/${pageCount}` });
        components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pollresults:vpage:${poll.id}:${current}:prev`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
            new ButtonBuilder().setCustomId(`pollresults:vpage:${poll.id}:${current}:next`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pageCount - 1),
          ),
        ];
      }
    }
  } else {
    embed.addFields({ name: t('polls.results.participants'), value: t('polls.results.anonymous') });
  }

  return { embeds: [embed], components };
}

// ---------------------------------------------------------------------------
// pollclose
// ---------------------------------------------------------------------------

const pollclose = {
  name: 'pollclose',
  description: 'Ferme un sondage par anticipation (confirmation + résultats)',
  usage: 'pollclose <identifiant>',
  examples: ['pollclose a1b2c3'],
  aliases: ['closepoll'],
  cooldown: 3,
  args: [{ name: 'identifiant', type: 'string', required: true, description: "L'identifiant du sondage" }],
  async execute(ctx) {
    const poll = pollService.getPoll(ctx.guild.id, ctx.options.identifiant.toLowerCase());
    if (!poll) return ctx.reply({ embeds: [errorEmbed(t('polls.errors.notFound', { id: ctx.options.identifiant }))], ephemeral: true });
    if (!canManagePoll(ctx.member, poll)) return ctx.reply({ embeds: [errorEmbed(t('polls.errors.notYours'))], ephemeral: true });
    if (poll.status === 'closed') return ctx.reply({ embeds: [errorEmbed(t('polls.errors.alreadyClosed'))], ephemeral: true });

    return ctx.reply({
      embeds: [infoEmbed(t('polls.close.title'), t('polls.close.confirm', { id: poll.id, title: poll.title }))],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`pollclose:confirm:${ctx.user.id}:${poll.id}`).setLabel(t('polls.close.confirmButton')).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`pollclose:cancel:${ctx.user.id}:${poll.id}`).setLabel(t('polls.close.cancelButton')).setStyle(ButtonStyle.Secondary),
        ),
      ],
      ephemeral: true,
    });
  },
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return undefined;
    const [, decision, requesterId, pollId] = interaction.customId.split(':');
    if (interaction.user.id !== requesterId) return interaction.reply(ephemeral(errorEmbed(t('polls.errors.notYourSession'))));

    if (decision === 'cancel') {
      return interaction.update({ embeds: [infoEmbed(t('polls.close.title'), t('polls.close.cancelled'))], components: [] });
    }
    const poll = pollService.getPoll(interaction.guild.id, pollId);
    if (!poll) return interaction.update({ embeds: [errorEmbed(t('polls.errors.notFound', { id: pollId }))], components: [] });
    if (!canManagePoll(interaction.member, poll)) return interaction.reply(ephemeral(errorEmbed(t('polls.errors.notYours'))));

    const result = await pollService.closePoll(interaction.client, poll, interaction.user);
    if (!result.ok) return interaction.update({ embeds: [errorEmbed(t('polls.errors.alreadyClosed'))], components: [] });
    return interaction.update(resultsView(poll, 0));
  },
};

// ---------------------------------------------------------------------------
// pollresults
// ---------------------------------------------------------------------------

const pollresults = {
  name: 'pollresults',
  description: 'Affiche les résultats détaillés d’un sondage',
  usage: 'pollresults <identifiant>',
  examples: ['pollresults a1b2c3'],
  aliases: ['resultspoll'],
  cooldown: 3,
  args: [{ name: 'identifiant', type: 'string', required: true, description: "L'identifiant du sondage" }],
  async execute(ctx) {
    const poll = pollService.getPoll(ctx.guild.id, ctx.options.identifiant.toLowerCase());
    if (!poll) return ctx.reply({ embeds: [errorEmbed(t('polls.errors.notFound', { id: ctx.options.identifiant }))], ephemeral: true });
    await pollService.logPoll(ctx.guild, 'results', poll);
    return ctx.reply({ ...resultsView(poll, 0), ephemeral: true });
  },
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return undefined;
    const [, , pollId, rawPage, direction] = interaction.customId.split(':');
    const poll = pollService.getPoll(interaction.guild.id, pollId);
    if (!poll) return interaction.update({ embeds: [errorEmbed(t('polls.errors.notFound', { id: pollId }))], components: [] });
    const current = Number.parseInt(rawPage, 10) || 0;
    return interaction.update(resultsView(poll, direction === 'prev' ? current - 1 : current + 1));
  },
};

// ---------------------------------------------------------------------------
// polllist
// ---------------------------------------------------------------------------

function listPayload(guild, userId, page) {
  const polls = pollService.getPolls(guild.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (polls.length === 0) {
    return { embeds: [infoEmbed(t('polls.list.title', { count: 0 }), t('polls.list.empty'))], components: [] };
  }
  const pageCount = Math.ceil(polls.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  const lines = polls.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((poll) =>
    t('polls.list.entry', {
      id: poll.id,
      title: poll.title.slice(0, 80),
      status: poll.status === 'closed' ? t('polls.status.closed') : t('polls.status.open'),
      creator: poll.creatorTag ?? poll.creatorId,
      date: Math.floor(Date.parse(poll.createdAt) / 1000),
      votes: pollService.totalVotes(poll),
    }),
  );
  const embed = infoEmbed(t('polls.list.title', { count: polls.length }), lines.join('\n\n')).setFooter({ text: `Page ${current + 1}/${pageCount}` });
  const components =
    pageCount > 1
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`polllist:page:${userId}:${current}:prev`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(current === 0),
            new ButtonBuilder().setCustomId(`polllist:page:${userId}:${current}:next`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(current >= pageCount - 1),
          ),
        ]
      : [];
  return { embeds: [embed], components };
}

const polllist = {
  name: 'polllist',
  description: 'Liste les sondages du serveur (actifs et terminés)',
  usage: 'polllist',
  examples: ['polllist'],
  aliases: ['polls', 'sondages'],
  cooldown: 3,
  args: [],
  async execute(ctx) {
    return ctx.reply({ ...listPayload(ctx.guild, ctx.user.id, 0), ephemeral: true });
  },
  async handleComponent(interaction) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return undefined;
    const [, , requesterId, rawPage, direction] = interaction.customId.split(':');
    if (interaction.user.id !== requesterId) return interaction.deferUpdate();
    const current = Number.parseInt(rawPage, 10) || 0;
    return interaction.update(listPayload(interaction.guild, requesterId, direction === 'prev' ? current - 1 : current + 1));
  },
};

module.exports = [pollclose, pollresults, polllist];
