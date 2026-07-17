/**
 * Sondages avancés : rendu du message (embed + composants), gestion des
 * votes selon le mode, calcul des résultats et fermeture (manuelle ou
 * automatique à l'expiration).
 *
 * Modes : single (classique, 1 vote), multiple (plusieurs), anonymous
 * (votes cachés, seuls les résultats agrégés au final), public (liste des
 * votants visible). Composant : boutons si ≤ 5 choix, sinon menu déroulant.
 * Extensible (sondages pondérés, par rôles, export) : le schéma accepte de
 * nouveaux champs, la persistance est isolée.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const repository = require('../../database/pollRepository');
const logService = require('../logging/logService');
const { infoEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const BUTTON_THRESHOLD = 5;
const BAR_LENGTH = 12;

const MODES = {
  single: { key: 'single', label: 'Classique (1 vote)', multi: false, anonymous: false, showVoters: false },
  multiple: { key: 'multiple', label: 'Multiple', multi: true, anonymous: false, showVoters: false },
  anonymous: { key: 'anonymous', label: 'Anonyme', multi: false, anonymous: true, showVoters: false },
  public: { key: 'public', label: 'Public (votants visibles)', multi: false, anonymous: false, showVoters: true },
};

function modeOf(poll) {
  return MODES[poll.mode] ?? MODES.single;
}

function totalVotes(poll) {
  return poll.options.reduce((sum, option) => sum + option.votes.length, 0);
}

function uniqueVoters(poll) {
  return new Set(poll.options.flatMap((option) => option.votes)).size;
}

// --- Rendu ---

function bar(ratio) {
  const filled = Math.round(ratio * BAR_LENGTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_LENGTH - filled);
}

function optionsSummary(poll, reveal) {
  const total = totalVotes(poll);
  return poll.options
    .map((option, index) => {
      if (!reveal) return `**${index + 1}.** ${option.label}`;
      const count = option.votes.length;
      const ratio = total > 0 ? count / total : 0;
      return `**${index + 1}.** ${option.label}\n${bar(ratio)} **${count}** (${Math.round(ratio * 100)} %)`;
    })
    .join('\n');
}

function buildEmbed(poll, creatorTag) {
  const mode = modeOf(poll);
  const closed = poll.status === 'closed';
  // En cours de vote, un sondage anonyme ne révèle pas les décomptes.
  const reveal = closed || !mode.anonymous;

  const embed = infoEmbed(`📊 ${poll.title}`, poll.description || null)
    .setColor(closed ? COLORS.LOG_NEUTRAL : COLORS.INFO)
    .addFields(
      { name: t('polls.field.options'), value: optionsSummary(poll, reveal) || '—' },
      { name: t('polls.field.votes'), value: `${totalVotes(poll)} (${uniqueVoters(poll)} ${t('polls.field.voters')})`, inline: true },
      { name: t('polls.field.mode'), value: mode.label, inline: true },
      { name: t('polls.field.status'), value: closed ? t('polls.status.closed') : t('polls.status.open'), inline: true },
    );
  if (!closed && poll.closeAt) {
    embed.addFields({ name: t('polls.field.remaining'), value: `<t:${Math.floor(poll.closeAt / 1000)}:R>`, inline: true });
  }
  embed.setFooter({ text: t('polls.field.by', { user: creatorTag ?? poll.creatorId }) });
  return embed;
}

function buildComponents(poll) {
  if (poll.status === 'closed') return [];
  if (poll.options.length <= BUTTON_THRESHOLD) {
    return [
      new ActionRowBuilder().addComponents(
        poll.options.map((option, index) =>
          new ButtonBuilder().setCustomId(`poll:vote:${poll.id}:${index}`).setLabel(`${index + 1}. ${option.label}`.slice(0, 80)).setStyle(ButtonStyle.Primary),
        ),
      ),
    ];
  }
  const mode = modeOf(poll);
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`poll:votesel:${poll.id}`)
        .setPlaceholder(t('polls.field.vote'))
        .setMinValues(0)
        .setMaxValues(mode.multi ? poll.options.length : 1)
        .addOptions(poll.options.map((option, index) => ({ label: option.label.slice(0, 100), value: String(index) }))),
    ),
  ];
}

function buildMessage(poll, creatorTag) {
  return { embeds: [buildEmbed(poll, creatorTag)], components: buildComponents(poll) };
}

function logPoll(guild, action, poll, extraFields = []) {
  return logService.log(
    guild,
    'sondages',
    logEventEmbed({
      title: `📊 ${t(`polls.logs.${action}`)}`,
      color: { created: COLORS.LOG_CREATE, closed: COLORS.LOG_DELETE, results: COLORS.INFO }[action] ?? COLORS.LOG_NEUTRAL,
      fields: [{ name: t('polls.field.id'), value: `\`${poll.id}\``, inline: true }, ...extraFields],
    }),
  );
}

// --- Publication / vote / fermeture ---

async function publishPoll(guild, draft, creator) {
  const channel = guild.channels.cache.get(draft.channelId);
  if (!channel?.isTextBased()) return { ok: false, code: 'noChannel' };

  const poll = {
    id: repository.generateId(),
    guildId: guild.id,
    channelId: channel.id,
    messageId: null,
    creatorId: creator.id,
    creatorTag: creator.tag,
    title: draft.title,
    description: draft.description,
    mode: draft.mode,
    options: draft.options.map((label) => ({ label, votes: [] })),
    createdAt: new Date().toISOString(),
    closeAt: draft.durationMs ? Date.now() + draft.durationMs : null,
    status: 'open',
  };
  const message = await channel.send(buildMessage(poll, creator.tag)).catch(() => null);
  if (!message) return { ok: false, code: 'sendFailed' };
  poll.messageId = message.id;
  repository.savePoll(poll);
  await logPoll(guild, 'created', poll, [{ name: t('polls.field.mode'), value: modeOf(poll).label, inline: true }]);
  return { ok: true, poll };
}

/** Applique le vote d'un utilisateur pour un ensemble d'indices de choix. */
function applyVote(poll, userId, indices) {
  const mode = modeOf(poll);
  if (mode.multi) {
    // Bascule chaque choix ciblé.
    for (const index of indices) {
      const votes = poll.options[index].votes;
      const at = votes.indexOf(userId);
      if (at === -1) votes.push(userId);
      else votes.splice(at, 1);
    }
  } else {
    // Un seul choix : retire des autres, place sur le choix ciblé.
    poll.options.forEach((option, index) => {
      const at = option.votes.indexOf(userId);
      if (index === indices[0]) {
        if (at === -1) option.votes.push(userId);
        else option.votes.splice(at, 1); // re-clic = annulation
      } else if (at !== -1) {
        option.votes.splice(at, 1);
      }
    });
  }
  repository.savePoll(poll);
}

