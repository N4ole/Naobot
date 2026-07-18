/**
 * Rappels personnels : création, listing, édition, suppression et
 * planification. À l'échéance, un message privé est envoyé à l'utilisateur
 * (message d'origine, date de création, temps écoulé, lien vers le message
 * d'origine si disponible).
 *
 * Planificateur : un balayage périodique exécute les rappels échus — y
 * compris ceux arrivés à terme pendant que le bot était hors ligne (les
 * rappels sont persistés). Extensible : rappels récurrents/partagés
 * pourront s'ajouter au schéma sans toucher aux appelants.
 */
const repository = require('../../database/reminderRepository');
const logService = require('../logs/logService');
const { infoEmbed, logEventEmbed } = require('../../utils/embeds/embeds');
const COLORS = require('../../utils/constants/colors');
const { formatDuration } = require('../../utils/helpers/durationParser');
const { t } = require('../../utils/helpers/i18n');

const SWEEP_INTERVAL_MS = 20 * 1000;

function logReminder(guild, action, reminder, extraFields = []) {
  if (!guild) return Promise.resolve();
  return logService.log(
    guild,
    'rappels',
    logEventEmbed({
      title: `⏰ ${t(`reminders.logs.${action}`)}`,
      color: { created: COLORS.LOG_CREATE, edited: COLORS.LOG_UPDATE, deleted: COLORS.LOG_DELETE, executed: COLORS.INFO }[action] ?? COLORS.LOG_NEUTRAL,
      fields: [
        { name: t('reminders.field.id'), value: `\`${reminder.id}\``, inline: true },
        { name: t('reminders.field.user'), value: `<@${reminder.userId}>`, inline: true },
        ...extraFields,
      ],
    }),
  );
}

/** Crée un rappel. */
async function createReminder({ user, guild, channel, messageUrl }, executeAt, message) {
  const reminder = {
    id: repository.generateId(),
    userId: user.id,
    guildId: guild?.id ?? null,
    channelId: channel?.id ?? null,
    messageUrl: messageUrl ?? null,
    message,
    createdAt: new Date().toISOString(),
    executeAt,
  };
  repository.save(reminder);
  await logReminder(guild, 'created', reminder, [
    { name: t('reminders.field.executeAt'), value: `<t:${Math.floor(executeAt / 1000)}:F>`, inline: true },
  ]);
  return reminder;
}

function getUserReminders(userId) {
  return repository.getByUser(userId);
}

function getReminder(id) {
  return repository.getReminder(id);
}

/** Édite le texte et/ou la date d'un rappel (appartenant à l'utilisateur). */
async function editReminder(id, userId, { message, executeAt }, guild) {
  const reminder = repository.getReminder(id);
  if (!reminder || reminder.userId !== userId) return { ok: false, code: 'notFound' };
  if (message !== undefined) reminder.message = message;
  if (executeAt !== undefined) reminder.executeAt = executeAt;
  repository.save(reminder);
  await logReminder(guild, 'edited', reminder);
  return { ok: true, reminder };
}

/** Supprime un rappel (appartenant à l'utilisateur). */
async function deleteReminder(id, userId, guild) {
  const reminder = repository.getReminder(id);
  if (!reminder || reminder.userId !== userId) return { ok: false };
  repository.remove(id);
  await logReminder(guild, 'deleted', reminder);
  return { ok: true, reminder };
}

/** Envoie un rappel à échéance à son utilisateur, puis le supprime. */
async function fire(client, reminder) {
  const user = await client.users.fetch(reminder.userId).catch(() => null);
  if (user) {
    const embed = infoEmbed(t('reminders.dm.title'), reminder.message)
      .setColor(COLORS.INFO)
      .addFields(
        { name: t('reminders.field.createdAt'), value: `<t:${Math.floor(Date.parse(reminder.createdAt) / 1000)}:F>`, inline: true },
        { name: t('reminders.field.elapsed'), value: formatDuration(Date.now() - Date.parse(reminder.createdAt)), inline: true },
      );
    if (reminder.messageUrl) embed.addFields({ name: t('reminders.field.origin'), value: `[${t('reminders.field.jump')}](${reminder.messageUrl})` });
    await user.send({ embeds: [embed] }).catch(() => null);
  }
  const guild = reminder.guildId ? client.guilds.cache.get(reminder.guildId) : null;
  await logReminder(guild, 'executed', reminder);
  repository.remove(reminder.id);
}

/** Exécute tous les rappels échus. */
async function sweep(client) {
  const now = Date.now();
  for (const reminder of Object.values(repository.getAll())) {
    if (reminder.executeAt <= now) await fire(client, reminder).catch(() => null);
  }
}

/** Démarre le planificateur périodique (appelé au ready). */
function startScheduler(client) {
  sweep(client).catch(() => null);
  const timer = setInterval(() => sweep(client).catch(() => null), SWEEP_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

module.exports = {
  SWEEP_INTERVAL_MS,
  createReminder,
  getUserReminders,
  getReminder,
  editReminder,
  deleteReminder,
  sweep,
  startScheduler,
};
