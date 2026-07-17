const test = require('node:test');
const assert = require('node:assert/strict');

// --- Rappels : analyse des échéances (durées et dates) ---
const { parseWhen, normalizeDuration } = require('../utils/helpers/whenParser');

test('whenParser : durée relative en minutes', () => {
  const before = Date.now();
  const parsed = parseWhen('10m', 'Colis');
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.message, 'Colis');
  assert.ok(parsed.at - before >= 10 * 60 * 1000 - 50 && parsed.at - before <= 10 * 60 * 1000 + 1000);
});

test('whenParser : alias français j (jours) et sem (semaines)', () => {
  assert.equal(normalizeDuration('3j'), '3d');
  assert.equal(normalizeDuration('2sem'), '2w');
  const parsed = parseWhen('1w', 'x');
  assert.ok(parsed.at - Date.now() >= 7 * 24 * 60 * 60 * 1000 - 1000);
});

test('whenParser : date absolue JJ/MM/AAAA HH:mm avec message', () => {
  const parsed = parseWhen('25/12/2099', '18:00 Repas de Noël');
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.message, 'Repas de Noël');
  const date = new Date(parsed.at);
  assert.equal(date.getDate(), 25);
  assert.equal(date.getMonth(), 11);
  assert.equal(date.getHours(), 18);
});

test('whenParser : rejette une date passée et un format invalide', () => {
  assert.equal(parseWhen('01/01/2000').error, 'past');
  assert.equal(parseWhen('nawak').error, 'invalid');
  assert.equal(parseWhen('32/13/2099').error, 'invalidDate');
  assert.equal(parseWhen('').error, 'empty');
});

// --- Sondages : logique de vote et résultats ---
const pollService = require('../services/polls/pollService');

function makePoll(mode, labels) {
  return {
    id: `test-${mode}`,
    guildId: 'test-guild-polls',
    channelId: 'c',
    messageId: 'm',
    creatorId: 'u0',
    creatorTag: 'Créateur#0',
    title: 'T',
    description: '',
    mode,
    options: labels.map((label) => ({ label, votes: [] })),
    createdAt: new Date().toISOString(),
    closeAt: null,
    status: 'open',
  };
}

test('poll applyVote (classique) : un seul choix, re-clic annule, changement déplace', () => {
  const poll = makePoll('single', ['A', 'B', 'C']);
  pollService.applyVote(poll, 'u1', [0]);
  assert.deepEqual(poll.options[0].votes, ['u1']);
  // change d'avis → retiré de A, ajouté à B
  pollService.applyVote(poll, 'u1', [1]);
  assert.deepEqual(poll.options[0].votes, []);
  assert.deepEqual(poll.options[1].votes, ['u1']);
  // re-clic sur B → annulation
  pollService.applyVote(poll, 'u1', [1]);
  assert.deepEqual(poll.options[1].votes, []);
});

test('poll applyVote (multiple) : bascule chaque choix indépendamment', () => {
  const poll = makePoll('multiple', ['A', 'B', 'C']);
  pollService.applyVote(poll, 'u1', [0]);
  pollService.applyVote(poll, 'u1', [2]);
  assert.deepEqual(poll.options[0].votes, ['u1']);
  assert.deepEqual(poll.options[2].votes, ['u1']);
  pollService.applyVote(poll, 'u1', [0]); // retire A
  assert.deepEqual(poll.options[0].votes, []);
});

test('poll setVote (menu) : fixe exactement l’ensemble choisi', () => {
  const poll = makePoll('multiple', ['A', 'B', 'C']);
  pollService.setVote(poll, 'u1', [0, 1]);
  assert.deepEqual(pollService.votesOf(poll, 'u1'), ['A', 'B']);
  pollService.setVote(poll, 'u1', [2]); // remplace la sélection
  assert.deepEqual(pollService.votesOf(poll, 'u1'), ['C']);
  pollService.setVote(poll, 'u1', []); // vide la sélection
  assert.deepEqual(pollService.votesOf(poll, 'u1'), []);
});

test('poll computeResults : totaux, pourcentages et gagnant', () => {
  const poll = makePoll('single', ['A', 'B']);
  poll.options[0].votes = ['u1', 'u2', 'u3'];
  poll.options[1].votes = ['u4'];
  const results = pollService.computeResults(poll);
  assert.equal(results.total, 4);
  assert.equal(results.uniqueVoters, 4);
  assert.equal(results.results[0].percent, 75);
  assert.equal(results.tie, false);
  assert.equal(results.winners.length, 1);
  assert.equal(results.winners[0].label, 'A');
});

test('poll computeResults : détecte les égalités', () => {
  const poll = makePoll('single', ['A', 'B']);
  poll.options[0].votes = ['u1'];
  poll.options[1].votes = ['u2'];
  const results = pollService.computeResults(poll);
  assert.equal(results.tie, true);
  assert.equal(results.winners.length, 2);
});

test('poll MODES : les quatre modes de vote sont définis', () => {
  for (const key of ['single', 'multiple', 'anonymous', 'public']) {
    assert.ok(pollService.MODES[key], `mode manquant : ${key}`);
  }
  assert.equal(pollService.MODES.multiple.multi, true);
  assert.equal(pollService.MODES.anonymous.anonymous, true);
  assert.equal(pollService.MODES.public.showVoters, true);
});
