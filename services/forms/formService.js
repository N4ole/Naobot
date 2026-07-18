/**
 * Système de formulaires personnalisables.
 *
 * Construit le message public d'un formulaire (embed + bouton « Remplir »),
 * enregistre les soumissions et leur traitement (accepter / refuser / en
 * attente / commenter), et journalise dans la catégorie « formulaires ».
 * La construction/édition interactive vit dans services/forms/formWizard ;
 * la collecte des réponses (modals + menus) est pilotée par la commande.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const repository = require('../../database/formRepository');
const formQuestionTypes = require('../../utils/constants/formQuestionTypes');
const logService = require('../logs/logService');
const { infoEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { t } = require('../../utils/helpers/i18n');

const STATUSES = {
  pending: { label: 'En attente', emoji: '🟡', color: COLORS.WARNING },
  accepted: { label: 'Acceptée', emoji: '🟢', color: COLORS.SUCCESS },
  refused: { label: 'Refusée', emoji: '🔴', color: COLORS.ERROR },
  onhold: { label: 'En attente prolongée', emoji: '🔵', color: COLORS.INFO },
};

// --- Message public du formulaire ---

function buildFormMessage(form) {
  const embed = infoEmbed(`📝 ${form.name}`, form.description || null).addFields({
    name: t('forms.public.questions'),
    value: form.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((question, index) => `**${index + 1}.** ${question.label} *(${formQuestionTypes[question.type]?.label ?? question.type}${question.required ? ', ' + t('forms.public.required') : ''})*`)
      .join('\n')
      .slice(0, 1024) || t('forms.public.noQuestions'),
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`form:fill:${form.id}`).setLabel(t('forms.public.fill')).setEmoji('📝').setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

/** Publie (ou republie) le formulaire dans son salon et persiste le message. */
async function publishForm(guild, form) {
  const channel = guild.channels.cache.get(form.channelId);
  if (!channel?.isTextBased()) return { ok: false, code: 'noChannel' };

  if (form.messageId) {
    const old = await channel.messages.fetch(form.messageId).catch(() => null);
    await old?.delete().catch(() => null);
  }
  const message = await channel.send(buildFormMessage(form)).catch(() => null);
  if (!message) return { ok: false, code: 'sendFailed' };
  form.messageId = message.id;
  repository.saveForm(guild.id, form);
  return { ok: true, form };
}

async function logForm(guild, action, fields, user = null) {
  await logService.log(
    guild,
    'formulaires',
    logEventEmbed({
      title: `📝 ${t(`forms.logs.${action}`)}`,
      color: { created: COLORS.LOG_CREATE, deleted: COLORS.LOG_DELETE, submitted: COLORS.INFO, processed: COLORS.LOG_UPDATE }[action] ?? COLORS.LOG_NEUTRAL,
      user,
      fields,
    }),
  );
}

// --- Soumissions ---

function submissionEmbed(form, submission) {
  const status = STATUSES[submission.status] ?? STATUSES.pending;
  const embed = infoEmbed(t('forms.submission.title', { form: form.name }), null)
    .setColor(status.color)
    .addFields(
      { name: t('forms.submission.by'), value: `<@${submission.userId}> (${submission.userTag})`, inline: true },
      { name: t('forms.submission.status'), value: `${status.emoji} ${status.label}`, inline: true },
      { name: t('forms.submission.id'), value: `\`${submission.id}\``, inline: true },
      ...submission.answers.map((entry) => ({ name: entry.question.slice(0, 256), value: (entry.answer || '—').slice(0, 1024) })),
    );
  if (submission.notes.length) {
    embed.addFields({ name: t('forms.submission.notes'), value: submission.notes.map((note) => `<@${note.by}> : ${note.text}`).join('\n').slice(0, 1024) });
  }
  return embed;
}

function submissionComponents(submissionId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`form:act:accepted:${submissionId}`).setLabel(t('forms.action.accept')).setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`form:act:refused:${submissionId}`).setLabel(t('forms.action.refuse')).setEmoji('❌').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`form:act:onhold:${submissionId}`).setLabel(t('forms.action.hold')).setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`form:comment:${submissionId}`).setLabel(t('forms.action.comment')).setEmoji('💬').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/** Enregistre une soumission, la poste pour traitement, et journalise. */
async function createSubmission(guild, form, user, answers) {
  const submission = {
    id: repository.generateId(),
    formId: form.id,
    userId: user.id,
    userTag: user.tag,
    at: new Date().toISOString(),
    status: 'pending',
    answers,
    notes: [],
  };
  repository.saveSubmission(guild.id, submission);

  const channel = guild.channels.cache.get(form.channelId);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [submissionEmbed(form, submission)], components: submissionComponents(submission.id) }).catch(() => null);
  }
  await logForm(guild, 'submitted', [
    { name: t('forms.field.form'), value: form.name, inline: true },
    { name: t('forms.submission.id'), value: `\`${submission.id}\``, inline: true },
  ], user);
  return submission;
}

/** Change le statut d'une soumission (traitement modérateur). */
async function setSubmissionStatus(guild, submissionId, status, byUser) {
  const submission = repository.getSubmission(guild.id, submissionId);
  if (!submission) return { ok: false };
  submission.status = status;
  repository.saveSubmission(guild.id, submission);
  const form = repository.getForm(guild.id, submission.formId);
  await logForm(guild, 'processed', [
    { name: t('forms.submission.id'), value: `\`${submissionId}\``, inline: true },
    { name: t('forms.submission.status'), value: (STATUSES[status] ?? STATUSES.pending).label, inline: true },
  ], byUser);
  return { ok: true, submission, form };
}

/** Ajoute une note/commentaire de modérateur à une soumission. */
async function addNote(guild, submissionId, text, byUser) {
  const submission = repository.getSubmission(guild.id, submissionId);
  if (!submission) return { ok: false };
  submission.notes.push({ by: byUser.id, text, at: new Date().toISOString() });
  repository.saveSubmission(guild.id, submission);
  const form = repository.getForm(guild.id, submission.formId);
  return { ok: true, submission, form };
}

module.exports = {
  STATUSES,
  buildFormMessage,
  publishForm,
  submissionEmbed,
  submissionComponents,
  createSubmission,
  setSubmissionStatus,
  addNote,
  logForm,
  getForm: repository.getForm,
  getForms: repository.getForms,
  saveForm: repository.saveForm,
  deleteForm: repository.deleteForm,
};
