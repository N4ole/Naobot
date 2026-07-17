/**
 * Persistance des formulaires et de leurs soumissions
 * (database/data/forms.json).
 *
 * Structure : { [guildId]: { forms: { [id]: Form }, submissions: { [id]: Submission } } }
 * Form = { id, name, description, channelId, messageId, allowedRoleIds,
 *          questions: [ { id, type, label, required, maxLength, order, choices } ],
 *          createdBy, createdAt }
 * Submission = { id, formId, userId, userTag, at, status, answers:[{question,answer}],
 *                notes:[{by,text,at}] }
 *
 * Tout survit aux redémarrages ; les réponses sont consultables et prêtes à
 * être exportées ultérieurement.
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'forms.json'));

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function getGuildData(guildId) {
  return { forms: {}, submissions: {}, ...store.get(guildId, {}) };
}

function saveGuildData(guildId, data) {
  store.set(guildId, data);
}

function getForm(guildId, formId) {
  return getGuildData(guildId).forms[formId] ?? null;
}

function getForms(guildId) {
  return Object.values(getGuildData(guildId).forms);
}

function getFormByMessage(guildId, messageId) {
  return Object.values(getGuildData(guildId).forms).find((form) => form.messageId === messageId) ?? null;
}

function saveForm(guildId, form) {
  const data = getGuildData(guildId);
  data.forms[form.id] = form;
  saveGuildData(guildId, data);
}

function deleteForm(guildId, formId) {
  const data = getGuildData(guildId);
  if (!(formId in data.forms)) return false;
  delete data.forms[formId];
  saveGuildData(guildId, data);
  return true;
}

function saveSubmission(guildId, submission) {
  const data = getGuildData(guildId);
  data.submissions[submission.id] = submission;
  saveGuildData(guildId, data);
}

function getSubmission(guildId, submissionId) {
  return getGuildData(guildId).submissions[submissionId] ?? null;
}

module.exports = {
  generateId,
  getForm,
  getForms,
  getFormByMessage,
  saveForm,
  deleteForm,
  saveSubmission,
  getSubmission,
};