/**
 * Fixe le vote d'un utilisateur à exactement l'ensemble d'indices fourni
 * (sémantique « ensemble », utilisée par les menus déroulants qui renvoient
 * toujours la sélection complète). Retire l'utilisateur des autres choix.
 */
function setVote(poll, userId, indices) {
  const wanted = new Set(indices);
  poll.options.forEach((option, index) => {
    const at = option.votes.indexOf(userId);
    if (wanted.has(index)) {
      if (at === -1) option.votes.push(userId);
    } else if (at !== -1) {
      option.votes.splice(at, 1);
    }
  });
  repository.savePoll(poll);
}

/** Choix pour lesquels un utilisateur a voté (libellés). */
function votesOf(poll, userId) {
  return poll.options.filter((option) => option.votes.includes(userId)).map((option) => option.label);
}

/** Ferme un sondage : statut, composants désactivés, résultats journalisés. */
async function closePoll(client, poll, byUser = null) {
  if (poll.status === 'closed') return { ok: false, code: 'alreadyClosed' };
  poll.status = 'closed';
  repository.savePoll(poll);

  const guild = client.guilds.cache.get(poll.guildId);
  const channel = guild?.channels.cache.get(poll.channelId);
  const message = poll.messageId ? await channel?.messages.fetch(poll.messageId).catch(() => null) : null;
  if (message) await message.edit(buildMessage(poll, poll.creatorTag)).catch(() => null);

  await logPoll(guild, 'closed', poll, [
    { name: t('polls.field.votes'), value: String(totalVotes(poll)), inline: true },
    ...(byUser ? [{ name: t('common.moderator'), value: `${byUser.tag}`, inline: true }] : []),
  ]);
  return { ok: true, poll };
}

/** Calcule les résultats détaillés (gagnants, égalités, pourcentages). */
function computeResults(poll) {
  const total = totalVotes(poll);
  const results = poll.options.map((option) => ({
    label: option.label,
    count: option.votes.length,
    percent: total > 0 ? Math.round((option.votes.length / total) * 100) : 0,
    voters: option.votes,
  }));
  const max = Math.max(0, ...results.map((result) => result.count));
  const winners = max > 0 ? results.filter((result) => result.count === max) : [];
  return { total, uniqueVoters: uniqueVoters(poll), results, winners, tie: winners.length > 1 };
}

// --- Planificateur d'expiration ---

async function sweep(client) {
  const now = Date.now();
  for (const poll of repository.getAllOpenPolls()) {
    if (poll.closeAt && poll.closeAt <= now) await closePoll(client, poll).catch(() => null);
  }
}

function startScheduler(client) {
  sweep(client).catch(() => null);
  const timer = setInterval(() => sweep(client).catch(() => null), 20 * 1000);
  timer.unref?.();
  return timer;
}

module.exports = {
  MODES,
  BUTTON_THRESHOLD,
  modeOf,
  totalVotes,
  bar,
  buildEmbed,
  buildComponents,
  buildMessage,
  publishPoll,
  applyVote,
  setVote,
  votesOf,
  closePoll,
  computeResults,
  sweep,
  startScheduler,
  logPoll,
  getPoll: repository.getPoll,
  getPolls: repository.getPolls,
  savePoll: repository.savePoll,
};
