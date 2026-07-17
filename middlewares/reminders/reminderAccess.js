/**
 * Middleware des rappels : un rappel est **personnel**. Seul son
 * propriétaire peut le consulter, le modifier ou le supprimer.
 */
const reminderService = require('../../services/reminders/reminderService');
const { t } = require('../../utils/helpers/i18n');

/**
 * @returns {{ ok: true, reminder: object } | { ok: false, error: string }}
 */
function requireOwnReminder(reminderId, userId) {
  const reminder = reminderService.getReminder(reminderId);
  if (!reminder || reminder.userId !== userId) {
    return { ok: false, error: t('reminders.errors.notFound', { id: reminderId }) };
  }
  return { ok: true, reminder };
}

module.exports = { requireOwnReminder };
