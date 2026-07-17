/**
 * Commande poll : crée un sondage avancé via un assistant interactif
 * (menus + modal), puis le publie dans le salon choisi.
 *
 * Ce fichier porte aussi les composants du système (customId `poll:*`) :
 *  - assistant de création (réservé à « Gérer les messages ») : `w*` ;
 *  - vote (ouvert à tous) : `vote:<id>:<index>` (boutons) et
 *    `votesel:<id>` (menu déroulant).
 *
 * La logique métier vit dans services/polls ; l'accès dans
 * middlewares/polls/pollAccess.
 */
const { MessageFlags } = require('discord.js');
const pollService = require('../../services/polls/pollService');
const wizard = require('../../services/polls/pollWizard');
const { canManagePolls } = require('../../middlewares/polls/pollAccess');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds/embeds');
const { t } = require('../../utils/helpers/i18n');

function ephemeral(embed) {
  return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

module.exports = {
  name: 'poll',
  description: 'Crée un sondage avancé (assistant interactif : choix, modes, durée)',
  usage: 'poll [titre]',
  examples: ['poll', 'poll Quel jeu ce week-end ?'],
  aliases: ['sondage'],
  cooldown: 5,
  args: [{ name: 'titre', type: 'string', required: false, rest: true, description: 'Titre du sondage (optionnel)' }],
  async execute(ctx) {
    if (!canManagePolls(ctx.member)) {
      return ctx.reply({ embeds: [errorEmbed(t('polls.errors.noPermission'))], ephemeral: true });
    }
    wizard.startDraft(ctx.user.id, ctx.guild.id, ctx.options.titre?.trim());
    return ctx.reply({ ...wizard.buildPanel(wizard.getDraft(ctx.user.id)), ephemeral: true });
  },

  async handleComponent(interaction) {
    if (!interaction.inCachedGuild()) return undefined;
    const [, action] = interaction.customId.split(':');

    // --- Vote : ouvert à tous les membres ---
    if (action === 'vote') return this._handleVoteButton(interaction);
    if (action === 'votesel') return this._handleVoteSelect(interaction);

    // --- Assistant : réservé à « Gérer les messages » ---
    if (!canManagePolls(interaction.member)) {
      return interaction.reply(ephemeral(errorEmbed(t('polls.errors.noPermission'))));
    }
    return this._handleWizard(interaction, action);
  },

  // --- Vote ---
  async _finishVote(interaction, poll) {
    await interaction.message.edit(pollService.buildMessage(poll, poll.creatorTag)).catch(() => null);
    const chosen = pollService.votesOf(poll, interaction.user.id);
    const embed = successEmbed(chosen.length ? t('polls.vote.recorded', { choices: chosen.map((c) => `**${c}**`).join(', ') }) : t('polls.vote.cleared'));
    return interaction.reply(ephemeral(embed));
  },

  async _handleVoteButton(interaction) {
    const [, , pollId, rawIndex] = interaction.customId.split(':');
    const poll = pollService.getPoll(interaction.guild.id, pollId);
    if (!poll || poll.status === 'closed') return interaction.reply(ephemeral(errorEmbed(t('polls.errors.closedOrGone'))));
    pollService.applyVote(poll, interaction.user.id, [Number.parseInt(rawIndex, 10)]);
    return this._finishVote(interaction, poll);
  },

  async _handleVoteSelect(interaction) {
    const [, , pollId] = interaction.customId.split(':');
    const poll = pollService.getPoll(interaction.guild.id, pollId);
    if (!poll || poll.status === 'closed') return interaction.reply(ephemeral(errorEmbed(t('polls.errors.closedOrGone'))));
    pollService.setVote(poll, interaction.user.id, interaction.values.map((value) => Number.parseInt(value, 10)));
    return this._finishVote(interaction, poll);
  },

  // --- Assistant de création ---
  async _handleWizard(interaction, action) {
    const draft = wizard.getDraft(interaction.user.id);
    if (!draft) return interaction.reply(ephemeral(errorEmbed(t('polls.wizard.expired'))));

    switch (action) {
      case 'wchannel':
        draft.channelId = interaction.channels.first()?.id ?? draft.channelId;
        return interaction.update(wizard.buildPanel(draft));
      case 'wmode':
        draft.mode = pollService.MODES[interaction.values[0]] ? interaction.values[0] : draft.mode;
        return interaction.update(wizard.buildPanel(draft));
      case 'wedit':
        return interaction.showModal(wizard.editModal(draft));
      case 'weditmodal':
        wizard.applyEdit(draft, interaction.fields);
        return interaction.update(wizard.buildPanel(draft));
      case 'wcancel':
        wizard.clearDraft(interaction.user.id);
        return interaction.update({ embeds: [infoEmbed(t('polls.wizard.cancelledTitle'), t('polls.wizard.cancelled'))], components: [] });
      case 'wpublish':
        return this._handlePublish(interaction, draft);
      default:
        return undefined;
    }
  },

  async _handlePublish(interaction, draft) {
    if (draft.options.length < 2) return interaction.reply(ephemeral(errorEmbed(t('polls.wizard.needOptions'))));
    if (!draft.channelId) return interaction.reply(ephemeral(errorEmbed(t('polls.wizard.needChannel'))));

    await interaction.deferUpdate();
    const result = await pollService.publishPoll(interaction.guild, draft, interaction.user);
    if (!result.ok) {
      return interaction.editReply({ embeds: [errorEmbed(t(`polls.wizard.error.${result.code}`))], components: [] });
    }
    wizard.clearDraft(interaction.user.id);
    return interaction.editReply({
      embeds: [successEmbed(t('polls.wizard.published', { id: result.poll.id, channel: `<#${result.poll.channelId}>` }))],
      components: [],
    });
  },
};
