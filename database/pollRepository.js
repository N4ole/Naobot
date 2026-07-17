/**
 * Persistance des sondages (database/data/polls.json).
 * Structure : { [guildId]: { [id]: Poll } }
 * Poll = { id, guildId, channelId, messageId, creatorId, title, description,
 *          mode, options: [ { label, votes: [userId] } ],
 *          createdAt, closeAt, status: 'open'|'closed' }
 *
 * mode ∈ { single (classique), multiple, anonymous (anonyme), public }.
 * Tout survit aux redémarrages : au démarrage, les sondages échus sont
 * fermés par le planificateur.
 */
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore } = require('./jsonStore');

const store = new JsonStore(path.join(__dirname, 'data', 'polls.json'));

function generateId() {
  return crypto.randomBytes(3).toString('hex');
}

function getGuildPolls(guildId) {
  return { ...store.get(guildId, {}) };
}

function getPoll(guildId, pollId) {
  return getGuildPolls(guildId)[pollId] ?? null;
}

function getPolls(guildId) {
  return Object.values(getGuildPolls(guildId));
}

function savePoll(poll) {
  const polls = getGuildPolls(poll.guildId);
  polls[poll.id] = poll;
  store.set(poll.guildId, polls);
}

/** Tous les sondages ouverts, tous serveurs confondus (planificateur). */
function getAllOpenPolls() {
  const result = [];
  for (const guildPolls of Object.values(store.all())) {
    for (const poll of Object.values(guildPolls)) if (poll.status === 'open') result.push(poll);
  }
  return result;
}

module.exports = { generateId, getGuildPolls, getPoll, getPolls, savePoll, getAllOpenPolls };
